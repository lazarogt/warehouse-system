import fs from "node:fs";
import path from "node:path";
import { execute, getDatabase, queryAll, transaction } from "./db";

type MigrationRecord = {
  name: string;
};

const MIGRATIONS = ["001_initial.sql"] as const;
const MIGRATIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  );
`;

const resetTableOrder = [
  "auth_sessions",
  "critical_event_logs",
  "dispatch_items",
  "dispatches",
  "cycle_count_items",
  "cycle_counts",
  "stock_adjustments",
  "stock_transfers",
  "stock_movements",
  "product_attributes",
  "category_attributes",
  "warehouse_location_stock",
  "warehouse_stock",
  "warehouse_locations",
  "users",
  "products",
  "categories",
  "warehouses",
] as const;

const resolveMigrationFile = (name: string) => {
  const candidates = [
    path.resolve(process.cwd(), "src/lib/migrations", name),
    path.resolve(process.cwd(), "server/src/lib/migrations", name),
    path.resolve(__dirname, "migrations", name),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Migration file not found: ${name}`);
};

const loadMigrationSql = (name: string) => {
  return fs.readFileSync(resolveMigrationFile(name), "utf8");
};

const ensureSchemaObjects = () => {
  for (const migrationName of MIGRATIONS) {
    getDatabase().exec(loadMigrationSql(migrationName));
  }
};

export const runMigrations = async () => {
  execute(MIGRATIONS_TABLE_SQL);
  ensureSchemaObjects();

  const appliedMigrations = new Set(
    queryAll<MigrationRecord>("SELECT name FROM _migrations ORDER BY name ASC").map(
      (migration) => migration.name,
    ),
  );

  for (const migrationName of MIGRATIONS) {
    if (appliedMigrations.has(migrationName)) {
      continue;
    }

    const migrationSql = loadMigrationSql(migrationName);
    transaction((tx) => {
      getDatabase().exec(migrationSql);
      tx.execute(
        `
          INSERT INTO _migrations (name, applied_at)
          VALUES (?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
        `,
        [migrationName],
      );
    }).immediate();
  }
};

export const resetDatabase = async () => {
  ensureSchemaObjects();
  const existingTables = new Set(
    queryAll<{ name: string }>(
      `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table';
      `,
    ).map((row) => row.name),
  );

  transaction((tx) => {
    tx.execute("PRAGMA foreign_keys = OFF");

    for (const tableName of resetTableOrder) {
      if (!existingTables.has(tableName)) {
        continue;
      }

      tx.execute(`DELETE FROM ${tableName}`);
    }

    tx.execute(
      `
        DELETE FROM sqlite_sequence
        WHERE name IN (${resetTableOrder.map(() => "?").join(", ")});
      `,
      resetTableOrder.filter((tableName) => existingTables.has(tableName)),
    );
    tx.execute("PRAGMA foreign_keys = ON");
  }).immediate();
};
