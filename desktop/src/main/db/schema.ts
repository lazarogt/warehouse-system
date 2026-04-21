export const DATABASE_SCHEMA_VERSION = 2;
export const SQLITE_NOW_EXPRESSION = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

export type DatabaseMigration = {
  readonly name: string;
  readonly statements: readonly string[];
  readonly version: number;
};

export const DATABASE_MIGRATIONS: readonly DatabaseMigration[] = [
  {
    version: 1,
    name: "001_initial_schema",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          sku TEXT NOT NULL UNIQUE,
          price REAL NOT NULL CHECK (price >= 0),
          stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
          created_at TEXT NOT NULL DEFAULT (${SQLITE_NOW_EXPRESSION})
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'operator'))
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS stock_movements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('in', 'out')),
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          date TEXT NOT NULL DEFAULT (${SQLITE_NOW_EXPRESSION}),
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_products_sku
        ON products (sku);
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id
        ON stock_movements (product_id);
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_stock_movements_date
        ON stock_movements (date);
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_users_role
        ON users (role);
      `,
    ],
  },
  {
    version: 2,
    name: "002_multi_warehouse_stock",
    statements: [
      `
        CREATE TABLE IF NOT EXISTS warehouses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          location TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (${SQLITE_NOW_EXPRESSION})
        );
      `,
      `
        INSERT INTO warehouses (name, location, created_at)
        SELECT
          'Primary Warehouse',
          'Default location',
          ${SQLITE_NOW_EXPRESSION}
        WHERE NOT EXISTS (
          SELECT 1
          FROM warehouses
        );
      `,
      `
        CREATE TABLE IF NOT EXISTS warehouse_stock (
          warehouse_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
          PRIMARY KEY (warehouse_id, product_id),
          FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        );
      `,
      `
        ALTER TABLE stock_movements
        ADD COLUMN warehouse_id INTEGER REFERENCES warehouses(id) ON DELETE RESTRICT;
      `,
      `
        UPDATE stock_movements
        SET warehouse_id = (
          SELECT id
          FROM warehouses
          ORDER BY id ASC
          LIMIT 1
        )
        WHERE warehouse_id IS NULL;
      `,
      `
        INSERT INTO warehouse_stock (warehouse_id, product_id, quantity)
        SELECT
          (
            SELECT id
            FROM warehouses
            ORDER BY id ASC
            LIMIT 1
          ),
          products.id,
          products.stock
        FROM products
        WHERE NOT EXISTS (
          SELECT 1
          FROM warehouse_stock
          WHERE warehouse_stock.warehouse_id = (
            SELECT id
            FROM warehouses
            ORDER BY id ASC
            LIMIT 1
          )
            AND warehouse_stock.product_id = products.id
        );
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_id
        ON stock_movements (warehouse_id);
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_stock_movements_product_warehouse
        ON stock_movements (product_id, warehouse_id);
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_warehouse_stock_product_id
        ON warehouse_stock (product_id);
      `,
    ],
  },
] as const;
