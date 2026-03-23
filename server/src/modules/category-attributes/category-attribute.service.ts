import type { PoolClient } from "pg";
import type { CategoryAttribute, CategoryAttributeInput, CategoryAttributeType } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { query, withTransaction } from "../../config/db";
import {
  normalizeDynamicAttributeValue,
  parseStoredAttributeValueForValidation,
} from "../products/product-attribute.utils";

type EntityIdRow = { id: number };
type CategoryAttributeRow = CategoryAttribute;
type AttributeValueRow = { value: string };
type CountRow = { total: number };

const assertCategoryExists = async (categoryId: number, client?: PoolClient) => {
  const result = client
    ? await client.query<EntityIdRow>("SELECT id FROM categories WHERE id = $1;", [categoryId])
    : await query<EntityIdRow>("SELECT id FROM categories WHERE id = $1;", [categoryId]);

  if (!result.rows[0]) {
    throw new AppError(404, "Category not found.");
  }
};

const validateAttributeOptions = (input: CategoryAttributeInput) => {
  const options = input.options ?? null;

  if (input.type === "select" || input.type === "multiselect") {
    if (!options || options.length === 0) {
      throw new AppError(400, "options are required for select and multiselect attributes.");
    }

    if (new Set(options).size !== options.length) {
      throw new AppError(400, "options must not contain duplicates.");
    }

    return options;
  }

  return options;
};

const categoryAttributeQuery = `
  SELECT
    ca.id,
    ca.category_id AS "categoryId",
    ca.key,
    ca.label,
    ca.type,
    ca.required,
    CASE
      WHEN jsonb_typeof(ca.options) = 'array' THEN ARRAY(
        SELECT jsonb_array_elements_text(ca.options)
      )
      ELSE NULL
    END AS options,
    ca.sort_order AS "sortOrder",
    ca.active,
    COALESCE(usage_stats.usage_count, 0)::int AS "usageCount",
    ca.created_at AS "createdAt",
    ca.updated_at AS "updatedAt"
  FROM category_attributes ca
  LEFT JOIN (
    SELECT category_attribute_id, COUNT(*)::int AS usage_count
    FROM product_attributes
    GROUP BY category_attribute_id
  ) usage_stats ON usage_stats.category_attribute_id = ca.id
`;

const mapCategoryAttributeRow = `
  id,
  "categoryId",
  key,
  label,
  type,
  required,
  options,
  "sortOrder",
  active,
  "usageCount",
  "createdAt",
  "updatedAt"
`;

const ensureAttributeBelongsToCategory = async (
  categoryId: number,
  attributeId: number,
  client?: PoolClient,
) => {
  const result = client
    ? await client.query<EntityIdRow>(
        "SELECT id FROM category_attributes WHERE id = $1 AND category_id = $2;",
        [attributeId, categoryId],
      )
    : await query<EntityIdRow>(
        "SELECT id FROM category_attributes WHERE id = $1 AND category_id = $2;",
        [attributeId, categoryId],
      );

  if (!result.rows[0]) {
    throw new AppError(404, "Category attribute not found.");
  }
};

const getCategoryAttributeById = async (
  categoryId: number,
  attributeId: number,
  client?: PoolClient,
) => {
  const sql = `
    ${categoryAttributeQuery}
    WHERE ca.category_id = $1
      AND ca.id = $2;
  `;

  const result = client
    ? await client.query<CategoryAttributeRow>(sql, [categoryId, attributeId])
    : await query<CategoryAttributeRow>(sql, [categoryId, attributeId]);

  return result.rows[0] ?? null;
};

const assertAttributeValuesRemainCompatible = async (
  categoryId: number,
  attributeId: number,
  input: CategoryAttributeInput,
  client: PoolClient,
) => {
  const nextDefinition: CategoryAttribute = {
    id: attributeId,
    categoryId,
    key: input.key,
    label: input.label,
    type: input.type,
    required: input.required,
    options: input.options ?? null,
    sortOrder: input.sortOrder ?? 0,
    active: input.active ?? true,
    usageCount: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };

  if (input.required) {
    const missingRequiredResult = await client.query<CountRow>(
      `
        SELECT COUNT(*)::int AS total
        FROM products p
        LEFT JOIN product_attributes pa
          ON pa.product_id = p.id
         AND pa.category_attribute_id = $2
        WHERE p.category_id = $1
          AND pa.id IS NULL;
      `,
      [categoryId, attributeId],
    );

    if ((missingRequiredResult.rows[0]?.total ?? 0) > 0) {
      throw new AppError(
        400,
        "Cannot mark the attribute as required while existing products are missing a value.",
      );
    }
  }

  const valuesResult = await client.query<AttributeValueRow>(
    `
      SELECT pa.value
      FROM product_attributes pa
      JOIN products p ON p.id = pa.product_id
      WHERE p.category_id = $1
        AND pa.category_attribute_id = $2;
    `,
    [categoryId, attributeId],
  );

  for (const row of valuesResult.rows) {
    const parsedValue = parseStoredAttributeValueForValidation(nextDefinition, row.value);
    normalizeDynamicAttributeValue(nextDefinition, parsedValue);
  }
};

