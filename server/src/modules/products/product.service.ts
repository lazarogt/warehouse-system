import type { PoolClient } from "pg";
import type {
  Product,
  ProductAttributeInput,
  ProductFilters,
  ProductInput,
  ProductListResponse,
} from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { activeFilter } from "../../common/soft-delete";
import { query, withTransaction } from "../../config/db";
import { listActiveCategoryAttributes } from "../category-attributes/category-attribute.service";
import { normalizeDynamicAttributeValue } from "./product-attribute.utils";

type ProductRow = Product;
type EntityIdRow = { id: number };
type ProductIdentityRow = { id: number; categoryId: number };

const productAttributesJson = (productIdReference: string) => `
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', pa.id,
          'productId', pa.product_id,
          'categoryAttributeId', pa.category_attribute_id,
          'key', ca.key,
          'label', ca.label,
          'type', ca.type,
          'required', ca.required,
          'options', ca.options,
          'sortOrder', ca.sort_order,
          'value', pa.value,
          'createdAt', pa.created_at,
          'updatedAt', pa.updated_at
        )
        ORDER BY ca.sort_order ASC, ca.id ASC
      )
      FROM product_attributes pa
      JOIN category_attributes ca ON ca.id = pa.category_attribute_id
      WHERE pa.product_id = ${productIdReference}
    ),
    '[]'::json
  ) AS attributes
`;

const productListingCte = `
  WITH product_stock AS (
    SELECT
      p.id,
      p.name,
      p.sku,
      p.barcode,
      p.description,
      p.category_id AS "categoryId",
      c.name AS "categoryName",
      p.price::float8 AS "price",
      p.minimum_stock AS "minimumStock",
      COALESCE(SUM(ws.quantity), 0)::int AS "currentStock",
      p.created_at AS "createdAt",
      p.updated_at AS "updatedAt"
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN warehouse_stock ws ON ws.product_id = p.id
      WHERE ${activeFilter("p")}
      AND (
        $1::text IS NULL
        OR p.name ILIKE '%' || $1 || '%'
        OR COALESCE(p.sku, '') ILIKE '%' || $1 || '%'
        OR COALESCE(p.barcode, '') ILIKE '%' || $1 || '%'
        OR c.name ILIKE '%' || $1 || '%'
      )
      AND ($2::bigint IS NULL OR p.category_id = $2)
      AND (
        $3::text IS NULL
        OR EXISTS (
          SELECT 1
          FROM product_attributes pa
          JOIN category_attributes ca ON ca.id = pa.category_attribute_id
          WHERE pa.product_id = p.id
            AND ca.key = $3
            AND ($4::text IS NULL OR pa.value ILIKE '%' || $4 || '%')
        )
      )
    GROUP BY
      p.id,
      c.name
  )
`;

const ensureCategoryExists = async (categoryId: number, client?: PoolClient) => {
  const result = client
    ? await client.query<EntityIdRow>("SELECT id FROM categories WHERE id = $1;", [categoryId])
    : await query<EntityIdRow>("SELECT id FROM categories WHERE id = $1;", [categoryId]);

  if (!result.rows[0]) {
    throw new AppError(400, "categoryId must reference an existing category.");
  }
};

const ensureUniqueSku = async (sku: string | null | undefined, excludeProductId?: number, client?: PoolClient) => {
  if (!sku) {
    return;
  }

  const sql = `
    SELECT id
    FROM products
    WHERE sku = $1
      AND ${activeFilter()}
      AND ($2::bigint IS NULL OR id <> $2);
  `;
  const values = [sku, excludeProductId ?? null];
  const result = client
    ? await client.query<EntityIdRow>(sql, values)
    : await query<EntityIdRow>(sql, values);

  if (result.rows[0]) {
    throw new AppError(400, "sku must be unique.");
  }
};

const ensureUniqueBarcode = async (
  barcode: string | null | undefined,
  excludeProductId?: number,
  client?: PoolClient,
) => {
  if (!barcode) {
    return;
  }

  const sql = `
    SELECT id
    FROM products
    WHERE barcode = $1
      AND ${activeFilter()}
      AND ($2::bigint IS NULL OR id <> $2);
  `;
  const values = [barcode, excludeProductId ?? null];
  const result = client
    ? await client.query<EntityIdRow>(sql, values)
    : await query<EntityIdRow>(sql, values);

  if (result.rows[0]) {
    throw new AppError(400, "barcode must be unique.");
  }
};

