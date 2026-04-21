import type { DatabaseLogger, DesktopDatabase } from "../db/database";

const USER_ROLES = new Set(["admin", "manager", "operator"] as const);
const MOVEMENT_TYPES = new Set(["in", "out"] as const);
const DEFAULT_WAREHOUSE_NAME = "Primary Warehouse";
const DEFAULT_WAREHOUSE_LOCATION = "Default location";

type UserRole = "admin" | "manager" | "operator";
type StockMovementType = "in" | "out";

export class DatabaseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseValidationError";
  }
}

export type ProductRecord = {
  createdAt: string;
  id: number;
  name: string;
  price: number;
  sku: string;
  stock: number;
};

export type WarehouseRecord = {
  createdAt: string;
  id: number;
  location: string;
  name: string;
};

export type WarehouseStockRecord = {
  productId: number;
  quantity: number;
  warehouseId: number;
};

export type StockMovementRecord = {
  date: string;
  id: number;
  productId: number;
  quantity: number;
  type: StockMovementType;
  warehouseId: number;
};

export type UserRecord = {
  id: number;
  name: string;
  role: UserRole;
};

export type CreateProductInput = {
  createdAt?: string | Date;
  name: string;
  price: number;
  sku: string;
  stock?: number;
};

export type CreateUserInput = {
  name: string;
  role: UserRole;
};

export type CreateWarehouseInput = {
  createdAt?: string | Date;
  location: string;
  name: string;
};

export type GetStockMovementsInput = {
  productId?: number;
  warehouseId?: number;
};

export type RecordStockMovementInput = {
  date?: string | Date;
  productId: number;
  quantity: number;
  type: StockMovementType;
  warehouseId?: number;
};

export type SetWarehouseStockInput = {
  productId: number;
  quantity: number;
  warehouseId: number;
};

export type UpdateProductStockInput = {
  productId: number;
  stock: number;
  warehouseId?: number;
};

export type WarehouseSummaryCounts = {
  products: number;
  stockMovements: number;
  users: number;
};

export type WarehouseDataService = {
  countProducts(): number;
  countStockMovements(): number;
  countUsers(): number;
  createProduct(input: CreateProductInput): ProductRecord;
  createUser(input: CreateUserInput): UserRecord;
  createWarehouse(input: CreateWarehouseInput): WarehouseRecord;
  getSummaryCounts(): WarehouseSummaryCounts;
  getWarehouseStock(input: { productId: number; warehouseId: number }): WarehouseStockRecord;
  listProducts(): ProductRecord[];
  listStockMovements(filters?: GetStockMovementsInput): StockMovementRecord[];
  listUsers(): UserRecord[];
  listWarehouses(): WarehouseRecord[];
  recordStockMovement(input: RecordStockMovementInput): StockMovementRecord;
  setWarehouseStock(input: SetWarehouseStockInput): WarehouseStockRecord;
  updateProductStock(input: UpdateProductStockInput): ProductRecord;
};

type CreateWarehouseDataServiceOptions = {
  database: DesktopDatabase;
  logger?: DatabaseLogger;
};

type CountRow = {
  count: number;
};

