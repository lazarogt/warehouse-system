import type { Category, CategoryInput } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { query } from "../../config/db";

type CategoryRow = Category;

export const listCategories = async () => {
  const result = await query<CategoryRow>(`
    SELECT
      id,
      name,
      description,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM categories
    ORDER BY id;
  `);

  return result.rows;
};

export const getCategoryById = async (id: number) => {
  const result = await query<CategoryRow>(
    `
      SELECT
        id,
        name,
        description,
        created_at AS "createdAt",
        updated_at AS "updatedAt"
      FROM categories
      WHERE id = $1;
    `,
    [id],
  );

  return result.rows[0] ?? null;
};

export const createCategory = async (input: CategoryInput) => {
  const result = await query<CategoryRow>(
    `
      INSERT INTO categories (name, description)
      VALUES ($1, $2)
      RETURNING
        id,
        name,
        description,
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `,
    [input.name, input.description ?? null],
  );

  return result.rows[0];
};

export const updateCategory = async (id: number, input: CategoryInput) => {
  const result = await query<CategoryRow>(
    `
      UPDATE categories
      SET
        name = $2,
        description = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING
        id,
        name,
        description,
        created_at AS "createdAt",
        updated_at AS "updatedAt";
    `,
    [id, input.name, input.description ?? null],
  );

  if (!result.rows[0]) {
    throw new AppError(404, "Category not found.");
  }

  return result.rows[0];
};

export const deleteCategory = async (id: number) => {
  const result = await query("DELETE FROM categories WHERE id = $1 RETURNING id;", [id]);

  if (!result.rows[0]) {
    throw new AppError(404, "Category not found.");
  }
};