export const listCategoryAttributes = async (categoryId: number) => {
  await assertCategoryExists(categoryId);

  const result = await query<CategoryAttributeRow>(
    `
      ${categoryAttributeQuery}
      WHERE ca.category_id = $1
      ORDER BY sort_order ASC, id ASC;
    `,
    [categoryId],
  );

  return result.rows;
};

export const listActiveCategoryAttributes = async (
  categoryId: number,
  client?: PoolClient,
) => {
  const result = client
    ? await client.query<CategoryAttributeRow>(
        `
          ${categoryAttributeQuery}
          WHERE ca.category_id = $1
            AND ca.active = TRUE
          ORDER BY sort_order ASC, id ASC;
        `,
        [categoryId],
      )
    : await query<CategoryAttributeRow>(
        `
          ${categoryAttributeQuery}
          WHERE ca.category_id = $1
            AND ca.active = TRUE
          ORDER BY sort_order ASC, id ASC;
        `,
        [categoryId],
      );

  return result.rows;
};

const ensureUniqueCategoryAttributeKey = async (
  categoryId: number,
  key: string,
  excludeId?: number,
  client?: PoolClient,
) => {
  const result = client
    ? await client.query<EntityIdRow>(
        `
          SELECT id
          FROM category_attributes
          WHERE category_id = $1
            AND key = $2
            AND ($3::bigint IS NULL OR id <> $3);
        `,
        [categoryId, key, excludeId ?? null],
      )
    : await query<EntityIdRow>(
        `
          SELECT id
          FROM category_attributes
          WHERE category_id = $1
            AND key = $2
            AND ($3::bigint IS NULL OR id <> $3);
        `,
        [categoryId, key, excludeId ?? null],
      );

  if (result.rows[0]) {
    throw new AppError(400, "key must be unique within the category.");
  }
};

const normalizeOptions = (options: string[] | null, type: CategoryAttributeType) => {
  const normalizedOptions = validateAttributeOptions({
    key: "temp",
    label: "temp",
    type,
    required: false,
    options,
    sortOrder: 0,
    active: true,
  });

  if (type === "select" || type === "multiselect") {
    return JSON.stringify(normalizedOptions);
  }

  return options ? JSON.stringify(options) : null;
};

export const createCategoryAttribute = async (categoryId: number, input: CategoryAttributeInput) => {
  return withTransaction(async (client) => {
    await assertCategoryExists(categoryId, client);
    await ensureUniqueCategoryAttributeKey(categoryId, input.key, undefined, client);

    const result = await client.query<EntityIdRow>(
      `
        INSERT INTO category_attributes (
          category_id,
          key,
          label,
          type,
          required,
          options,
          sort_order,
          active
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
        RETURNING id;
      `,
      [
        categoryId,
        input.key,
        input.label,
        input.type,
        input.required,
        normalizeOptions(input.options ?? null, input.type),
        input.sortOrder ?? 0,
        input.active ?? true,
      ],
    );

    const createdAttribute = await getCategoryAttributeById(categoryId, result.rows[0].id, client);

    if (!createdAttribute) {
      throw new AppError(500, "Unable to load created category attribute.");
    }

    return createdAttribute;
  });
};

export const updateCategoryAttribute = async (
  categoryId: number,
  attributeId: number,
  input: CategoryAttributeInput,
) => {
  return withTransaction(async (client) => {
    await assertCategoryExists(categoryId, client);
    await ensureAttributeBelongsToCategory(categoryId, attributeId, client);
    await ensureUniqueCategoryAttributeKey(categoryId, input.key, attributeId, client);
    const currentAttribute = await getCategoryAttributeById(categoryId, attributeId, client);

    if (!currentAttribute) {
      throw new AppError(404, "Category attribute not found.");
    }

    if (currentAttribute.usageCount > 0) {
      await assertAttributeValuesRemainCompatible(categoryId, attributeId, input, client);
    }

    await client.query(
      `
        UPDATE category_attributes
        SET
          key = $3,
          label = $4,
          type = $5,
          required = $6,
          options = $7::jsonb,
          sort_order = $8,
          active = $9,
          updated_at = NOW()
        WHERE id = $1
          AND category_id = $2
        RETURNING id;
      `,
      [
        attributeId,
        categoryId,
        input.key,
        input.label,
        input.type,
        input.required,
        normalizeOptions(input.options ?? null, input.type),
        input.sortOrder ?? 0,
        input.active ?? true,
      ],
    );

    const updatedAttribute = await getCategoryAttributeById(categoryId, attributeId, client);

    if (!updatedAttribute) {
      throw new AppError(500, "Unable to load updated category attribute.");
    }

    return updatedAttribute;
  });
};

export const deleteCategoryAttribute = async (categoryId: number, attributeId: number) => {
  await assertCategoryExists(categoryId);
  const attribute = await getCategoryAttributeById(categoryId, attributeId);

  if (!attribute) {
    throw new AppError(404, "Category attribute not found.");
  }

  if (attribute.usageCount > 0) {
    throw new AppError(
      409,
      "Attribute is in use by existing products. Deactivate it instead of deleting it.",
    );
  }

  await query("DELETE FROM category_attributes WHERE id = $1 AND category_id = $2;", [
    attributeId,
    categoryId,
  ]);
};
