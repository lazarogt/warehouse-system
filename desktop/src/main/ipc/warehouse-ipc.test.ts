import assert from "node:assert/strict";
import test from "node:test";
import type {
  CreateProductPayload,
  CreateStockMovementPayload,
  CreateWarehousePayload,
  GetStockMovementsPayload,
  GetWarehouseStockPayload,
  Product,
  Warehouse,
  WarehouseStock,
  StockMovement,
  SetWarehouseStockPayload,
  UpdateProductStockPayload,
} from "../../../../shared/src/types/desktop-warehouse-ipc";
import type { DatabaseLogger } from "../db/database";
import type { WarehouseDataService } from "../services/warehouse-data-service";
import { WAREHOUSE_IPC_CHANNELS } from "../../shared/warehouse-ipc-channels";
import { registerWarehouseIpcHandlers } from "./warehouse-ipc";

type HandlerMap = Map<string, (_event: unknown, payload?: unknown) => unknown>;

function createMockRegistrar() {
  const handlers: HandlerMap = new Map();

  return {
    handlers,
    registrar: {
      handle(channel: string, listener: (_event: unknown, payload?: unknown) => unknown) {
        handlers.set(channel, listener);
      },
    },
  };
}

function createMockLogger(): DatabaseLogger {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

function createMockService(): WarehouseDataService {
  return {
    countProducts() {
      return 0;
    },
    countStockMovements() {
      return 0;
    },
    countUsers() {
      return 0;
    },
    createProduct(input) {
      return {
        id: 1,
        name: input.name,
        sku: input.sku,
        price: input.price,
        stock: input.stock ?? 0,
        createdAt: "2026-01-01T00:00:00.000Z",
      };
    },
    createWarehouse(input) {
      return {
        id: 1,
        name: input.name,
        location: input.location,
        createdAt: "2026-01-01T00:00:00.000Z",
      };
    },
    createUser() {
      throw new Error("Not implemented in IPC tests.");
    },
    getWarehouseStock(input) {
      return {
        warehouseId: input.warehouseId,
        productId: input.productId,
        quantity: 10,
      };
    },
    getSummaryCounts() {
      return {
        products: 0,
        stockMovements: 0,
        users: 0,
      };
    },
    listProducts() {
      return [
        {
          id: 1,
          name: "Keyboard",
          sku: "KB-100",
          price: 50,
          stock: 10,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ];
    },
    listStockMovements(filters) {
      return [
        {
          id: 1,
          productId: filters?.productId ?? 1,
          warehouseId: filters?.warehouseId ?? 1,
          type: "in",
          quantity: 5,
          date: "2026-01-02T00:00:00.000Z",
        },
      ];
    },
    listUsers() {
      return [];
    },
    listWarehouses() {
      return [
        {
          id: 1,
          name: "Central Warehouse",
          location: "Havana HQ",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ];
    },
    recordStockMovement(input) {
      return {
        id: 99,
        productId: input.productId,
        warehouseId: input.warehouseId ?? 1,
        type: input.type,
        quantity: input.quantity,
        date: input.date ?? "2026-01-03T00:00:00.000Z",
      };
    },
    setWarehouseStock(input) {
      return {
        warehouseId: input.warehouseId,
        productId: input.productId,
        quantity: input.quantity,
      };
    },
    updateProductStock(input) {
      return {
        id: input.productId,
        name: "Keyboard",
        sku: "KB-100",
        price: 50,
        stock: input.stock,
        createdAt: "2026-01-01T00:00:00.000Z",
      };
    },
  };
}

function getRegisteredHandler(handlers: HandlerMap, channel: string) {
  const handler = handlers.get(channel);
  assert.ok(handler, `Expected handler for channel ${channel}`);
  return handler;
}

test("registerWarehouseIpcHandlers exposes all required warehouse channels", () => {
  const { handlers, registrar } = createMockRegistrar();

  registerWarehouseIpcHandlers({
    logger: createMockLogger(),
    registrar,
    warehouseDataService: createMockService(),
  });

  assert.deepEqual([...handlers.keys()].sort(), Object.values(WAREHOUSE_IPC_CHANNELS).sort());
});

test("createProduct handler trims payload and returns standardized success response", () => {
  const { handlers, registrar } = createMockRegistrar();
  let capturedPayload: CreateProductPayload | null = null;
  const service = createMockService();
  service.createProduct = (input) => {
    capturedPayload = {
      name: input.name,
      sku: input.sku,
      price: input.price,
      stock: input.stock,
    };

    return {
      id: 7,
      name: input.name,
      sku: input.sku,
      price: input.price,
      stock: input.stock ?? 0,
      createdAt: "2026-01-04T00:00:00.000Z",
    };
  };

  registerWarehouseIpcHandlers({
    logger: createMockLogger(),
    registrar,
    warehouseDataService: service,
  });

  const response = getRegisteredHandler(handlers, WAREHOUSE_IPC_CHANNELS.createProduct)(null, {
    name: "  New Product  ",
    sku: "  NP-1  ",
    price: 12.5,
    stock: 3,
  }) as { success: boolean; data?: Product; error?: { code: string; message: string } };

  assert.equal(response.success, true);
  assert.deepEqual(capturedPayload, {
    name: "New Product",
    sku: "NP-1",
    price: 12.5,
    stock: 3,
  });
  assert.equal(response.data?.sku, "NP-1");
});

test("createWarehouse handler trims payload and returns standardized success response", () => {
  const { handlers, registrar } = createMockRegistrar();
  let capturedPayload: CreateWarehousePayload | null = null;
  const service = createMockService();
  service.createWarehouse = (input) => {
    capturedPayload = {
      name: input.name,
      location: input.location,
    };

    return {
      id: 5,
      name: input.name,
      location: input.location,
      createdAt: "2026-01-04T00:00:00.000Z",
    };
  };

  registerWarehouseIpcHandlers({
    logger: createMockLogger(),
    registrar,
    warehouseDataService: service,
  });

  const response = getRegisteredHandler(handlers, WAREHOUSE_IPC_CHANNELS.createWarehouse)(null, {
    name: "  Central Warehouse  ",
    location: "  Havana HQ  ",
  }) as { success: boolean; data?: Warehouse; error?: { code: string; message: string } };

  assert.equal(response.success, true);
  assert.deepEqual(capturedPayload, {
    name: "Central Warehouse",
    location: "Havana HQ",
  });
  assert.equal(response.data?.location, "Havana HQ");
});

test("updateProductStock handler rejects invalid payloads with structured errors", () => {
  const { handlers, registrar } = createMockRegistrar();

  registerWarehouseIpcHandlers({
    logger: createMockLogger(),
    registrar,
    warehouseDataService: createMockService(),
  });

  const response = getRegisteredHandler(handlers, WAREHOUSE_IPC_CHANNELS.updateProductStock)(null, {
    productId: "bad-id",
    stock: -2,
  }) as { success: boolean; data?: Product; error?: { code: string; message: string } };

  assert.equal(response.success, false);
  assert.equal(response.error?.code, "VALIDATION_ERROR");
  assert.match(response.error?.message ?? "", /productId/);
});

test("createStockMovement handler forwards validated payload to the service", () => {
  const { handlers, registrar } = createMockRegistrar();
  let capturedPayload: CreateStockMovementPayload | null = null;
  const service = createMockService();
  service.recordStockMovement = (input) => {
    capturedPayload = {
      productId: input.productId,
      warehouseId: input.warehouseId,
      type: input.type,
      quantity: input.quantity,
      date: typeof input.date === "string" ? input.date : undefined,
    };

    return {
      id: 10,
      productId: input.productId,
      warehouseId: input.warehouseId ?? 1,
      type: input.type,
      quantity: input.quantity,
      date: input.date ?? "2026-01-05T00:00:00.000Z",
    };
  };

  registerWarehouseIpcHandlers({
    logger: createMockLogger(),
    registrar,
    warehouseDataService: service,
  });

  const response = getRegisteredHandler(handlers, WAREHOUSE_IPC_CHANNELS.createStockMovement)(
    null,
    {
      productId: 3,
      warehouseId: 2,
      type: "in",
      quantity: 8,
      date: "2026-01-05",
    },
  ) as { success: boolean; data?: StockMovement; error?: { code: string; message: string } };

  assert.equal(response.success, true);
  assert.deepEqual(capturedPayload, {
    productId: 3,
    warehouseId: 2,
    type: "in",
    quantity: 8,
    date: "2026-01-05T00:00:00.000Z",
  });
  assert.equal(response.data?.quantity, 8);
  assert.equal(response.data?.warehouseId, 2);
});

test("getStockMovements handler validates optional filters before calling the service", () => {
  const { handlers, registrar } = createMockRegistrar();
  let capturedPayload: GetStockMovementsPayload | undefined;
  const service = createMockService();
  service.listStockMovements = (filters) => {
    capturedPayload = filters;
    return [
      {
        id: 2,
        productId: filters?.productId ?? 1,
        warehouseId: filters?.warehouseId ?? 1,
        type: "out",
        quantity: 1,
        date: "2026-01-06T00:00:00.000Z",
      },
    ];
  };

  registerWarehouseIpcHandlers({
    logger: createMockLogger(),
    registrar,
    warehouseDataService: service,
  });

  const response = getRegisteredHandler(handlers, WAREHOUSE_IPC_CHANNELS.getStockMovements)(null, {
    productId: 5,
    warehouseId: 3,
  }) as { success: boolean; data?: StockMovement[]; error?: { code: string; message: string } };

  assert.equal(response.success, true);
  assert.deepEqual(capturedPayload, {
    productId: 5,
    warehouseId: 3,
  });
  assert.equal(response.data?.[0]?.productId, 5);
  assert.equal(response.data?.[0]?.warehouseId, 3);
});

test("warehouse stock handlers validate payload and map service responses", () => {
  const { handlers, registrar } = createMockRegistrar();
  let getPayload: GetWarehouseStockPayload | null = null;
  let setPayload: SetWarehouseStockPayload | null = null;
  const service = createMockService();

  service.getWarehouseStock = (input) => {
    getPayload = input;
    return {
      warehouseId: input.warehouseId,
      productId: input.productId,
      quantity: 6,
    };
  };

  service.setWarehouseStock = (input) => {
    setPayload = input;
    return {
      warehouseId: input.warehouseId,
      productId: input.productId,
      quantity: input.quantity,
    };
  };

  registerWarehouseIpcHandlers({
    logger: createMockLogger(),
    registrar,
    warehouseDataService: service,
  });

  const getResponse = getRegisteredHandler(handlers, WAREHOUSE_IPC_CHANNELS.getWarehouseStock)(
    null,
    {
      warehouseId: 2,
      productId: 9,
    },
  ) as { success: boolean; data?: WarehouseStock; error?: { code: string; message: string } };

  const setResponse = getRegisteredHandler(handlers, WAREHOUSE_IPC_CHANNELS.setWarehouseStock)(
    null,
    {
      warehouseId: 2,
      productId: 9,
      quantity: 11,
    },
  ) as { success: boolean; data?: WarehouseStock; error?: { code: string; message: string } };

  assert.equal(getResponse.success, true);
  assert.deepEqual(getPayload, {
    warehouseId: 2,
    productId: 9,
  });
  assert.equal(getResponse.data?.quantity, 6);

  assert.equal(setResponse.success, true);
  assert.deepEqual(setPayload, {
    warehouseId: 2,
    productId: 9,
    quantity: 11,
  });
  assert.equal(setResponse.data?.quantity, 11);
});
