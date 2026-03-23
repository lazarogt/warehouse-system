import type { LowStockAlert } from "../../../../shared/src";
import { activeFilter } from "../../common/soft-delete";
import { query } from "../../config/db";

type LowStockAlertRow = LowStockAlert;

export const listLowStockAlerts = async () => {
  const result = await query<LowStockAlertRow>(
    `
      SELECT
        p.id,
        p.name,
        p.description,
        p.category_id AS "categoryId",
        c.name AS "categoryName",
        p.price::float8 AS "price",
        p.minimum_stock AS "minimumStock",
        COALESCE(SUM(ws.quantity), 0)::int AS "currentStock",
        GREATEST(p.minimum_stock - COALESCE(SUM(ws.quantity), 0)::int, 0) AS shortage,
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt"
      FROM products p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN warehouse_stock ws ON ws.product_id = p.id
      WHERE ${activeFilter("p")}
      GROUP BY
        p.id,
        c.name
      HAVING COALESCE(SUM(ws.quantity), 0)::int <= p.minimum_stock
      ORDER BY "currentStock" ASC, p.name ASC;
    `,
  );

  return result.rows;
};
