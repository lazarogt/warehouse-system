export const DATABASE_SCHEMA_VERSION = 4;
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
  {
    version: 3,
    name: "003_active_warehouses",
    statements: [
      `
        ALTER TABLE warehouses
        ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
      `,
      `
        UPDATE warehouses
        SET is_active = 1
        WHERE is_active IS NULL;
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_warehouses_active_name
        ON warehouses (is_active, name);
      `,
    ],
  },
  {
    version: 4,
    name: "004_stock_movement_reason_metadata",
    statements: [
      `
        CREATE TABLE stock_movements_v4 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          warehouse_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('IN', 'OUT')),
          reason TEXT NOT NULL CHECK (reason IN ('dispatch', 'transfer', 'adjustment')),
          quantity INTEGER NOT NULL CHECK (quantity > 0),
          metadata TEXT,
          date TEXT NOT NULL DEFAULT (${SQLITE_NOW_EXPRESSION}),
          FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
          FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT
        );
      `,
      `
        INSERT INTO stock_movements_v4 (id, product_id, warehouse_id, type, reason, quantity, metadata, date)
        SELECT
          id,
          product_id,
          COALESCE(
            warehouse_id,
            (
              SELECT id
              FROM warehouses
              ORDER BY id ASC
              LIMIT 1
            )
          ),
          CASE UPPER(type)
            WHEN 'IN' THEN 'IN'
            ELSE 'OUT'
          END,
          'adjustment',
          quantity,
          NULL,
          date
        FROM stock_movements;
      `,
      `
        DROP TABLE stock_movements;
      `,
      `
        ALTER TABLE stock_movements_v4 RENAME TO stock_movements;
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
        CREATE INDEX IF NOT EXISTS idx_stock_movements_warehouse_id
        ON stock_movements (warehouse_id);
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_stock_movements_product_warehouse
        ON stock_movements (product_id, warehouse_id);
      `,
      `
        CREATE INDEX IF NOT EXISTS idx_stock_movements_reason_date
        ON stock_movements (reason, date);
      `,
    ],
  },
] as const;
