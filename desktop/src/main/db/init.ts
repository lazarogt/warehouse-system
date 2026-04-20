import path from "node:path";
import { createWarehouseDataService, type WarehouseDataService } from "../services/warehouse-data-service";
import { createDesktopDatabase, type DatabaseLogger, type DesktopDatabase } from "./database";
import { DATABASE_MIGRATIONS, DATABASE_SCHEMA_VERSION } from "./schema";

export const DATABASE_FILENAME = "warehouse.db";

export type DesktopDatabaseRuntime = {
  readonly database: DesktopDatabase;
  readonly databasePath: string;
  readonly services: {
    readonly warehouseData: WarehouseDataService;
  };
  close(): void;
};

type InitializeDesktopDatabaseOptions = {
  isDevelopment: boolean;
  logger?: DatabaseLogger;
  userDataPath: string;
};

const DEFAULT_LOGGER: DatabaseLogger = {
  info(message, metadata) {
    console.info(message, metadata ?? {});
  },
  warn(message, metadata) {
    console.warn(message, metadata ?? {});
  },
  error(message, metadata) {
    console.error(message, metadata ?? {});
  },
};

function getCurrentSchemaVersion(database: DesktopDatabase): number {
  return Number(database.pragma<number>("user_version", { simple: true }) ?? 0);
}

function runMigrations(database: DesktopDatabase, logger: DatabaseLogger): void {
  const currentVersion = getCurrentSchemaVersion(database);

  if (currentVersion > DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `Database schema version ${currentVersion} is newer than supported version ${DATABASE_SCHEMA_VERSION}.`,
    );
  }

  for (const migration of DATABASE_MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    logger.info("[desktop:db] applying migration", {
      name: migration.name,
      version: migration.version,
    });

    database.transaction((transactionDatabase) => {
      for (const statement of migration.statements) {
        transactionDatabase.exec(statement);
      }

      transactionDatabase.pragma(`user_version = ${migration.version}`);
    }, "immediate");
  }

  const finalVersion = getCurrentSchemaVersion(database);

  if (finalVersion !== DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `Database schema initialization ended at version ${finalVersion}, expected ${DATABASE_SCHEMA_VERSION}.`,
    );
  }
}

function seedDevelopmentData(
  warehouseData: WarehouseDataService,
  logger: DatabaseLogger,
): void {
  const counts = warehouseData.getSummaryCounts();

  if (counts.users === 0) {
    warehouseData.createUser({ name: "Desktop Admin", role: "admin" });
    warehouseData.createUser({ name: "Warehouse Manager", role: "manager" });
    warehouseData.createUser({ name: "Floor Operator", role: "operator" });
  }

  if (counts.products === 0 && counts.stockMovements === 0) {
    const keyboard = warehouseData.createProduct({
      name: "Mechanical Keyboard",
      sku: "KB-100",
      price: 89.9,
      stock: 0,
    });
    const mouse = warehouseData.createProduct({
      name: "Wireless Mouse",
      sku: "MS-200",
      price: 34.5,
      stock: 0,
    });
    const monitor = warehouseData.createProduct({
      name: "24in Monitor",
      sku: "MN-300",
      price: 179.99,
      stock: 0,
    });

    warehouseData.recordStockMovement({
      productId: keyboard.id,
      quantity: 25,
      type: "in",
    });
    warehouseData.recordStockMovement({
      productId: mouse.id,
      quantity: 40,
      type: "in",
    });
    warehouseData.recordStockMovement({
      productId: monitor.id,
      quantity: 12,
      type: "in",
    });
  }

  logger.info("[desktop:db] development seed complete", warehouseData.getSummaryCounts());
}

export function initializeDesktopDatabase(
  options: InitializeDesktopDatabaseOptions,
): DesktopDatabaseRuntime {
  const logger = options.logger ?? DEFAULT_LOGGER;
  const databasePath = path.join(options.userDataPath, DATABASE_FILENAME);
  const database = createDesktopDatabase({
    databasePath,
    logger,
  });

  try {
    runMigrations(database, logger);

    const warehouseData = createWarehouseDataService({
      database,
      logger,
    });

    if (options.isDevelopment) {
      seedDevelopmentData(warehouseData, logger);
    }

    logger.info("[desktop:db] ready", {
      mode: options.isDevelopment ? "dev" : "prod",
      path: databasePath,
      schemaVersion: DATABASE_SCHEMA_VERSION,
    });

    return {
      database,
      databasePath,
      services: {
        warehouseData,
      },
      close() {
        database.close();
      },
    };
  } catch (error) {
    logger.error("[desktop:db] initialization failed", {
      message: error instanceof Error ? error.message : "Unknown database initialization error",
      path: databasePath,
    });
    database.close();
    throw error;
  }
}