const validateProductAttributes = async (
  categoryId: number,
  attributes: ProductAttributeInput[] | undefined,
  client?: PoolClient,
) => {
  const definitions = await listActiveCategoryAttributes(categoryId, client);
  const definitionMap = new Map(definitions.map((definition) => [definition.id, definition]));
  const seenAttributeIds = new Set<number>();
  const sanitizedAttributes: Array<{ categoryAttributeId: number; value: string }> = [];

  for (const attribute of attributes ?? []) {
    if (seenAttributeIds.has(attribute.categoryAttributeId)) {
      throw new AppError(400, "Dynamic attributes cannot contain duplicate categoryAttributeId values.");
    }

    const definition = definitionMap.get(attribute.categoryAttributeId);

    if (!definition) {
      throw new AppError(
        400,
        "categoryAttributeId must reference an active attribute of the selected category.",
      );
    }

    const normalizedValue = normalizeDynamicAttributeValue(definition, attribute.value);
    seenAttributeIds.add(attribute.categoryAttributeId);

    if (normalizedValue !== null) {
      sanitizedAttributes.push({
        categoryAttributeId: attribute.categoryAttributeId,
        value: normalizedValue,
      });
    }
  }

  for (const definition of definitions) {
    if (definition.required && !seenAttributeIds.has(definition.id)) {
      throw new AppError(400, `${definition.label} is required.`);
    }
  }

  return sanitizedAttributes;
};