type SumRow = {
  totalQuantity: number | null;
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

const SELECT_PRODUCT_BY_ID_SQL = `
  SELECT
    id,
    name,
    sku,
    price,
    stock,
    created_at AS createdAt
  FROM products
  WHERE id = ?;
`;

const SELECT_ALL_PRODUCTS_SQL = `
  SELECT
    id,
    name,
    sku,
    price,
    stock,
    created_at AS createdAt
  FROM products
  ORDER BY id ASC;
`;

const SELECT_WAREHOUSE_BY_ID_SQL = `
  SELECT
    id,
    name,
    location,
    created_at AS createdAt
  FROM warehouses
  WHERE id = ?;
`;

const SELECT_DEFAULT_WAREHOUSE_SQL = `
  SELECT
    id,
    name,
    location,
    created_at AS createdAt
  FROM warehouses
  ORDER BY id ASC
  LIMIT 1;
`;

const SELECT_ALL_WAREHOUSES_SQL = `
  SELECT
    id,
    name,
    location,
    created_at AS createdAt
  FROM warehouses
  ORDER BY id ASC;
`;

const SELECT_WAREHOUSE_STOCK_SQL = `
  SELECT
    warehouse_id AS warehouseId,
    product_id AS productId,
    quantity
  FROM warehouse_stock
  WHERE warehouse_id = ?
    AND product_id = ?;
`;

const SELECT_ALL_USERS_SQL = `
  SELECT
    id,
    name,
    role
  FROM users
  ORDER BY id ASC;
`;

const SELECT_ALL_STOCK_MOVEMENTS_SQL = `
  SELECT
    id,
    product_id AS productId,
    warehouse_id AS warehouseId,
    type,
    quantity,
    date
  FROM stock_movements
`;

const COUNT_PRODUCTS_SQL = `
  SELECT COUNT(*) AS count
  FROM products;
`;

const COUNT_STOCK_MOVEMENTS_SQL = `
  SELECT COUNT(*) AS count
  FROM stock_movements;
`;

const COUNT_USERS_SQL = `
  SELECT COUNT(*) AS count
  FROM users;
`;

const SELECT_TOTAL_PRODUCT_STOCK_SQL = `
  SELECT COALESCE(SUM(quantity), 0) AS totalQuantity
  FROM warehouse_stock
  WHERE product_id = ?;
`;

const SELECT_TOTAL_PRODUCT_STOCK_EXCLUDING_WAREHOUSE_SQL = `
  SELECT COALESCE(SUM(quantity), 0) AS totalQuantity
  FROM warehouse_stock
  WHERE product_id = ?
    AND warehouse_id != ?;
`;

function assertNonEmptyString(fieldName: string, value: unknown, maxLength: number): string {
  if (typeof value !== "string") {
    throw new DatabaseValidationError(`${fieldName} must be a string.`);
  }

  const normalizedValue = value.trim();

  if (normalizedValue.length === 0) {
    throw new DatabaseValidationError(`${fieldName} is required.`);
  }

  if (normalizedValue.length > maxLength) {
    throw new DatabaseValidationError(`${fieldName} must be at most ${maxLength} characters.`);
  }

  return normalizedValue;
}

function assertPositiveInteger(fieldName: string, value: unknown): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new DatabaseValidationError(`${fieldName} must be a positive integer.`);
  }

  return Number(value);
}

function assertNonNegativeInteger(fieldName: string, value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new DatabaseValidationError(`${fieldName} must be a non-negative integer.`);
  }

  return Number(value);
}

function assertNonNegativePrice(fieldName: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new DatabaseValidationError(`${fieldName} must be a non-negative number.`);
  }

  return Number(value.toFixed(2));
}

function assertDateValue(fieldName: string, value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new DatabaseValidationError(`${fieldName} must be a valid date.`);
    }

    return value.toISOString();
  }

  if (typeof value === "string") {
    const normalizedDate = new Date(value);

    if (Number.isNaN(normalizedDate.getTime())) {
      throw new DatabaseValidationError(`${fieldName} must be a valid date.`);
    }

    return normalizedDate.toISOString();
  }

  throw new DatabaseValidationError(`${fieldName} must be a valid date.`);
}

function assertUserRole(role: unknown): UserRole {
  if (typeof role !== "string" || !USER_ROLES.has(role as UserRole)) {
    throw new DatabaseValidationError("role must be one of: admin, manager, operator.");
  }

  return role as UserRole;
}

function assertMovementType(type: unknown): StockMovementType {
  if (typeof type !== "string" || !MOVEMENT_TYPES.has(type as StockMovementType)) {
    throw new DatabaseValidationError("type must be one of: in, out.");
  }

  return type as StockMovementType;
}

function countRows(
  database: DesktopDatabase,
  tableName: "products" | "stock_movements" | "users",
): number {
  const sql =
    tableName === "products"
      ? COUNT_PRODUCTS_SQL
      : tableName === "stock_movements"
        ? COUNT_STOCK_MOVEMENTS_SQL
        : COUNT_USERS_SQL;

  return database.get<CountRow>(sql)?.count ?? 0;
}

