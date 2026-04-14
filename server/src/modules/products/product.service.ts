import type { DatabaseClient } from "../../lib/db";
import type {
  Product,
  ProductAttribute,
  ProductAttributeInput,
  ProductFilters,
  ProductInput,
  ProductListResponse,
} from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { activeFilter } from "../../common/soft-delete";
import { query, withTransaction } from "../../lib/db";
import { listActiveCategoryAttributes } from "../category-attributes/category-attribute.service";
import { normalizeDynamicAttributeValue } from "./product-attribute.utils";

type ProductRow = Omit<Product, "attributes">;
type EntityIdRow = { id: number };
type ProductIdentityRow = { id: number; categoryId: number };
type ProductAttributeRow = Omit<ProductAttribute, "required" | "options"> & {
  required: number | boolean;
  options: string | null;
};

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

const parseOptions = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : null;
  } catch {
    return null;
  }
};

const mapProductAttributeRow = (row: ProductAttributeRow): ProductAttribute => ({
  ...row,
  required: row.required === true || row.required === 1,
  options: parseOptions(row.options),
});

const loadAttributesByProductIds = async (
  productIds: number[],
  client?: DatabaseClient,
) => {
  if (productIds.length === 0) {
    return new Map<number, ProductAttribute[]>();
  }

  const placeholders = productIds.map(() => "?").join(", ");
  const sql = `
    SELECT
      pa.id,
      pa.product_id AS "productId",
      pa.category_attribute_id AS "categoryAttributeId",
      ca.key,
      ca.label,
      ca.type,
      ca.required,
      ca.options,
      ca.sort_order AS "sortOrder",
      pa.value,
      pa.created_at AS "createdAt",
      pa.updated_at AS "updatedAt"
    FROM product_attributes pa
    JOIN category_attributes ca ON ca.id = pa.category_attribute_id
    WHERE pa.product_id IN (${placeholders})
    ORDER BY pa.product_id ASC, ca.sort_order ASC, ca.id ASC;
  `;
  const result = client
    ? await client.query<ProductAttributeRow>(sql, productIds)
    : await query<ProductAttributeRow>(sql, productIds);

  const attributesByProductId = new Map<number, ProductAttribute[]>();

  for (const row of result.rows) {
    const attributes = attributesByProductId.get(row.productId) ?? [];
    attributes.push(mapProductAttributeRow(row));
    attributesByProductId.set(row.productId, attributes);
  }

  return attributesByProductId;
};

const hydrateProducts = async (rows: ProductRow[], client?: DatabaseClient): Promise<Product[]> => {
  const attributesByProductId = await loadAttributesByProductIds(
    rows.map((row) => row.id),
    client,
  );

  return rows.map((row) => ({
    ...row,
    attributes: attributesByProductId.get(row.id) ?? [],
  }));
};

const ensureCategoryExists = async (categoryId: number, client?: DatabaseClient) => {
  const result = client
    ? await client.query<EntityIdRow>("SELECT id FROM categories WHERE id = $1;", [categoryId])
    : await query<EntityIdRow>("SELECT id FROM categories WHERE id = $1;", [categoryId]);

  if (!result.rows[0]) {
    throw new AppError(400, "categoryId must reference an existing category.");
  }
};

const ensureUniqueSku = async (sku: string | null | undefined, excludeProductId?: number, client?: DatabaseClient) => {
  if (!sku) {
    return;
  }

  const sql = `
    SELECT id
    FROM products
    WHERE sku = $1
      AND ${activeFilter()}
      AND ($2 IS NULL OR id <> $2);
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
  client?: DatabaseClient,
) => {
  if (!barcode) {
    return;
  }

  const sql = `
    SELECT id
    FROM products
    WHERE barcode = $1
      AND ${activeFilter()}
      AND ($2 IS NULL OR id <> $2);
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
  client?: DatabaseClient,
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
  client: DatabaseClient,
  productId: number,
  categoryId: number,
  attributes: Array<{ categoryAttributeId: number; value: string }>,
) => {
  const attributeIds = attributes.map((attribute) => attribute.categoryAttributeId);
  const activeAttributeRows = await client.query<{ id: number }>(
    `
      SELECT id
      FROM category_attributes
      WHERE category_id = $1
        AND active = TRUE;
    `,
    [categoryId],
  );
  const activeAttributeIds = activeAttributeRows.rows.map((row) => row.id);

  if (attributeIds.length === 0) {
    for (const activeAttributeId of activeAttributeIds) {
      await client.query(
        `
          DELETE FROM product_attributes
          WHERE product_id = $1
            AND category_attribute_id = $2;
        `,
        [productId, activeAttributeId],
      );
    }
    return;
  }

  for (const activeAttributeId of activeAttributeIds) {
    if (attributeIds.includes(activeAttributeId)) {
      continue;
    }

    await client.query(
      `
        DELETE FROM product_attributes
        WHERE product_id = $1
          AND category_attribute_id = $2;
      `,
      [productId, activeAttributeId],
    );
  }

  for (const attribute of attributes) {
    await client.query(
      `
        INSERT INTO product_attributes (product_id, category_attribute_id, value)
        VALUES ($1, $2, $3)
        ON CONFLICT (product_id, category_attribute_id)
        DO UPDATE SET
          value = excluded.value,
          updated_at = NOW();
      `,
      [productId, attribute.categoryAttributeId, attribute.value],
    );
  }
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
        product_stock.*
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
    items: await hydrateProducts(result.rows),
    total: totalResult.rows[0]?.total ?? 0,
    page,
    pageSize,
  };
};

export const getProductById = async (id: number, client?: DatabaseClient) => {
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

  if (!result.rows[0]) {
    return null;
  }

  return (await hydrateProducts([result.rows[0]], client))[0] ?? null;
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