const syncProductAttributes = async (
  client: PoolClient,
  productId: number,
  categoryId: number,
  attributes: Array<{ categoryAttributeId: number; value: string }>,
) => {
  const attributeIds = attributes.map((attribute) => attribute.categoryAttributeId);

  if (attributeIds.length === 0) {
    await client.query(
      `
        DELETE FROM product_attributes
        WHERE product_id = $1
          AND category_attribute_id IN (
            SELECT id
            FROM category_attributes
            WHERE category_id = $2
              AND active = TRUE
          );
      `,
      [productId, categoryId],
    );
    return;
  }

  await client.query(
    `
      DELETE FROM product_attributes
      WHERE product_id = $1
        AND category_attribute_id IN (
          SELECT id
          FROM category_attributes
          WHERE category_id = $2
            AND active = TRUE
        )
        AND NOT (category_attribute_id = ANY($3::bigint[]));
    `,
    [productId, categoryId, attributeIds],
  );

  const values: unknown[] = [];
  const placeholders = attributes.map((attribute, index) => {
    const baseIndex = index * 3;
    values.push(productId, attribute.categoryAttributeId, attribute.value);
    return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3})`;
  });

  await client.query(
    `
      INSERT INTO product_attributes (product_id, category_attribute_id, value)
      VALUES ${placeholders.join(", ")}
      ON CONFLICT (product_id, category_attribute_id)
      DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = NOW();
    `,
    values,
  );
};

export const listProducts = async (filters: ProductFilters): Promise<ProductListResponse> => {
  const page = Math.max(filters.page ?? 1, 1);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 10, 1), 100);
  const offset = (page - 1) * pageSize;
  const search = filters.search?.trim() ?? null;
  const categoryId = filters.categoryId ?? null;
  const attributeKey = filters.attributeKey?.trim() ?? null;
  const attributeValue = filters.attributeValue?.trim() ?? null;
  const maximumMinimumStock = filters.maximumMinimumStock ?? null;
  const maximumCurrentStock = filters.maximumCurrentStock ?? null;

  const totalResult = await query<{ total: number }>(
    `
      ${productListingCte}
      SELECT COUNT(*)::int AS total
      FROM product_stock
      WHERE ($5::int IS NULL OR "minimumStock" <= $5)
        AND ($6::int IS NULL OR "currentStock" <= $6);
    `,
    [search, categoryId, attributeKey, attributeValue, maximumMinimumStock, maximumCurrentStock],
  );

  const result = await query<ProductRow>(
    `
      ${productListingCte}
      SELECT
        product_stock.*,
        ${productAttributesJson("product_stock.id")}
      FROM product_stock
      WHERE ($5::int IS NULL OR "minimumStock" <= $5)
        AND ($6::int IS NULL OR "currentStock" <= $6)
      ORDER BY id DESC
      LIMIT $7 OFFSET $8;
    `,
    [
      search,
      categoryId,
      attributeKey,
      attributeValue,
      maximumMinimumStock,
      maximumCurrentStock,
      pageSize,
      offset,
    ],
  );

  return {
    items: result.rows,
    total: totalResult.rows[0]?.total ?? 0,
    page,
    pageSize,
  };
};

export const getProductById = async (id: number, client?: PoolClient) => {
  const sql = `
    SELECT
      p.id,
      p.name,
      p.sku,
      p.barcode,
      p.description,
      p.category_id AS "categoryId",
      c.name AS "categoryName",
      p.price::float8 AS "price",
      p.minimum_stock AS "minimumStock",
      COALESCE(SUM(ws.quantity), 0)::int AS "currentStock",
      ${productAttributesJson("p.id")},
      p.created_at AS "createdAt",
      p.updated_at AS "updatedAt"
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN warehouse_stock ws ON ws.product_id = p.id
    WHERE p.id = $1
      AND ${activeFilter("p")}
    GROUP BY
      p.id,
      c.name;
  `;
  const result = client
    ? await client.query<ProductRow>(sql, [id])
    : await query<ProductRow>(sql, [id]);

  return result.rows[0] ?? null;
};

export const createProduct = async (input: ProductInput) => {
  return withTransaction(async (client) => {
    await ensureCategoryExists(input.categoryId, client);
    await ensureUniqueSku(input.sku, undefined, client);
    await ensureUniqueBarcode(input.barcode, undefined, client);
    const sanitizedAttributes = await validateProductAttributes(
      input.categoryId,
      input.attributes,
      client,
    );

    const result = await client.query<{ id: number }>(
      `
        INSERT INTO products (name, sku, barcode, description, category_id, price, minimum_stock)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id;
      `,
      [
        input.name,
        input.sku ?? null,
        input.barcode ?? null,
        input.description ?? null,
        input.categoryId,
        input.price,
        input.minimumStock,
      ],
    );

    const productId = result.rows[0]?.id;

    if (!productId) {
      throw new AppError(500, "Unable to create product.");
    }

    await syncProductAttributes(client, productId, input.categoryId, sanitizedAttributes);

    const createdProduct = await getProductById(productId, client);

    if (!createdProduct) {
      throw new AppError(500, "Unable to load created product.");
    }

    return createdProduct;
  });
};

export const updateProduct = async (id: number, input: ProductInput) => {
  return withTransaction(async (client) => {
    const currentProductResult = await client.query<ProductIdentityRow>(
      `
        SELECT id, category_id AS "categoryId"
        FROM products
        WHERE id = $1
          AND ${activeFilter()};
      `,
      [id],
    );

    const currentProduct = currentProductResult.rows[0];

    if (!currentProduct) {
      throw new AppError(404, "Product not found.");
    }

    await ensureCategoryExists(input.categoryId, client);
    await ensureUniqueSku(input.sku, id, client);
    await ensureUniqueBarcode(input.barcode, id, client);
    const sanitizedAttributes = await validateProductAttributes(
      input.categoryId,
      input.attributes,
      client,
    );

    await client.query(
      `
        UPDATE products
        SET
          name = $2,
          sku = $3,
          barcode = $4,
          description = $5,
          category_id = $6,
          price = $7,
          minimum_stock = $8,
          updated_at = NOW()
        WHERE id = $1
          AND ${activeFilter()}
        RETURNING id;
      `,
      [
        id,
        input.name,
        input.sku ?? null,
        input.barcode ?? null,
        input.description ?? null,
        input.categoryId,
        input.price,
        input.minimumStock,
      ],
    );

    if (currentProduct.categoryId !== input.categoryId) {
      await client.query(
        `
          DELETE FROM product_attributes
          WHERE product_id = $1
            AND category_attribute_id NOT IN (
              SELECT id
              FROM category_attributes
              WHERE category_id = $2
            );
        `,
        [id, input.categoryId],
      );
    }

    await syncProductAttributes(client, id, input.categoryId, sanitizedAttributes);

    const updatedProduct = await getProductById(id, client);

    if (!updatedProduct) {
      throw new AppError(500, "Unable to load updated product.");
    }

    return updatedProduct;
  });
};

export const deleteProduct = async (id: number) => {
  const result = await query<EntityIdRow>(
    `
      UPDATE products
      SET
        is_deleted = TRUE,
        deleted_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND ${activeFilter()}
      RETURNING id;
    `,
    [id],
  );

  if (result.rows[0]) {
    return;
  }

  const existingProduct = await query<{ id: number; isDeleted: boolean }>(
    `
      SELECT
        id,
        is_deleted AS "isDeleted"
      FROM products
      WHERE id = $1;
    `,
    [id],
  );

  if (!existingProduct.rows[0]) {
    throw new AppError(404, "Product not found.");
  }

  throw new AppError(409, "Product is already deleted.");
};

export const lookupProduct = async (input: { sku?: string; barcode?: string }) => {
  const sql = input.barcode
    ? `
        SELECT id
        FROM products
        WHERE barcode = $1
          AND ${activeFilter()}
        LIMIT 1;
      `
    : `
        SELECT id
        FROM products
        WHERE LOWER(sku) = LOWER($1)
          AND ${activeFilter()}
        LIMIT 1;
      `;
  const lookupValue = input.barcode?.trim() ?? input.sku?.trim();
  const result = await query<EntityIdRow>(sql, [lookupValue]);
  const productId = result.rows[0]?.id;

  if (!productId) {
    throw new AppError(404, "Product not found.");
  }

  return getProductById(productId);
};
