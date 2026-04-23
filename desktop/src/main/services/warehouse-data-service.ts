import type { DatabaseLogger, DesktopDatabase } from "../db/database";

const USER_ROLES = new Set(["admin", "manager", "operator"] as const);
const MOVEMENT_TYPES = new Set(["in", "out"] as const);
const MOVEMENT_REASONS = new Set(["adjustment", "dispatch", "transfer"] as const);
const DEFAULT_WAREHOUSE_NAME = "Primary Warehouse";
const DEFAULT_WAREHOUSE_LOCATION = "Default location";

type UserRole = "admin" | "manager" | "operator";
type StockMovementType = "in" | "out";
type DatabaseStockMovementType = "IN" | "OUT";
type StockMovementReason = "adjustment" | "dispatch" | "transfer";

export type StockMovementMetadata = {
  customer?: string;
  notes?: string;
  sourceWarehouseId?: number;
  targetWarehouseId?: number;
};

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
  isActive: number;
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
  metadata: StockMovementMetadata | null;
  productId: number;
  productName?: string;
  productSku?: string;
  quantity: number;
  reason: StockMovementReason;
  type: StockMovementType;
  warehouseId: number;
  warehouseName?: string;
};

export type WarehouseInventoryRecord = {
  productId: number;
  productName: string;
  productSku: string;
  quantity: number;
  warehouseId: number;
  warehouseName: string;
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

export type UpdateWarehouseInput = {
  location: string;
  name: string;
  warehouseId: number;
};

export type GetProductsInput = {
  warehouseId?: number;
};

export type GetStockMovementsInput = {
  productId?: number;
  warehouseId?: number;
};

export type RecordStockMovementInput = {
  date?: string | Date;
  metadata?: StockMovementMetadata | null;
  productId: number;
  quantity: number;
  reason?: StockMovementReason;
  type: StockMovementType;
  warehouseId?: number;
};

export type DispatchProductInput = {
  customer: string;
  notes?: string;
  productId: number;
  quantity: number;
  warehouseId: number;
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

export type DeactivateWarehouseResult = {
  warehouseId: number;
};

export type TransferStockInput = {
  productId: number;
  quantity: number;
  sourceId: number;
  targetId: number;
};

export type TransferStockResult = {
  movedAt: string;
  movementIds: [number, number];
  productId: number;
  quantity: number;
  sourceId: number;
  targetId: number;
};

export type WarehouseDataService = {
  countProducts(): number;
  countStockMovements(): number;
  countUsers(): number;
  createProduct(input: CreateProductInput): ProductRecord;
  createUser(input: CreateUserInput): UserRecord;
  createWarehouse(input: CreateWarehouseInput): WarehouseRecord;
  deactivateWarehouse(warehouseId: number): DeactivateWarehouseResult;
  getSummaryCounts(): WarehouseSummaryCounts;
  getWarehouseStock(input: { productId: number; warehouseId: number }): WarehouseStockRecord;
  listWarehouseInventory(warehouseId: number): WarehouseInventoryRecord[];
  listProducts(filters?: GetProductsInput): ProductRecord[];
  listStockMovements(filters?: GetStockMovementsInput): StockMovementRecord[];
  listUsers(): UserRecord[];
  listWarehouses(): WarehouseRecord[];
  dispatchProduct(input: DispatchProductInput): StockMovementRecord;
  recordStockMovement(input: RecordStockMovementInput): StockMovementRecord;
  setWarehouseStock(input: SetWarehouseStockInput): WarehouseStockRecord;
  transferStock(input: TransferStockInput): TransferStockResult;
  updateWarehouse(input: UpdateWarehouseInput): WarehouseRecord;
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

const SELECT_PRODUCTS_BY_WAREHOUSE_SQL = `
  SELECT
    products.id AS id,
    products.name AS name,
    products.sku AS sku,
    products.price AS price,
    COALESCE(warehouse_stock.quantity, 0) AS stock,
    products.created_at AS createdAt
  FROM products
  LEFT JOIN warehouse_stock
    ON warehouse_stock.product_id = products.id
    AND warehouse_stock.warehouse_id = ?
  ORDER BY products.id ASC;
`;

const SELECT_WAREHOUSE_BY_ID_SQL = `
  SELECT
    id,
    name,
    location,
    is_active AS isActive,
    created_at AS createdAt
  FROM warehouses
  WHERE id = ?;
`;

const SELECT_DEFAULT_WAREHOUSE_SQL = `
  SELECT
    id,
    name,
    location,
    is_active AS isActive,
    created_at AS createdAt
  FROM warehouses
  WHERE is_active = 1
  ORDER BY id ASC
  LIMIT 1;
`;

const SELECT_ALL_WAREHOUSES_SQL = `
  SELECT
    id,
    name,
    location,
    is_active AS isActive,
    created_at AS createdAt
  FROM warehouses
  WHERE is_active = 1
  ORDER BY name COLLATE NOCASE ASC, id ASC;
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
    stock_movements.id AS id,
    stock_movements.product_id AS productId,
    products.name AS productName,
    products.sku AS productSku,
    stock_movements.warehouse_id AS warehouseId,
    warehouses.name AS warehouseName,
    stock_movements.type AS dbType,
    stock_movements.reason AS reason,
    stock_movements.quantity AS quantity,
    stock_movements.metadata AS metadataJson,
    stock_movements.date AS date
  FROM stock_movements
  INNER JOIN products
    ON products.id = stock_movements.product_id
  INNER JOIN warehouses
    ON warehouses.id = stock_movements.warehouse_id
`;

const SELECT_WAREHOUSE_INVENTORY_SQL = `
  SELECT
    products.id AS productId,
    products.name AS productName,
    products.sku AS productSku,
    warehouse_stock.quantity AS quantity,
    warehouses.id AS warehouseId,
    warehouses.name AS warehouseName
  FROM warehouse_stock
  INNER JOIN products
    ON products.id = warehouse_stock.product_id
  INNER JOIN warehouses
    ON warehouses.id = warehouse_stock.warehouse_id
  WHERE warehouse_stock.warehouse_id = ?
    AND warehouse_stock.quantity > 0
  ORDER BY products.name COLLATE NOCASE ASC, products.id ASC;
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

const SELECT_TOTAL_WAREHOUSE_STOCK_SQL = `
  SELECT COALESCE(SUM(quantity), 0) AS totalQuantity
  FROM warehouse_stock
  WHERE warehouse_id = ?;
`;

const SELECT_WAREHOUSE_MOVEMENT_COUNT_SQL = `
  SELECT COUNT(*) AS count
  FROM stock_movements
  WHERE warehouse_id = ?;
`;

const COUNT_ACTIVE_WAREHOUSES_SQL = `
  SELECT COUNT(*) AS count
  FROM warehouses
  WHERE is_active = 1;
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

function assertMovementReason(reason: unknown): StockMovementReason {
  if (typeof reason !== "string" || !MOVEMENT_REASONS.has(reason as StockMovementReason)) {
    throw new DatabaseValidationError("reason must be one of: adjustment, dispatch, transfer.");
  }

  return reason as StockMovementReason;
}

function normalizeMovementMetadata(value: unknown): StockMovementMetadata | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new DatabaseValidationError("metadata must be an object when provided.");
  }

  const metadata = value as Record<string, unknown>;
  const normalized: StockMovementMetadata = {};

  if (metadata.customer !== undefined) {
    normalized.customer = assertNonEmptyString("metadata.customer", metadata.customer, 160);
  }

  if (metadata.notes !== undefined) {
    normalized.notes = assertNonEmptyString("metadata.notes", metadata.notes, 500);
  }

  if (metadata.sourceWarehouseId !== undefined) {
    normalized.sourceWarehouseId = assertPositiveInteger(
      "metadata.sourceWarehouseId",
      metadata.sourceWarehouseId,
    );
  }

  if (metadata.targetWarehouseId !== undefined) {
    normalized.targetWarehouseId = assertPositiveInteger(
      "metadata.targetWarehouseId",
      metadata.targetWarehouseId,
    );
  }

  return Object.keys(normalized).length === 0 ? null : normalized;
}

function mapDatabaseMovementType(type: DatabaseStockMovementType): StockMovementType {
  return type === "IN" ? "in" : "out";
}

function mapMovementTypeToDatabase(type: StockMovementType): DatabaseStockMovementType {
  return type === "in" ? "IN" : "OUT";
}

function serializeMovementMetadata(metadata: StockMovementMetadata | null): string | null {
  return metadata ? JSON.stringify(metadata) : null;
}

type StockMovementRow = {
  date: string;
  dbType: DatabaseStockMovementType;
  id: number;
  metadataJson: string | null;
  productId: number;
  productName?: string;
  productSku?: string;
  quantity: number;
  reason: StockMovementReason;
  warehouseId: number;
  warehouseName?: string;
};

function parseMovementMetadata(metadataJson: string | null): StockMovementMetadata | null {
  if (!metadataJson) {
    return null;
  }

  try {
    return normalizeMovementMetadata(JSON.parse(metadataJson));
  } catch {
    return null;
  }
}

function mapStockMovementRow(row: StockMovementRow): StockMovementRecord {
  return {
    id: row.id,
    productId: row.productId,
    productName: row.productName,
    productSku: row.productSku,
    warehouseId: row.warehouseId,
    warehouseName: row.warehouseName,
    type: mapDatabaseMovementType(row.dbType),
    reason: row.reason,
    quantity: row.quantity,
    metadata: parseMovementMetadata(row.metadataJson),
    date: row.date,
  };
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

function getActiveWarehouseOrThrow(
  database: DesktopDatabase,
  warehouseId: number,
  fieldName = "warehouseId",
): WarehouseRecord {
  const warehouse = getWarehouseOrThrow(database, warehouseId);

  if (warehouse.isActive !== 1) {
    throw new DatabaseValidationError(`${fieldName} no esta disponible para operar.`);
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

function getWarehouseTotalStock(database: DesktopDatabase, warehouseId: number): number {
  return Number(
    database.get<SumRow>(SELECT_TOTAL_WAREHOUSE_STOCK_SQL, [warehouseId])?.totalQuantity ?? 0,
  );
}

function getWarehouseMovementCount(database: DesktopDatabase, warehouseId: number): number {
  return database.get<CountRow>(SELECT_WAREHOUSE_MOVEMENT_COUNT_SQL, [warehouseId])?.count ?? 0;
}

function countActiveWarehouses(database: DesktopDatabase): number {
  return database.get<CountRow>(COUNT_ACTIVE_WAREHOUSES_SQL)?.count ?? 0;
}

function insertStockMovement(
  database: DesktopDatabase,
  input: {
    date: string;
    metadata: StockMovementMetadata | null;
    productId: number;
    quantity: number;
    reason: StockMovementReason;
    type: StockMovementType;
    warehouseId: number;
  },
): StockMovementRecord {
  const insertResult = database.run(
    `
      INSERT INTO stock_movements (product_id, warehouse_id, type, reason, quantity, metadata, date)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `,
    [
      input.productId,
      input.warehouseId,
      mapMovementTypeToDatabase(input.type),
      input.reason,
      input.quantity,
      serializeMovementMetadata(input.metadata),
      input.date,
    ],
  );

  const stockMovement = database.get<StockMovementRow>(
    `
      SELECT
        stock_movements.id AS id,
        stock_movements.product_id AS productId,
        products.name AS productName,
        products.sku AS productSku,
        stock_movements.warehouse_id AS warehouseId,
        warehouses.name AS warehouseName,
        stock_movements.type AS dbType,
        stock_movements.reason AS reason,
        stock_movements.quantity AS quantity,
        stock_movements.metadata AS metadataJson,
        stock_movements.date AS date
      FROM stock_movements
      INNER JOIN products
        ON products.id = stock_movements.product_id
      INNER JOIN warehouses
        ON warehouses.id = stock_movements.warehouse_id
      WHERE stock_movements.id = ?;
    `,
    [Number(insertResult.lastInsertRowid)],
  );

  if (!stockMovement) {
    throw new Error("Stock movement could not be loaded after insert.");
  }

  return mapStockMovementRow(stockMovement);
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
    conditions.push("stock_movements.product_id = ?");
    params.push(normalizedFilters.productId);
  }

  if (normalizedFilters.warehouseId !== undefined) {
    conditions.push("stock_movements.warehouse_id = ?");
    params.push(normalizedFilters.warehouseId);
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(" AND ")}` : "";

  return {
    sql: `${SELECT_ALL_STOCK_MOVEMENTS_SQL}${whereClause} ORDER BY stock_movements.date DESC, stock_movements.id DESC;`,
    params,
  };
}

export function createWarehouseDataService(
  options: CreateWarehouseDataServiceOptions,
): WarehouseDataService {
  const logger = options.logger ?? DEFAULT_LOGGER;
  const { database } = options;

  return {
    listProducts(filters) {
      if (filters?.warehouseId !== undefined) {
        const normalizedWarehouseId = assertPositiveInteger("warehouseId", filters.warehouseId);
        getActiveWarehouseOrThrow(database, normalizedWarehouseId);
        return database.all<ProductRecord>(SELECT_PRODUCTS_BY_WAREHOUSE_SQL, [
          normalizedWarehouseId,
        ]);
      }

      return database.all<ProductRecord>(SELECT_ALL_PRODUCTS_SQL);
    },
    listUsers() {
      return database.all<UserRecord>(SELECT_ALL_USERS_SQL);
    },
    listWarehouses() {
      return database.all<WarehouseRecord>(SELECT_ALL_WAREHOUSES_SQL);
    },
    listWarehouseInventory(warehouseId) {
      const normalizedWarehouseId = assertPositiveInteger("warehouseId", warehouseId);
      getActiveWarehouseOrThrow(database, normalizedWarehouseId);
      return database.all<WarehouseInventoryRecord>(SELECT_WAREHOUSE_INVENTORY_SQL, [
        normalizedWarehouseId,
      ]);
    },
    listStockMovements(filters) {
      const query = buildStockMovementQuery(filters);
      return database
        .all<StockMovementRow>(query.sql, query.params)
        .map((movement) => mapStockMovementRow(movement));
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
    updateWarehouse(input) {
      const warehouseId = assertPositiveInteger("warehouseId", input.warehouseId);
      const name = assertNonEmptyString("name", input.name, 120);
      const location = assertNonEmptyString("location", input.location, 200);

      getActiveWarehouseOrThrow(database, warehouseId);

      database.run(
        `
          UPDATE warehouses
          SET
            name = ?,
            location = ?
          WHERE id = ?;
        `,
        [name, location, warehouseId],
      );

      const warehouse = database.get<WarehouseRecord>(SELECT_WAREHOUSE_BY_ID_SQL, [warehouseId]);

      if (!warehouse) {
        logger.error("[desktop:db] warehouse update verification failed", {
          warehouseId,
        });
        throw new Error("Warehouse could not be loaded after update.");
      }

      return warehouse;
    },
    deactivateWarehouse(warehouseId) {
      const normalizedWarehouseId = assertPositiveInteger("warehouseId", warehouseId);

      return database.transaction((transactionDatabase) => {
        const warehouse = getWarehouseOrThrow(transactionDatabase, normalizedWarehouseId);

        if (warehouse.isActive !== 1) {
          throw new DatabaseValidationError("Este almacen ya esta desactivado.");
        }

        if (getWarehouseTotalStock(transactionDatabase, normalizedWarehouseId) > 0) {
          throw new DatabaseValidationError(
            "No se puede desactivar este almacen porque todavia tiene unidades guardadas.",
          );
        }

        if (countActiveWarehouses(transactionDatabase) <= 1) {
          throw new DatabaseValidationError(
            "Necesitas al menos un almacen activo para seguir operando.",
          );
        }

        transactionDatabase.run(
          `
            UPDATE warehouses
            SET is_active = 0
            WHERE id = ?;
          `,
          [normalizedWarehouseId],
        );

        return {
          warehouseId: normalizedWarehouseId,
        };
      }, "immediate");
    },
    getWarehouseStock(input) {
      const warehouseId = assertPositiveInteger("warehouseId", input.warehouseId);
      const productId = assertPositiveInteger("productId", input.productId);

      getActiveWarehouseOrThrow(database, warehouseId);
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
        getActiveWarehouseOrThrow(transactionDatabase, warehouseId);
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
    dispatchProduct(input) {
      const warehouseId = assertPositiveInteger("warehouseId", input.warehouseId);
      const productId = assertPositiveInteger("productId", input.productId);
      const quantity = assertPositiveInteger("quantity", input.quantity);
      const customer = assertNonEmptyString("customer", input.customer, 160);
      const notes =
        input.notes === undefined || input.notes.trim().length === 0
          ? undefined
          : assertNonEmptyString("notes", input.notes, 500);

      return database.transaction((transactionDatabase) => {
        const warehouse = getActiveWarehouseOrThrow(transactionDatabase, warehouseId);
        getProductOrThrow(transactionDatabase, productId);

        const currentStock = getWarehouseStockQuantity(transactionDatabase, warehouse.id, productId);

        if (currentStock < quantity) {
          throw new DatabaseValidationError(
            `Stock insuficiente en ${warehouse.name}. Disponible: ${currentStock}.`,
          );
        }

        upsertWarehouseStock(transactionDatabase, warehouse.id, productId, currentStock - quantity);
        const stockMovement = insertStockMovement(transactionDatabase, {
          date: new Date().toISOString(),
          productId,
          quantity,
          reason: "dispatch",
          metadata: {
            customer,
            ...(notes ? { notes } : {}),
          },
          type: "out",
          warehouseId: warehouse.id,
        });
        syncProductAggregateStock(transactionDatabase, productId);

        return stockMovement;
      }, "immediate");
    },
    recordStockMovement(input) {
      const productId = assertPositiveInteger("productId", input.productId);
      const type = assertMovementType(input.type);
      const quantity = assertPositiveInteger("quantity", input.quantity);
      const reason = assertMovementReason(input.reason ?? "adjustment");
      const metadata = normalizeMovementMetadata(input.metadata);
      const movementDate =
        input.date === undefined ? new Date().toISOString() : assertDateValue("date", input.date);

      return database.transaction((transactionDatabase) => {
        getProductOrThrow(transactionDatabase, productId);
        const warehouse =
          input.warehouseId === undefined
            ? ensureDefaultWarehouse(transactionDatabase)
            : getActiveWarehouseOrThrow(
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
          throw new DatabaseValidationError("El stock no puede quedar negativo.");
        }

        upsertWarehouseStock(transactionDatabase, warehouse.id, productId, nextStock);
        const stockMovement = insertStockMovement(transactionDatabase, {
          date: movementDate,
          metadata,
          productId,
          quantity,
          reason,
          type,
          warehouseId: warehouse.id,
        });
        syncProductAggregateStock(transactionDatabase, productId);

        return stockMovement;
      }, "immediate");
    },
    transferStock(input) {
      const sourceId = assertPositiveInteger("sourceId", input.sourceId);
      const targetId = assertPositiveInteger("targetId", input.targetId);
      const productId = assertPositiveInteger("productId", input.productId);
      const quantity = assertPositiveInteger("quantity", input.quantity);

      if (sourceId === targetId) {
        throw new DatabaseValidationError("El origen y el destino deben ser distintos.");
      }

      return database.transaction((transactionDatabase) => {
        const sourceWarehouse = getActiveWarehouseOrThrow(
          transactionDatabase,
          sourceId,
          "sourceId",
        );
        const targetWarehouse = getActiveWarehouseOrThrow(
          transactionDatabase,
          targetId,
          "targetId",
        );

        getProductOrThrow(transactionDatabase, productId);

        const sourceStock = getWarehouseStockQuantity(transactionDatabase, sourceId, productId);

        if (sourceStock < quantity) {
          throw new DatabaseValidationError(
            `Stock insuficiente en ${sourceWarehouse.name}. Disponible: ${sourceStock}.`,
          );
        }

        const targetStock = getWarehouseStockQuantity(transactionDatabase, targetId, productId);
        const movedAt = new Date().toISOString();

        upsertWarehouseStock(transactionDatabase, sourceId, productId, sourceStock - quantity);
        upsertWarehouseStock(transactionDatabase, targetId, productId, targetStock + quantity);

        const sourceMovement = insertStockMovement(transactionDatabase, {
          date: movedAt,
          metadata: {
            sourceWarehouseId: sourceWarehouse.id,
            targetWarehouseId: targetWarehouse.id,
          },
          productId,
          quantity,
          reason: "transfer",
          type: "out",
          warehouseId: sourceWarehouse.id,
        });
        const targetMovement = insertStockMovement(transactionDatabase, {
          date: movedAt,
          metadata: {
            sourceWarehouseId: sourceWarehouse.id,
            targetWarehouseId: targetWarehouse.id,
          },
          productId,
          quantity,
          reason: "transfer",
          type: "in",
          warehouseId: targetWarehouse.id,
        });

        syncProductAggregateStock(transactionDatabase, productId);

        return {
          movedAt,
          movementIds: [sourceMovement.id, targetMovement.id],
          productId,
          quantity,
          sourceId,
          targetId,
        };
      }, "immediate");
    },
    updateProductStock(input) {
      const productId = assertPositiveInteger("productId", input.productId);
      const stock = assertNonNegativeInteger("stock", input.stock);

      return database.transaction((transactionDatabase) => {
        getProductOrThrow(transactionDatabase, productId);

        if (input.warehouseId !== undefined) {
          const warehouseId = assertPositiveInteger("warehouseId", input.warehouseId);
          getActiveWarehouseOrThrow(transactionDatabase, warehouseId);
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
            "El stock no puede quedar por debajo de lo ya guardado en otros almacenes.",
          );
        }

        upsertWarehouseStock(transactionDatabase, defaultWarehouse.id, productId, defaultWarehouseStock);
        return syncProductAggregateStock(transactionDatabase, productId);
      }, "immediate");
    },
  };
}