function getProductOrThrow(database: DesktopDatabase, productId: number): ProductRecord {
  const product = database.get<ProductRecord>(SELECT_PRODUCT_BY_ID_SQL, [productId]);

  if (!product) {
    throw new DatabaseValidationError("productId does not reference an existing product.");
  }

  return product;
}

function getWarehouseOrThrow(database: DesktopDatabase, warehouseId: number): WarehouseRecord {
  const warehouse = database.get<WarehouseRecord>(SELECT_WAREHOUSE_BY_ID_SQL, [warehouseId]);

  if (!warehouse) {
    throw new DatabaseValidationError("warehouseId does not reference an existing warehouse.");
  }

  return warehouse;
}

function ensureDefaultWarehouse(database: DesktopDatabase): WarehouseRecord {
  const existingWarehouse = database.get<WarehouseRecord>(SELECT_DEFAULT_WAREHOUSE_SQL);

  if (existingWarehouse) {
    return existingWarehouse;
  }

  const result = database.run(
    `
      INSERT INTO warehouses (name, location, created_at)
      VALUES (?, ?, ?);
    `,
    [DEFAULT_WAREHOUSE_NAME, DEFAULT_WAREHOUSE_LOCATION, new Date().toISOString()],
  );

  const warehouse = database.get<WarehouseRecord>(SELECT_WAREHOUSE_BY_ID_SQL, [
    Number(result.lastInsertRowid),
  ]);

  if (!warehouse) {
    throw new Error("Default warehouse could not be loaded after insert.");
  }

  return warehouse;
}

function upsertWarehouseStock(
  database: DesktopDatabase,
  warehouseId: number,
  productId: number,
  quantity: number,
): void {
  database.run(
    `
      INSERT INTO warehouse_stock (warehouse_id, product_id, quantity)
      VALUES (?, ?, ?)
      ON CONFLICT(warehouse_id, product_id)
      DO UPDATE SET quantity = excluded.quantity;
    `,
    [warehouseId, productId, quantity],
  );
}

function getWarehouseStockQuantity(
  database: DesktopDatabase,
  warehouseId: number,
  productId: number,
): number {
  return database.get<WarehouseStockRecord>(SELECT_WAREHOUSE_STOCK_SQL, [warehouseId, productId])
    ?.quantity ?? 0;
}

function getProductTotalStock(database: DesktopDatabase, productId: number): number {
  return Number(
    database.get<SumRow>(SELECT_TOTAL_PRODUCT_STOCK_SQL, [productId])?.totalQuantity ?? 0,
  );
}

function getProductTotalStockExcludingWarehouse(
  database: DesktopDatabase,
  productId: number,
  warehouseId: number,
): number {
  return Number(
    database.get<SumRow>(SELECT_TOTAL_PRODUCT_STOCK_EXCLUDING_WAREHOUSE_SQL, [
      productId,
      warehouseId,
    ])?.totalQuantity ?? 0,
  );
}

function syncProductAggregateStock(database: DesktopDatabase, productId: number): ProductRecord {
  const totalStock = getProductTotalStock(database, productId);

  database.run(
    `
      UPDATE products
      SET stock = ?
      WHERE id = ?;
    `,
    [totalStock, productId],
  );

  const updatedProduct = database.get<ProductRecord>(SELECT_PRODUCT_BY_ID_SQL, [productId]);

  if (!updatedProduct) {
    throw new Error("Product could not be loaded after aggregate stock update.");
  }

  return updatedProduct;
}

function normalizeMovementFilters(filters?: GetStockMovementsInput): {
  productId?: number;
  warehouseId?: number;
} {
  if (!filters) {
    return {};
  }

  return {
    productId:
      filters.productId === undefined
        ? undefined
        : assertPositiveInteger("productId", filters.productId),
    warehouseId:
      filters.warehouseId === undefined
        ? undefined
        : assertPositiveInteger("warehouseId", filters.warehouseId),
  };
}

