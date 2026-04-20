import type { DatabaseLogger, DesktopDatabase } from "../db/database";

const USER_ROLES = new Set(["admin", "manager", "operator"] as const);
const MOVEMENT_TYPES = new Set(["in", "out"] as const);

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

export type StockMovementRecord = {
  date: string;
  id: number;
  productId: number;
  quantity: number;
  type: StockMovementType;
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

export type RecordStockMovementInput = {
  date?: string | Date;
  productId: number;
  quantity: number;
  type: StockMovementType;
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
  getSummaryCounts(): WarehouseSummaryCounts;
  listProducts(): ProductRecord[];
  listStockMovements(productId?: number): StockMovementRecord[];
  listUsers(): UserRecord[];
  recordStockMovement(input: RecordStockMovementInput): StockMovementRecord;
};

type CreateWarehouseDataServiceOptions = {
  database: DesktopDatabase;
  logger?: DatabaseLogger;
};

type CountRow = {
  count: number;
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
    type,
    quantity,
    date
  FROM stock_movements
  ORDER BY id ASC;
`;

const SELECT_STOCK_MOVEMENTS_BY_PRODUCT_SQL = `
  SELECT
    id,
    product_id AS productId,
    type,
    quantity,
    date
  FROM stock_movements
  WHERE product_id = ?
  ORDER BY id ASC;
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
    listStockMovements(productId) {
      if (productId === undefined) {
        return database.all<StockMovementRecord>(SELECT_ALL_STOCK_MOVEMENTS_SQL);
      }

      const normalizedProductId = assertPositiveInteger("productId", productId);
      return database.all<StockMovementRecord>(SELECT_STOCK_MOVEMENTS_BY_PRODUCT_SQL, [
        normalizedProductId,
      ]);
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
        input.createdAt === undefined ? new Date().toISOString() : assertDateValue("createdAt", input.createdAt);

      const result = database.run(
        `
          INSERT INTO products (name, sku, price, stock, created_at)
          VALUES (?, ?, ?, ?, ?);
        `,
        [name, sku, price, stock, createdAt],
      );

      const product = database.get<ProductRecord>(SELECT_PRODUCT_BY_ID_SQL, [
        Number(result.lastInsertRowid),
      ]);

      if (!product) {
        logger.error("[desktop:db] product insert verification failed", {
          sku,
        });
        throw new Error("Product could not be loaded after insert.");
      }

      return product;
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
    recordStockMovement(input) {
      const productId = assertPositiveInteger("productId", input.productId);
      const type = assertMovementType(input.type);
      const quantity = assertPositiveInteger("quantity", input.quantity);
      const movementDate =
        input.date === undefined ? new Date().toISOString() : assertDateValue("date", input.date);

      return database.transaction((transactionDatabase) => {
        const product = transactionDatabase.get<ProductRecord>(SELECT_PRODUCT_BY_ID_SQL, [productId]);

        if (!product) {
          throw new DatabaseValidationError("productId does not reference an existing product.");
        }

        const nextStock = type === "in" ? product.stock + quantity : product.stock - quantity;

        if (nextStock < 0) {
          throw new DatabaseValidationError("Stock cannot become negative.");
        }

        const insertResult = transactionDatabase.run(
          `
            INSERT INTO stock_movements (product_id, type, quantity, date)
            VALUES (?, ?, ?, ?);
          `,
          [productId, type, quantity, movementDate],
        );

        transactionDatabase.run(
          `
            UPDATE products
            SET stock = ?
            WHERE id = ?;
          `,
          [nextStock, productId],
        );

        const stockMovement = transactionDatabase.get<StockMovementRecord>(
          `
            SELECT
              id,
              product_id AS productId,
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
  };
}
