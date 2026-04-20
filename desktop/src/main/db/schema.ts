export const DATABASE_SCHEMA_VERSION = 1;
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
] as const;