function buildStockMovementQuery(filters?: GetStockMovementsInput): {
  params: number[];
  sql: string;
} {
  const normalizedFilters = normalizeMovementFilters(filters);
  const conditions: string[] = [];
  const params: number[] = [];

  if (normalizedFilters.productId !== undefined) {
    conditions.push("product_id = ?");
    params.push(normalizedFilters.productId);
  }

  if (normalizedFilters.warehouseId !== undefined) {
    conditions.push("warehouse_id = ?");
    params.push(normalizedFilters.warehouseId);
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

  return {
    sql: `${SELECT_ALL_STOCK_MOVEMENTS_SQL}${whereClause} ORDER BY id ASC;`,
    params,
  };
}

export function createWarehouseDataService(
  options: CreateWarehouseDataServiceOptions,
): WarehouseDataService {
  const logger = options.logger ?? DEFAULT_LOGGER;
  const { database } = options;

  return {
    listProducts() {
      return database.all<ProductRecord>(SELECT_ALL_PRODUCTS_SQL);
    },
    listUsers() {
      return database.all<UserRecord>(SELECT_ALL_USERS_SQL);
    },
    listWarehouses() {
      return database.all<WarehouseRecord>(SELECT_ALL_WAREHOUSES_SQL);
    },
    listStockMovements(filters) {
      const query = buildStockMovementQuery(filters);
      return database.all<StockMovementRecord>(query.sql, query.params);
    },
    countProducts() {
      return countRows(database, "products");
    },
    countUsers() {
      return countRows(database, "users");
    },
    countStockMovements() {
      return countRows(database, "stock_movements");
    },
    getSummaryCounts() {
      return {
        products: countRows(database, "products"),
        stockMovements: countRows(database, "stock_movements"),
        users: countRows(database, "users"),
      };
    },
    createProduct(input) {
      const name = assertNonEmptyString("name", input.name, 120);
      const sku = assertNonEmptyString("sku", input.sku, 64);
      const price = assertNonNegativePrice("price", input.price);
      const stock = assertNonNegativeInteger("stock", input.stock ?? 0);
      const createdAt =
        input.createdAt === undefined
          ? new Date().toISOString()
          : assertDateValue("createdAt", input.createdAt);

      return database.transaction((transactionDatabase) => {
        const defaultWarehouse = ensureDefaultWarehouse(transactionDatabase);
        const result = transactionDatabase.run(
          `
            INSERT INTO products (name, sku, price, stock, created_at)
            VALUES (?, ?, ?, ?, ?);
          `,
          [name, sku, price, stock, createdAt],
        );

        const productId = Number(result.lastInsertRowid);
        upsertWarehouseStock(transactionDatabase, defaultWarehouse.id, productId, stock);
        const product = syncProductAggregateStock(transactionDatabase, productId);

        return product;
      }, "immediate");
    },
    createUser(input) {
      const name = assertNonEmptyString("name", input.name, 120);
      const role = assertUserRole(input.role);
      const result = database.run(
        `
          INSERT INTO users (name, role)
          VALUES (?, ?);
        `,
        [name, role],
      );

      const user = database.get<UserRecord>(
        `
          SELECT
            id,
            name,
            role
          FROM users
          WHERE id = ?;
        `,
        [Number(result.lastInsertRowid)],
      );

      if (!user) {
        logger.error("[desktop:db] user insert verification failed", {
          role,
        });
        throw new Error("User could not be loaded after insert.");
      }

      return user;
    },
    createWarehouse(input) {
      const name = assertNonEmptyString("name", input.name, 120);
      const location = assertNonEmptyString("location", input.location, 200);
      const createdAt =
        input.createdAt === undefined
          ? new Date().toISOString()
          : assertDateValue("createdAt", input.createdAt);
      const result = database.run(
        `
          INSERT INTO warehouses (name, location, created_at)
          VALUES (?, ?, ?);
        `,
        [name, location, createdAt],
      );

      const warehouse = database.get<WarehouseRecord>(SELECT_WAREHOUSE_BY_ID_SQL, [
        Number(result.lastInsertRowid),
      ]);

      if (!warehouse) {
        logger.error("[desktop:db] warehouse insert verification failed", {
          name,
          location,
        });
        throw new Error("Warehouse could not be loaded after insert.");
      }

      return warehouse;
    },
    getWarehouseStock(input) {
      const warehouseId = assertPositiveInteger("warehouseId", input.warehouseId);
      const productId = assertPositiveInteger("productId", input.productId);

      getWarehouseOrThrow(database, warehouseId);
      getProductOrThrow(database, productId);

      return {
        warehouseId,
        productId,
        quantity: getWarehouseStockQuantity(database, warehouseId, productId),
      };
    },
    setWarehouseStock(input) {
      const warehouseId = assertPositiveInteger("warehouseId", input.warehouseId);
      const productId = assertPositiveInteger("productId", input.productId);
      const quantity = assertNonNegativeInteger("quantity", input.quantity);

      return database.transaction((transactionDatabase) => {
        getWarehouseOrThrow(transactionDatabase, warehouseId);
        getProductOrThrow(transactionDatabase, productId);
        upsertWarehouseStock(transactionDatabase, warehouseId, productId, quantity);
        syncProductAggregateStock(transactionDatabase, productId);

        return {
          warehouseId,
          productId,
          quantity,
        };
      }, "immediate");
    },
    recordStockMovement(input) {
      const productId = assertPositiveInteger("productId", input.productId);
      const type = assertMovementType(input.type);
      const quantity = assertPositiveInteger("quantity", input.quantity);
      const movementDate =
        input.date === undefined ? new Date().toISOString() : assertDateValue("date", input.date);

      return database.transaction((transactionDatabase) => {
        getProductOrThrow(transactionDatabase, productId);
        const warehouse =
          input.warehouseId === undefined
            ? ensureDefaultWarehouse(transactionDatabase)
            : getWarehouseOrThrow(
                transactionDatabase,
                assertPositiveInteger("warehouseId", input.warehouseId),
              );
        const currentStock = getWarehouseStockQuantity(
          transactionDatabase,
          warehouse.id,
          productId,
        );
        const nextStock = type === "in" ? currentStock + quantity : currentStock - quantity;

        if (nextStock < 0) {
          throw new DatabaseValidationError("Stock cannot become negative.");
        }

        const insertResult = transactionDatabase.run(
          `
            INSERT INTO stock_movements (product_id, warehouse_id, type, quantity, date)
            VALUES (?, ?, ?, ?, ?);
          `,
          [productId, warehouse.id, type, quantity, movementDate],
        );

        upsertWarehouseStock(transactionDatabase, warehouse.id, productId, nextStock);
        syncProductAggregateStock(transactionDatabase, productId);

        const stockMovement = transactionDatabase.get<StockMovementRecord>(
          `
            SELECT
              id,
              product_id AS productId,
              warehouse_id AS warehouseId,
              type,
              quantity,
              date
            FROM stock_movements
            WHERE id = ?;
          `,
          [Number(insertResult.lastInsertRowid)],
        );

        if (!stockMovement) {
          throw new Error("Stock movement could not be loaded after insert.");
        }

        return stockMovement;
      }, "immediate");
    },
    updateProductStock(input) {
      const productId = assertPositiveInteger("productId", input.productId);
      const stock = assertNonNegativeInteger("stock", input.stock);

      return database.transaction((transactionDatabase) => {
        getProductOrThrow(transactionDatabase, productId);

        if (input.warehouseId !== undefined) {
          const warehouseId = assertPositiveInteger("warehouseId", input.warehouseId);
          getWarehouseOrThrow(transactionDatabase, warehouseId);
          upsertWarehouseStock(transactionDatabase, warehouseId, productId, stock);
          return syncProductAggregateStock(transactionDatabase, productId);
        }

        const defaultWarehouse = ensureDefaultWarehouse(transactionDatabase);
        const stockOutsideDefaultWarehouse = getProductTotalStockExcludingWarehouse(
          transactionDatabase,
          productId,
          defaultWarehouse.id,
        );
        const defaultWarehouseStock = stock - stockOutsideDefaultWarehouse;

        if (defaultWarehouseStock < 0) {
          throw new DatabaseValidationError(
            "Stock cannot be set below the quantity already stored in other warehouses.",
          );
        }

        upsertWarehouseStock(transactionDatabase, defaultWarehouse.id, productId, defaultWarehouseStock);
        return syncProductAggregateStock(transactionDatabase, productId);
      }, "immediate");
    },
  };
}
