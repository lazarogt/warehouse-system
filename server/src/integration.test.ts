import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, test } from "node:test";
import request from "supertest";
import * as XLSX from "xlsx";
import { createApp } from "./app";
import { closeDatabase, query } from "./lib/db";
import { env } from "./config/env";
import { runSeed } from "./db/seed";
import { resetDatabase, runMigrations } from "./db/schema";

const app = createApp();
let currentTestDatabasePath: string | null = null;

const removeDatabaseArtifacts = (databasePath: string | null) => {
  if (!databasePath) {
    return;
  }

  for (const candidate of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    fs.rmSync(candidate, { force: true });
  }
};

const createAuthenticatedAgent = async (identifier: string, password: string) => {
  const agent = request.agent(app);
  const response = await agent.post("/api/auth/login").send({
    identifier,
    password,
  });

  assert.equal(response.status, 200);

  return {
    agent,
    user: response.body.user,
  };
};

const createAdminAgent = async () => {
  const { agent, user } = await createAuthenticatedAgent(
    env.defaultAdmin.email,
    env.defaultAdmin.password,
  );

  assert.equal(user.role, "admin");

  return agent;
};

const getWarehouseStockQuantity = async (warehouseId: number, productId: number) => {
  const result = await query<{ quantity: number }>(
    `
      SELECT quantity
      FROM warehouse_stock
      WHERE warehouse_id = $1
        AND product_id = $2;
    `,
    [warehouseId, productId],
  );

  return result.rows[0]?.quantity ?? 0;
};

const getLocationStockQuantity = async (warehouseLocationId: number, productId: number) => {
  const result = await query<{ quantity: number }>(
    `
      SELECT quantity
      FROM warehouse_location_stock
      WHERE warehouse_location_id = $1
        AND product_id = $2;
    `,
    [warehouseLocationId, productId],
  );

  return result.rows[0]?.quantity ?? 0;
};

const getWarehouseMovementLedgerQuantity = async (warehouseId: number, productId: number) => {
  const result = await query<{ quantity: number }>(
    `
      SELECT COALESCE(
        SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END),
        0
      ) AS quantity
      FROM stock_movements
      WHERE warehouse_id = $1
        AND product_id = $2;
    `,
    [warehouseId, productId],
  );

  return result.rows[0]?.quantity ?? 0;
};

const getLocationMovementLedgerQuantity = async (warehouseLocationId: number, productId: number) => {
  const result = await query<{ quantity: number }>(
    `
      SELECT COALESCE(
        SUM(CASE WHEN type = 'entry' THEN quantity ELSE -quantity END),
        0
      ) AS quantity
      FROM stock_movements
      WHERE warehouse_location_id = $1
        AND product_id = $2;
    `,
    [warehouseLocationId, productId],
  );

  return result.rows[0]?.quantity ?? 0;
};

const assertMovementLedgerMatchesStock = async (input: {
  warehouseId: number;
  productId: number;
  warehouseLocationId?: number;
}) => {
  const warehouseStockQuantity = await getWarehouseStockQuantity(input.warehouseId, input.productId);
  const warehouseMovementQuantity = await getWarehouseMovementLedgerQuantity(
    input.warehouseId,
    input.productId,
  );
  assert.equal(warehouseMovementQuantity, warehouseStockQuantity);

  if (input.warehouseLocationId) {
    const locationStockQuantity = await getLocationStockQuantity(
      input.warehouseLocationId,
      input.productId,
    );
    const locationMovementQuantity = await getLocationMovementLedgerQuantity(
      input.warehouseLocationId,
      input.productId,
    );
    assert.equal(locationMovementQuantity, locationStockQuantity);
  }
};

beforeEach(async () => {
  await closeDatabase();
  removeDatabaseArtifacts(currentTestDatabasePath);

  currentTestDatabasePath = path.join(
    os.tmpdir(),
    `warehouse-system-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  process.env.SQLITE_DB_PATH = currentTestDatabasePath;

  await runMigrations();
  await resetDatabase();
});

after(async () => {
  await closeDatabase();
  removeDatabaseArtifacts(currentTestDatabasePath);
});

test("auth protege endpoints y admin mantiene el CRUD de fase 2", async () => {
  const unauthenticatedResponse = await request(app).get("/api/products");
  assert.equal(unauthenticatedResponse.status, 401);

  const adminAgent = await createAdminAgent();

  const warehouseResponse = await adminAgent.post("/api/warehouses").send({
    name: "Main Warehouse",
    description: "Central storage",
  });
  assert.equal(warehouseResponse.status, 201);

  const categoryResponse = await adminAgent.post("/api/categories").send({
    name: "Electronics",
    description: "Devices and components",
  });
  assert.equal(categoryResponse.status, 201);

  const productResponse = await adminAgent.post("/api/products").send({
    name: "Barcode Scanner",
    description: "Handheld device",
    categoryId: categoryResponse.body.id,
    price: 199.99,
    minimumStock: 5,
  });
  assert.equal(productResponse.status, 201);
  assert.equal(productResponse.body.price, 199.99);
  assert.equal(productResponse.body.minimumStock, 5);

  const updatedProductResponse = await adminAgent
    .put(`/api/products/${productResponse.body.id}`)
    .send({
      name: "Industrial Barcode Scanner",
      description: "Updated device",
      categoryId: categoryResponse.body.id,
      price: 249.5,
      minimumStock: 7,
    });
  assert.equal(updatedProductResponse.status, 200);
  assert.equal(updatedProductResponse.body.name, "Industrial Barcode Scanner");
  assert.equal(updatedProductResponse.body.price, 249.5);

  const stockEntryResponse = await adminAgent.post("/api/inventory/movements").send({
    productId: productResponse.body.id,
    warehouseId: warehouseResponse.body.id,
    type: "entry",
    quantity: 9,
    movementDate: "2026-03-18T09:00:00.000Z",
    observation: "Stock inicial",
  });
  assert.equal(stockEntryResponse.status, 201);

  const productDetailResponse = await adminAgent.get(`/api/products/${productResponse.body.id}`);
  assert.equal(productDetailResponse.status, 200);
  assert.equal(productDetailResponse.body.categoryName, "Electronics");
  assert.equal(productDetailResponse.body.currentStock, 9);

  const listResponse = await adminAgent.get("/api/products?page=1&pageSize=10&search=Industrial");
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.total, 1);
  assert.equal(listResponse.body.items.length, 1);
  assert.equal(listResponse.body.items[0].name, "Industrial Barcode Scanner");
  assert.equal(listResponse.body.items[0].currentStock, 9);

  const filteredListResponse = await adminAgent.get(
    "/api/products?page=1&pageSize=10&maximumMinimumStock=7&maximumCurrentStock=9",
  );
  assert.equal(filteredListResponse.status, 200);
  assert.equal(filteredListResponse.body.total, 1);
  assert.equal(filteredListResponse.body.items[0].minimumStock, 7);
});

test("manager y operator respetan permisos y los movimientos bloquean stock negativo", async () => {
  const adminAgent = await createAdminAgent();

  const warehouseResponse = await adminAgent.post("/api/warehouses").send({
    name: "Secondary Warehouse",
  });
  const categoryResponse = await adminAgent.post("/api/categories").send({
    name: "Supplies",
  });
  const productResponse = await adminAgent.post("/api/products").send({
    name: "Packing Tape",
    categoryId: categoryResponse.body.id,
    price: 12.5,
    minimumStock: 8,
  });

  const createManagerResponse = await adminAgent.post("/api/users").send({
    name: "Inventory Manager",
    email: "inventory.manager@example.com",
    password: "Manager123!",
    role: "manager",
    status: "active",
  });
  assert.equal(createManagerResponse.status, 201);

  const managerAgent = request.agent(app);
  const managerLoginResponse = await managerAgent.post("/api/auth/login").send({
    email: "inventory.manager@example.com",
    password: "Manager123!",
  });
  assert.equal(managerLoginResponse.status, 200);

  const managerCreateProductResponse = await managerAgent.post("/api/products").send({
    name: "Safety Gloves",
    categoryId: categoryResponse.body.id,
    price: 7.99,
    minimumStock: 10,
  });
  assert.equal(managerCreateProductResponse.status, 201);

  const createOperatorResponse = await adminAgent.post("/api/users").send({
    name: "Operator User",
    username: "operator-user",
    email: "operator@example.com",
    password: "Operator123!",
    role: "operator",
    status: "active",
  });
  assert.equal(createOperatorResponse.status, 201);

  const { agent: operatorAgent, user: operatorUser } = await createAuthenticatedAgent(
    "operator@example.com",
    "Operator123!",
  );
  assert.equal(operatorUser.role, "operator");

  const meResponse = await operatorAgent.get("/api/auth/me");
  assert.equal(meResponse.status, 200);
  assert.equal(meResponse.body.user.email, "operator@example.com");

  const forbiddenCategoryResponse = await operatorAgent.post("/api/categories").send({
    name: "Should Fail",
  });
  assert.equal(forbiddenCategoryResponse.status, 403);

  const forbiddenProductResponse = await operatorAgent.post("/api/products").send({
    name: "Unauthorized Product",
    categoryId: categoryResponse.body.id,
    price: 1,
    minimumStock: 1,
  });
  assert.equal(forbiddenProductResponse.status, 403);

  const entryResponse = await operatorAgent.post("/api/inventory/movements").send({
    productId: productResponse.body.id,
    warehouseId: warehouseResponse.body.id,
    type: "entry",
    quantity: 15,
    movementDate: "2026-03-18T10:00:00.000Z",
    observation: "Initial stock",
  });
  assert.equal(entryResponse.status, 201);
  assert.equal(entryResponse.body.currentStock.quantity, 15);
  assert.equal(entryResponse.body.movement.userName, "Operator User");
  assert.equal(entryResponse.body.movement.productName, "Packing Tape");

  const exitResponse = await managerAgent.post("/api/inventory/movements").send({
    productId: productResponse.body.id,
    warehouseId: warehouseResponse.body.id,
    type: "exit",
    quantity: 4,
    movementDate: "2026-03-18T11:00:00.000Z",
  });
  assert.equal(exitResponse.status, 201);
  assert.equal(exitResponse.body.currentStock.quantity, 11);
  assert.equal(exitResponse.body.movement.userName, "Inventory Manager");

  const stockResponse = await operatorAgent.get(
    `/api/inventory/stock?productId=${productResponse.body.id}&warehouseId=${warehouseResponse.body.id}`,
  );
  assert.equal(stockResponse.status, 200);
  assert.equal(stockResponse.body[0].quantity, 11);

  const recentMovementsResponse = await operatorAgent.get("/api/inventory/movements?limit=5");
  assert.equal(recentMovementsResponse.status, 200);
  assert.equal(recentMovementsResponse.body.length, 2);
  assert.equal(recentMovementsResponse.body[0].userName, "Inventory Manager");

  const invalidExitResponse = await operatorAgent.post("/api/inventory/movements").send({
    productId: productResponse.body.id,
    warehouseId: warehouseResponse.body.id,
    type: "exit",
    quantity: 50,
    movementDate: "2026-03-18T12:00:00.000Z",
  });
  assert.equal(invalidExitResponse.status, 400);

  const forbiddenDeleteResponse = await managerAgent.delete(`/api/products/${productResponse.body.id}`);
  assert.equal(forbiddenDeleteResponse.status, 403);

  const logoutResponse = await operatorAgent.post("/api/auth/logout");
  assert.equal(logoutResponse.status, 204);

  const meAfterLogoutResponse = await operatorAgent.get("/api/auth/me");
  assert.equal(meAfterLogoutResponse.status, 401);
});

test("eliminacion logica de productos oculta el catalogo activo sin romper relaciones existentes", async () => {
  const adminAgent = await createAdminAgent();

  const warehouseResponse = await adminAgent.post("/api/warehouses").send({
    name: "Soft Delete Warehouse",
  });
  assert.equal(warehouseResponse.status, 201);

  const categoryResponse = await adminAgent.post("/api/categories").send({
    name: "Soft Delete Category",
  });
  assert.equal(categoryResponse.status, 201);

  const productResponse = await adminAgent.post("/api/products").send({
    name: "Soft Delete Scanner",
    sku: "SOFT-DELETE-001",
    barcode: "771100000001",
    categoryId: categoryResponse.body.id,
    price: 99.5,
    minimumStock: 2,
  });
  assert.equal(productResponse.status, 201);

  const stockEntryResponse = await adminAgent.post("/api/inventory/movements").send({
    productId: productResponse.body.id,
    warehouseId: warehouseResponse.body.id,
    type: "entry",
    quantity: 5,
    movementDate: "2026-03-18T09:30:00.000Z",
    observation: "Stock previo al soft delete",
  });
  assert.equal(stockEntryResponse.status, 201);

  const deleteResponse = await adminAgent.delete(`/api/products/${productResponse.body.id}`);
  assert.equal(deleteResponse.status, 204);

  const deletedDetailResponse = await adminAgent.get(`/api/products/${productResponse.body.id}`);
  assert.equal(deletedDetailResponse.status, 404);

  const deletedListResponse = await adminAgent.get("/api/products?page=1&pageSize=10&search=SOFT-DELETE-001");
  assert.equal(deletedListResponse.status, 200);
  assert.equal(deletedListResponse.body.total, 0);
  assert.equal(deletedListResponse.body.items.length, 0);

  const deletedLookupBySkuResponse = await adminAgent.get("/api/products/lookup?sku=SOFT-DELETE-001");
  assert.equal(deletedLookupBySkuResponse.status, 404);

  const deletedLookupByBarcodeResponse = await adminAgent.get(
    "/api/products/lookup?barcode=771100000001",
  );
  assert.equal(deletedLookupByBarcodeResponse.status, 404);
});

test("admin puede gestionar usuarios y manager u operator no pueden administrar usuarios", async () => {
  const adminAgent = await createAdminAgent();

  const usersResponse = await adminAgent.get("/api/users");
  assert.equal(usersResponse.status, 200);
  assert.equal(usersResponse.body.length, 1);
  assert.equal(usersResponse.body[0].email, env.defaultAdmin.email);

  const publicRegisterResponse = await request(app).post("/api/auth/register").send({
    name: "Public User",
    username: "public-user",
    email: "public.user@example.com",
    password: "Public123!",
  });
  assert.equal(publicRegisterResponse.status, 403);

  const adminDetailResponse = await adminAgent.get(`/api/users/${usersResponse.body[0].id}`);
  assert.equal(adminDetailResponse.status, 200);
  assert.equal(adminDetailResponse.body.email, env.defaultAdmin.email);

  const createManagerResponse = await adminAgent.post("/api/users").send({
    name: "Manager User",
    username: "manager-user",
    email: "manager@example.com",
    password: "Manager123!",
    role: "manager",
    status: "active",
  });
  assert.equal(createManagerResponse.status, 201);
  assert.equal(createManagerResponse.body.role, "manager");
  assert.equal(createManagerResponse.body.status, "active");

  const createOperatorResponse = await adminAgent.post("/api/users").send({
    name: "Operator User",
    username: "operator-user-2",
    email: "operator.two@example.com",
    password: "Operator123!",
    role: "operator",
    status: "active",
  });
  assert.equal(createOperatorResponse.status, 201);

  const { agent: managerAgent } = await createAuthenticatedAgent("manager@example.com", "Manager123!");
  const { agent: operatorAgent } = await createAuthenticatedAgent(
    "operator.two@example.com",
    "Operator123!",
  );

  const updateManagerResponse = await adminAgent.put(`/api/users/${createManagerResponse.body.id}`).send({
    name: "Manager Updated",
    username: "manager-updated",
    email: "manager.updated@example.com",
    role: "manager",
    status: "active",
  });
  assert.equal(updateManagerResponse.status, 200);
  assert.equal(updateManagerResponse.body.name, "Manager Updated");
  assert.equal(updateManagerResponse.body.username, "manager-updated");
  assert.equal(updateManagerResponse.body.status, "active");

  const managerUsersResponse = await managerAgent.get("/api/users");
  assert.equal(managerUsersResponse.status, 403);

  const operatorUsersResponse = await operatorAgent.get("/api/users");
  assert.equal(operatorUsersResponse.status, 403);

  const managerUserDetailResponse = await managerAgent.get(`/api/users/${createManagerResponse.body.id}`);
  assert.equal(managerUserDetailResponse.status, 403);

  const managerCreateUserResponse = await managerAgent.post("/api/users").send({
    name: "Blocked Manager Create",
    username: "blocked-manager-create",
    email: "blocked.manager.create@example.com",
    password: "Blocked123!",
    role: "operator",
    status: "active",
  });
  assert.equal(managerCreateUserResponse.status, 403);

  const operatorCreateUserResponse = await operatorAgent.post("/api/users").send({
    name: "Blocked Operator Create",
    username: "blocked-operator-create",
    email: "blocked.operator.create@example.com",
    password: "Blocked123!",
    role: "operator",
    status: "active",
  });
  assert.equal(operatorCreateUserResponse.status, 403);

  const managerUpdateUserResponse = await managerAgent.put(`/api/users/${createOperatorResponse.body.id}`).send({
    name: "Blocked Update",
    username: "blocked-update",
    email: "blocked.update@example.com",
    role: "operator",
    status: "active",
  });
  assert.equal(managerUpdateUserResponse.status, 403);

  const operatorUpdateUserResponse = await operatorAgent.put(`/api/users/${createManagerResponse.body.id}`).send({
    name: "Blocked Update",
    username: "blocked-update-operator",
    email: "blocked.update.operator@example.com",
    role: "manager",
    status: "active",
  });
  assert.equal(operatorUpdateUserResponse.status, 403);

  const roleUpdateResponse = await adminAgent
    .patch(`/api/users/${createManagerResponse.body.id}/role`)
    .send({
      role: "operator",
  });
  assert.equal(roleUpdateResponse.status, 200);
  assert.equal(roleUpdateResponse.body.role, "operator");

  const managerRoleUpdateResponse = await managerAgent
    .patch(`/api/users/${createOperatorResponse.body.id}/role`)
    .send({
      role: "manager",
    });
  assert.equal(managerRoleUpdateResponse.status, 403);

  const reactivateResponse = await adminAgent.put(`/api/users/${createManagerResponse.body.id}`).send({
    name: "Manager Updated",
    username: "manager-updated",
    email: "manager.updated@example.com",
    role: "operator",
    status: "active",
  });
  assert.equal(reactivateResponse.status, 200);
  assert.equal(reactivateResponse.body.status, "active");

  const adminGetUpdatedUserResponse = await adminAgent.get(`/api/users/${createManagerResponse.body.id}`);
  assert.equal(adminGetUpdatedUserResponse.status, 200);
  assert.equal(adminGetUpdatedUserResponse.body.role, "operator");

  const managerResetPasswordResponse = await managerAgent
    .put(`/api/users/${createOperatorResponse.body.id}/reset-password`)
    .send({});
  assert.equal(managerResetPasswordResponse.status, 403);

  const deleteResponse = await adminAgent.delete(`/api/users/${createManagerResponse.body.id}`);
  assert.equal(deleteResponse.status, 204);
});

test("usuarios eliminados logicamente se ocultan, no autentican y liberan unicidad activa", async () => {
  const adminAgent = await createAdminAgent();

  const createUserResponse = await adminAgent.post("/api/users").send({
    name: "Soft Deleted User",
    username: "soft-deleted-user",
    email: "soft.deleted.user@example.com",
    password: "User12345!",
    role: "operator",
    status: "active",
  });
  assert.equal(createUserResponse.status, 201);

  const deleteUserResponse = await adminAgent.delete(`/api/users/${createUserResponse.body.id}`);
  assert.equal(deleteUserResponse.status, 204);

  const usersAfterDeleteResponse = await adminAgent.get("/api/users");
  assert.equal(usersAfterDeleteResponse.status, 200);
  assert.equal(
    usersAfterDeleteResponse.body.some((user: { id: number }) => user.id === createUserResponse.body.id),
    false,
  );

  const deletedUserDetailResponse = await adminAgent.get(`/api/users/${createUserResponse.body.id}`);
  assert.equal(deletedUserDetailResponse.status, 404);

  const deletedUserLoginResponse = await request(app).post("/api/auth/login").send({
    identifier: "soft.deleted.user@example.com",
    password: "User12345!",
  });
  assert.equal(deletedUserLoginResponse.status, 401);

  const recreatedUserResponse = await adminAgent.post("/api/users").send({
    name: "Soft Deleted User Replacement",
    username: "soft-deleted-user",
    email: "soft.deleted.user@example.com",
    password: "User12345!",
    role: "operator",
    status: "active",
  });
  assert.equal(recreatedUserResponse.status, 201);
});

test("warehouses y locations eliminados logicamente se ocultan y dejan de ser operables", async () => {
  const adminAgent = await createAdminAgent();

  const warehouseResponse = await adminAgent.post("/api/warehouses").send({
    name: "Soft Inventory Warehouse",
    description: "Warehouse for soft delete checks",
  });
  assert.equal(warehouseResponse.status, 201);

  const locationResponse = await adminAgent.post("/api/locations").send({
    warehouseId: warehouseResponse.body.id,
    code: "A-01",
    name: "Aisle 01",
    type: "aisle",
    active: true,
  });
  assert.equal(locationResponse.status, 201);

  const deleteLocationResponse = await adminAgent.delete(`/api/locations/${locationResponse.body.id}`);
  assert.equal(deleteLocationResponse.status, 204);

  const locationsAfterDeleteResponse = await adminAgent.get("/api/locations");
  assert.equal(locationsAfterDeleteResponse.status, 200);
  assert.equal(
    locationsAfterDeleteResponse.body.some(
      (location: { id: number }) => location.id === locationResponse.body.id,
    ),
    false,
  );

  const recreatedLocationResponse = await adminAgent.post("/api/locations").send({
    warehouseId: warehouseResponse.body.id,
    code: "A-01",
    name: "Aisle 01 Replacement",
    type: "aisle",
    active: true,
  });
  assert.equal(recreatedLocationResponse.status, 201);

  const deleteWarehouseResponse = await adminAgent.delete(`/api/warehouses/${warehouseResponse.body.id}`);
  assert.equal(deleteWarehouseResponse.status, 204);

  const warehousesAfterDeleteResponse = await adminAgent.get("/api/warehouses");
  assert.equal(warehousesAfterDeleteResponse.status, 200);
  assert.equal(
    warehousesAfterDeleteResponse.body.some(
      (warehouse: { id: number }) => warehouse.id === warehouseResponse.body.id,
    ),
    false,
  );

  const locationsAfterWarehouseDeleteResponse = await adminAgent.get("/api/locations");
  assert.equal(locationsAfterWarehouseDeleteResponse.status, 200);
  assert.equal(
    locationsAfterWarehouseDeleteResponse.body.some(
      (location: { warehouseId: number }) => location.warehouseId === warehouseResponse.body.id,
    ),
    false,
  );

  const categoryResponse = await adminAgent.post("/api/categories").send({
    name: "Soft Inventory Category",
  });
  assert.equal(categoryResponse.status, 201);

  const productResponse = await adminAgent.post("/api/products").send({
    name: "Soft Inventory Product",
    categoryId: categoryResponse.body.id,
    price: 10,
    minimumStock: 1,
  });
  assert.equal(productResponse.status, 201);

  const blockedMovementResponse = await adminAgent.post("/api/inventory/movements").send({
    productId: productResponse.body.id,
    warehouseId: warehouseResponse.body.id,
    type: "entry",
    quantity: 1,
    movementDate: "2026-03-18T10:30:00.000Z",
  });
  assert.equal(blockedMovementResponse.status, 400);
});

test("reportes y alertas respetan permisos y exponen stock bajo", async () => {
  const adminAgent = await createAdminAgent();

  const warehouseResponse = await adminAgent.post("/api/warehouses").send({
    name: "Alerts Warehouse",
  });
  assert.equal(warehouseResponse.status, 201);

  const categoryResponse = await adminAgent.post("/api/categories").send({
    name: "Critical Supplies",
  });
  assert.equal(categoryResponse.status, 201);

  const productResponse = await adminAgent.post("/api/products").send({
    name: "Thermal Label Roll",
    categoryId: categoryResponse.body.id,
    price: 5.75,
    minimumStock: 10,
    description: "Consumable for printers",
  });
  assert.equal(productResponse.status, 201);

  const managerCreateResponse = await adminAgent.post("/api/users").send({
    name: "Reports Manager",
    email: "reports.manager@example.com",
    password: "Manager123!",
    role: "manager",
    status: "active",
  });
  assert.equal(managerCreateResponse.status, 201);

  const managerAgent = request.agent(app);
  const managerLoginResponse = await managerAgent.post("/api/auth/login").send({
    email: "reports.manager@example.com",
    password: "Manager123!",
  });
  assert.equal(managerLoginResponse.status, 200);

  const createOperatorResponse = await adminAgent.post("/api/users").send({
    name: "Floor Operator",
    username: "floor-operator",
    email: "floor.operator@example.com",
    password: "Operator123!",
    role: "operator",
    status: "active",
  });
  assert.equal(createOperatorResponse.status, 201);

  const { agent: operatorAgent } = await createAuthenticatedAgent(
    "floor.operator@example.com",
    "Operator123!",
  );

  const entryResponse = await managerAgent.post("/api/inventory/movements").send({
    productId: productResponse.body.id,
    warehouseId: warehouseResponse.body.id,
    type: "entry",
    quantity: 8,
    movementDate: "2026-03-18T13:00:00.000Z",
    observation: "Low stock scenario",
  });
  assert.equal(entryResponse.status, 201);

  const lowStockAlertsResponse = await operatorAgent.get("/api/alerts/low-stock");
  assert.equal(lowStockAlertsResponse.status, 200);
  assert.equal(lowStockAlertsResponse.body.length, 1);
  assert.equal(lowStockAlertsResponse.body[0].id, productResponse.body.id);
  assert.equal(lowStockAlertsResponse.body[0].currentStock, 8);
  assert.equal(lowStockAlertsResponse.body[0].minimumStock, 10);
  assert.equal(lowStockAlertsResponse.body[0].shortage, 2);

  const managerProductsExcelResponse = await managerAgent.get(
    "/api/reports/products/export?format=excel",
  );
  assert.equal(managerProductsExcelResponse.status, 200);
  assert.match(
    managerProductsExcelResponse.headers["content-type"],
    /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
  );
  assert.match(
    managerProductsExcelResponse.headers["content-disposition"],
    /products-report-.*\.xlsx/,
  );
  assert.ok(Number(managerProductsExcelResponse.headers["content-length"] ?? 0) > 0);

  const managerProductsOdfResponse = await managerAgent.get(
    "/api/reports/products/export?format=odf",
  );
  assert.equal(managerProductsOdfResponse.status, 200);
  assert.match(
    managerProductsOdfResponse.headers["content-type"],
    /application\/vnd\.oasis\.opendocument\.spreadsheet/,
  );
  assert.match(
    managerProductsOdfResponse.headers["content-disposition"],
    /products-report-.*\.ods/,
  );
  assert.ok(Number(managerProductsOdfResponse.headers["content-length"] ?? 0) > 0);

  const managerMovementsPdfResponse = await managerAgent.get("/api/reports/movements/export?format=pdf");
  assert.equal(managerMovementsPdfResponse.status, 200);
  assert.match(managerMovementsPdfResponse.headers["content-type"], /application\/pdf/);
  assert.match(
    managerMovementsPdfResponse.headers["content-disposition"],
    /movements-report-.*\.pdf/,
  );
  assert.ok(Number(managerMovementsPdfResponse.headers["content-length"] ?? 0) > 0);

  const operatorProductsExportResponse = await operatorAgent.get(
    "/api/reports/products/export?format=excel",
  );
  assert.equal(operatorProductsExportResponse.status, 403);

  const operatorMovementsExportResponse = await operatorAgent.get(
    "/api/reports/movements/export?format=pdf",
  );
  assert.equal(operatorMovementsExportResponse.status, 403);
});

test("atributos dinamicos por categoria validan required, tipos y lectura de productos", async () => {
  const adminAgent = await createAdminAgent();

  const categoryResponse = await adminAgent.post("/api/categories").send({
    name: "Industrial Devices",
    description: "Universal product category",
  });
  assert.equal(categoryResponse.status, 201);

  const modelAttributeResponse = await adminAgent
    .post(`/api/categories/${categoryResponse.body.id}/attributes`)
    .send({
      key: "model",
      label: "Modelo",
      type: "text",
      required: true,
      sortOrder: 1,
      active: true,
    });
  assert.equal(modelAttributeResponse.status, 201);

  const weightAttributeResponse = await adminAgent
    .post(`/api/categories/${categoryResponse.body.id}/attributes`)
    .send({
      key: "weight",
      label: "Peso",
      type: "number",
      required: false,
      sortOrder: 2,
      active: true,
    });
  assert.equal(weightAttributeResponse.status, 201);

  const certificationsAttributeResponse = await adminAgent
    .post(`/api/categories/${categoryResponse.body.id}/attributes`)
    .send({
      key: "certifications",
      label: "Certificaciones",
      type: "multiselect",
      required: false,
      options: ["ISO", "CE"],
      sortOrder: 3,
      active: true,
    });
  assert.equal(certificationsAttributeResponse.status, 201);

  const metadataAttributeResponse = await adminAgent
    .post(`/api/categories/${categoryResponse.body.id}/attributes`)
    .send({
      key: "metadata",
      label: "Metadata",
      type: "json",
      required: false,
      sortOrder: 4,
      active: true,
    });
  assert.equal(metadataAttributeResponse.status, 201);

  const attributesResponse = await adminAgent.get(`/api/categories/${categoryResponse.body.id}/attributes`);
  assert.equal(attributesResponse.status, 200);
  assert.equal(attributesResponse.body.length, 4);
  assert.equal(attributesResponse.body[0].key, "model");

  const productResponse = await adminAgent.post("/api/products").send({
    name: "Smart Sensor",
    sku: "IND-SENSOR-001",
    categoryId: categoryResponse.body.id,
    price: 89.9,
    minimumStock: 3,
    description: "Universal product with attributes",
    attributes: [
      {
        categoryAttributeId: modelAttributeResponse.body.id,
        value: "SS-200",
      },
      {
        categoryAttributeId: weightAttributeResponse.body.id,
        value: 12.5,
      },
      {
        categoryAttributeId: certificationsAttributeResponse.body.id,
        value: ["ISO", "CE"],
      },
      {
        categoryAttributeId: metadataAttributeResponse.body.id,
        value: {
          color: "black",
          battery: true,
        },
      },
    ],
  });
  assert.equal(productResponse.status, 201);
  assert.equal(productResponse.body.sku, "IND-SENSOR-001");
  assert.equal(productResponse.body.attributes.length, 4);
  assert.equal(productResponse.body.attributes[0].label, "Modelo");
  assert.equal(productResponse.body.attributes[0].value, "SS-200");

  const productDetailResponse = await adminAgent.get(`/api/products/${productResponse.body.id}`);
  assert.equal(productDetailResponse.status, 200);
  assert.equal(productDetailResponse.body.attributes.length, 4);
  assert.equal(
    productDetailResponse.body.attributes.find((attribute: { key: string }) => attribute.key === "weight")
      ?.value,
    "12.5",
  );

  const productsListResponse = await adminAgent.get("/api/products?page=1&pageSize=10&search=Smart");
  assert.equal(productsListResponse.status, 200);
  assert.equal(productsListResponse.body.items.length, 1);
  assert.equal(productsListResponse.body.items[0].attributes.length, 4);

  const productsBySkuResponse = await adminAgent.get(
    "/api/products?page=1&pageSize=10&search=IND-SENSOR-001",
  );
  assert.equal(productsBySkuResponse.status, 200);
  assert.equal(productsBySkuResponse.body.total, 1);
  assert.equal(productsBySkuResponse.body.items[0].sku, "IND-SENSOR-001");

  const missingRequiredResponse = await adminAgent.post("/api/products").send({
    name: "Incomplete Sensor",
    categoryId: categoryResponse.body.id,
    price: 50,
    minimumStock: 1,
    attributes: [
      {
        categoryAttributeId: weightAttributeResponse.body.id,
        value: 10,
      },
    ],
  });
  assert.equal(missingRequiredResponse.status, 400);

  const invalidTypeResponse = await adminAgent.post("/api/products").send({
    name: "Invalid Sensor",
    categoryId: categoryResponse.body.id,
    price: 50,
    minimumStock: 1,
    attributes: [
      {
        categoryAttributeId: modelAttributeResponse.body.id,
        value: "SS-201",
      },
      {
        categoryAttributeId: weightAttributeResponse.body.id,
        value: "invalid-number",
      },
    ],
  });
  assert.equal(invalidTypeResponse.status, 400);
});

test("atributos en uso se gestionan de forma segura y productos sin atributos siguen funcionando", async () => {
  const adminAgent = await createAdminAgent();

  const configurableCategoryResponse = await adminAgent.post("/api/categories").send({
    name: "Medical Devices",
    description: "Universal configurable products",
  });
  assert.equal(configurableCategoryResponse.status, 201);

  const plainCategoryResponse = await adminAgent.post("/api/categories").send({
    name: "Plain Goods",
    description: "Products without dynamic attributes",
  });
  assert.equal(plainCategoryResponse.status, 201);

  const brandAttributeResponse = await adminAgent
    .post(`/api/categories/${configurableCategoryResponse.body.id}/attributes`)
    .send({
      key: "brand",
      label: "Brand",
      type: "text",
      required: false,
      sortOrder: 1,
      active: true,
    });
  assert.equal(brandAttributeResponse.status, 201);

  const voltageAttributeResponse = await adminAgent
    .post(`/api/categories/${configurableCategoryResponse.body.id}/attributes`)
    .send({
      key: "voltage",
      label: "Voltage",
      type: "select",
      required: false,
      options: ["110V", "220V"],
      sortOrder: 2,
      active: true,
    });
  assert.equal(voltageAttributeResponse.status, 201);

  const configurableProductResponse = await adminAgent.post("/api/products").send({
    name: "ECG Monitor",
    sku: "MED-ECG-001",
    categoryId: configurableCategoryResponse.body.id,
    price: 650,
    minimumStock: 2,
    attributes: [
      {
        categoryAttributeId: brandAttributeResponse.body.id,
        value: "MedTech",
      },
      {
        categoryAttributeId: voltageAttributeResponse.body.id,
        value: "220V",
      },
    ],
  });
  assert.equal(configurableProductResponse.status, 201);

  const configurableProductWithoutAttributesResponse = await adminAgent.post("/api/products").send({
    name: "Pulse Oximeter",
    sku: "MED-PULSE-001",
    categoryId: configurableCategoryResponse.body.id,
    price: 49,
    minimumStock: 3,
    attributes: [],
  });
  assert.equal(configurableProductWithoutAttributesResponse.status, 201);
  assert.equal(configurableProductWithoutAttributesResponse.body.attributes.length, 0);

  const plainProductResponse = await adminAgent.post("/api/products").send({
    name: "Generic Container",
    sku: "PLAIN-001",
    categoryId: plainCategoryResponse.body.id,
    price: 8.5,
    minimumStock: 4,
  });
  assert.equal(plainProductResponse.status, 201);
  assert.equal(plainProductResponse.body.attributes.length, 0);

  const categoryAttributesResponse = await adminAgent.get(
    `/api/categories/${configurableCategoryResponse.body.id}/attributes`,
  );
  assert.equal(categoryAttributesResponse.status, 200);
  assert.equal(
    categoryAttributesResponse.body.find((attribute: { key: string }) => attribute.key === "brand")
      ?.usageCount,
    1,
  );

  const invalidAttributeUpdateResponse = await adminAgent
    .put(
      `/api/categories/${configurableCategoryResponse.body.id}/attributes/${voltageAttributeResponse.body.id}`,
    )
    .send({
      key: "voltage",
      label: "Voltage",
      type: "select",
      required: false,
      options: ["110V"],
      sortOrder: 2,
      active: true,
    });
  assert.equal(invalidAttributeUpdateResponse.status, 400);

  const invalidRequiredUpdateResponse = await adminAgent
    .put(
      `/api/categories/${configurableCategoryResponse.body.id}/attributes/${brandAttributeResponse.body.id}`,
    )
    .send({
      key: "brand",
      label: "Brand",
      type: "text",
      required: true,
      sortOrder: 1,
      active: true,
    });
  assert.equal(invalidRequiredUpdateResponse.status, 400);

  const deleteAttributeInUseResponse = await adminAgent.delete(
    `/api/categories/${configurableCategoryResponse.body.id}/attributes/${brandAttributeResponse.body.id}`,
  );
  assert.equal(deleteAttributeInUseResponse.status, 409);

  const deactivateAttributeResponse = await adminAgent
    .put(`/api/categories/${configurableCategoryResponse.body.id}/attributes/${brandAttributeResponse.body.id}`)
    .send({
      key: "brand",
      label: "Brand",
      type: "text",
      required: false,
      sortOrder: 1,
      active: false,
    });
  assert.equal(deactivateAttributeResponse.status, 200);
  assert.equal(deactivateAttributeResponse.body.active, false);

  const updatedProductResponse = await adminAgent
    .put(`/api/products/${configurableProductResponse.body.id}`)
    .send({
      name: "ECG Monitor Pro",
      sku: "MED-ECG-001",
      categoryId: configurableCategoryResponse.body.id,
      price: 690,
      minimumStock: 2,
      attributes: [
        {
          categoryAttributeId: voltageAttributeResponse.body.id,
          value: "220V",
        },
      ],
    });
  assert.equal(updatedProductResponse.status, 200);
  assert.equal(updatedProductResponse.body.name, "ECG Monitor Pro");
  assert.equal(
    updatedProductResponse.body.attributes.find((attribute: { key: string }) => attribute.key === "brand")
      ?.value,
    "MedTech",
  );

  const productsByAttributeResponse = await adminAgent.get(
    `/api/products?page=1&pageSize=10&categoryId=${configurableCategoryResponse.body.id}&attributeKey=voltage&attributeValue=220V`,
  );
  assert.equal(productsByAttributeResponse.status, 200);
  assert.equal(productsByAttributeResponse.body.total, 1);
  assert.equal(productsByAttributeResponse.body.items[0].sku, "MED-ECG-001");

  const productsBySkuResponse = await adminAgent.get(
    "/api/products?page=1&pageSize=10&search=PLAIN-001",
  );
  assert.equal(productsBySkuResponse.status, 200);
  assert.equal(productsBySkuResponse.body.total, 1);
  assert.equal(productsBySkuResponse.body.items[0].name, "Generic Container");
});

test("seed inicial es idempotente y permite login con admin por username", async () => {
  const firstSeedResult = await runSeed();
  assert.equal(firstSeedResult.seeded, true);
  assert.equal(firstSeedResult.categories, 4);
  assert.equal(firstSeedResult.products, 8);

  const secondSeedResult = await runSeed();
  assert.equal(secondSeedResult.seeded, true);
  assert.equal(secondSeedResult.categories, 0);
  assert.equal(secondSeedResult.products, 0);

  const agent = request.agent(app);
  const loginResponse = await agent.post("/api/auth/login").send({
    identifier: env.defaultAdmin.username,
    password: env.defaultAdmin.password,
  });

  assert.equal(loginResponse.status, 200);
  assert.equal(loginResponse.body.user.username, env.defaultAdmin.username);
  assert.equal(loginResponse.body.user.role, "admin");

  const categoriesResponse = await agent.get("/api/categories");
  assert.equal(categoriesResponse.status, 200);
  assert.equal(categoriesResponse.body.length, 4);

  const productsResponse = await agent.get("/api/products?page=1&pageSize=20");
  assert.equal(productsResponse.status, 200);
  assert.equal(productsResponse.body.total, 8);
  assert.ok(productsResponse.body.items[0].attributes.length > 0);
});

test("reset password marca mustChangePassword y change-password limpia la bandera", async () => {
  const adminAgent = await createAdminAgent();

  const createUserResponse = await adminAgent.post("/api/users").send({
    name: "Reset User",
    username: "reset-user",
    email: "reset.user@example.com",
    password: "Reset123!",
    role: "operator",
    status: "active",
  });
  assert.equal(createUserResponse.status, 201);

  const resetPasswordResponse = await adminAgent.put(
    `/api/users/${createUserResponse.body.id}/reset-password`,
  ).send({});
  assert.equal(resetPasswordResponse.status, 200);
  assert.equal(resetPasswordResponse.body.userId, createUserResponse.body.id);
  assert.equal(resetPasswordResponse.body.username, "reset-user");
  assert.equal(typeof resetPasswordResponse.body.temporaryPassword, "string");
  assert.equal(resetPasswordResponse.body.temporaryPassword.length, 8);
  assert.equal(resetPasswordResponse.body.message, "Password reset successfully");

  const userAgent = request.agent(app);
  const oldPasswordLoginResponse = await userAgent.post("/api/auth/login").send({
    identifier: "reset-user",
    password: "Reset123!",
  });
  assert.equal(oldPasswordLoginResponse.status, 401);

  const temporaryPasswordLoginResponse = await userAgent.post("/api/auth/login").send({
    identifier: "reset-user",
    password: resetPasswordResponse.body.temporaryPassword,
  });
  assert.equal(temporaryPasswordLoginResponse.status, 200);
  assert.equal(temporaryPasswordLoginResponse.body.user.username, "reset-user");
  assert.equal(temporaryPasswordLoginResponse.body.user.mustChangePassword, true);

  const meBeforeChangeResponse = await userAgent.get("/api/auth/me");
  assert.equal(meBeforeChangeResponse.status, 200);
  assert.equal(meBeforeChangeResponse.body.user.mustChangePassword, true);

  const blockedProductsResponse = await userAgent.get("/api/products");
  assert.equal(blockedProductsResponse.status, 403);

  const changePasswordResponse = await userAgent.post("/api/auth/change-password").send({
    currentPassword: resetPasswordResponse.body.temporaryPassword,
    newPassword: "Updated123!",
  });
  assert.equal(changePasswordResponse.status, 200);
  assert.equal(changePasswordResponse.body.user.mustChangePassword, false);

  const meAfterChangeResponse = await userAgent.get("/api/auth/me");
  assert.equal(meAfterChangeResponse.status, 200);
  assert.equal(meAfterChangeResponse.body.user.mustChangePassword, false);

  const allowedProductsResponse = await userAgent.get("/api/products?page=1&pageSize=5");
  assert.equal(allowedProductsResponse.status, 200);
});

test("en produccion el reset de password no devuelve la contraseña temporal", async () => {
  const previousNodeEnv = env.nodeEnv;
  const adminAgent = await createAdminAgent();
  env.nodeEnv = "production";

  try {
    const createUserResponse = await adminAgent.post("/api/users").send({
      name: "Prod Reset User",
      username: "prod-reset-user",
      email: "prod.reset.user@example.com",
      password: "Reset123!",
      role: "operator",
      status: "active",
    });
    assert.equal(createUserResponse.status, 201);

    const resetPasswordResponse = await adminAgent
      .put(`/api/users/${createUserResponse.body.id}/reset-password`)
      .send({});

    assert.equal(resetPasswordResponse.status, 200);
    assert.equal(resetPasswordResponse.body.message, "Password reset successfully");
    assert.equal("temporaryPassword" in resetPasswordResponse.body, false);
  } finally {
    env.nodeEnv = previousNodeEnv;
  }
});

test("logging no rompe el flujo principal si el registro falla", async () => {
  await query("DROP TABLE critical_event_logs;");

  const adminAgent = await createAdminAgent();

  const categoryResponse = await adminAgent.post("/api/categories").send({
    name: "Logging Category",
  });
  assert.equal(categoryResponse.status, 201);

  const productResponse = await adminAgent.post("/api/products").send({
    name: "Logging Product",
    categoryId: categoryResponse.body.id,
    price: 10,
    minimumStock: 1,
  });
  assert.equal(productResponse.status, 201);

  await runMigrations();
});

test("ubicaciones, lookup por sku barcode y ajustes respetan permisos por rol", async () => {
  const adminAgent = await createAdminAgent();

  const warehouseResponse = await adminAgent.post("/api/warehouses").send({
    name: "Advanced Warehouse",
  });
  assert.equal(warehouseResponse.status, 201);

  const categoryResponse = await adminAgent.post("/api/categories").send({
    name: "Advanced Products",
  });
  assert.equal(categoryResponse.status, 201);

  const productResponse = await adminAgent.post("/api/products").send({
    name: "RFID Reader",
    sku: "ADV-RFID-001",
    barcode: "880000000001",
    categoryId: categoryResponse.body.id,
    price: 299.99,
    minimumStock: 3,
  });
  assert.equal(productResponse.status, 201);
  assert.equal(productResponse.body.barcode, "880000000001");

  const createManagerResponse = await adminAgent.post("/api/users").send({
    name: "Flow Manager",
    username: "flow-manager",
    email: "flow.manager@example.com",
    password: "Manager123!",
    role: "manager",
    status: "active",
  });
  assert.equal(createManagerResponse.status, 201);

  const createOperatorResponse = await adminAgent.post("/api/users").send({
    name: "Flow Operator",
    username: "flow-operator",
    email: "flow.operator@example.com",
    password: "Operator123!",
    role: "operator",
    status: "active",
  });
  assert.equal(createOperatorResponse.status, 201);

  const { agent: managerAgent } = await createAuthenticatedAgent("flow-manager", "Manager123!");
  const { agent: operatorAgent } = await createAuthenticatedAgent("flow-operator", "Operator123!");

  const createLocationResponse = await managerAgent.post("/api/locations").send({
    warehouseId: warehouseResponse.body.id,
    code: "A-ZONE-01",
    name: "Zona A",
    type: "zone",
    active: true,
  });
  assert.equal(createLocationResponse.status, 201);
  assert.equal(createLocationResponse.body.code, "A-ZONE-01");

  const operatorCreateLocationResponse = await operatorAgent.post("/api/locations").send({
    warehouseId: warehouseResponse.body.id,
    code: "OP-BLOCKED",
    name: "Blocked",
    type: "bin",
  });
  assert.equal(operatorCreateLocationResponse.status, 403);

  const stockEntryResponse = await adminAgent.post("/api/inventory/movements").send({
    productId: productResponse.body.id,
    warehouseId: warehouseResponse.body.id,
    warehouseLocationId: createLocationResponse.body.id,
    type: "entry",
    quantity: 20,
    movementDate: "2026-03-18T13:00:00.000Z",
    observation: "Carga avanzada",
  });
  assert.equal(stockEntryResponse.status, 201);
  assert.equal(stockEntryResponse.body.currentStock.quantity, 20);

  const lookupBySkuResponse = await managerAgent.get("/api/products/lookup?sku=ADV-RFID-001");
  assert.equal(lookupBySkuResponse.status, 200);
  assert.equal(lookupBySkuResponse.body.id, productResponse.body.id);
  assert.equal(lookupBySkuResponse.body.barcode, "880000000001");

  const lookupByBarcodeResponse = await managerAgent.get(
    "/api/products/lookup?barcode=880000000001",
  );
  assert.equal(lookupByBarcodeResponse.status, 200);
  assert.equal(lookupByBarcodeResponse.body.id, productResponse.body.id);
  assert.equal(lookupByBarcodeResponse.body.sku, "ADV-RFID-001");

  const createAdjustmentResponse = await managerAgent.post("/api/adjustments").send({
    warehouseId: warehouseResponse.body.id,
    warehouseLocationId: createLocationResponse.body.id,
    productId: productResponse.body.id,
    type: "correction",
    adjustedQuantity: 12,
    reason: "Conteo manual previo a fase 8",
  });
  assert.equal(createAdjustmentResponse.status, 201);
  assert.equal(createAdjustmentResponse.body.previousQuantity, 20);
  assert.equal(createAdjustmentResponse.body.adjustedQuantity, 12);

  const adjustmentMovementsResponse = await managerAgent.get("/api/inventory/movements?limit=10");
  assert.equal(adjustmentMovementsResponse.status, 200);
  const adjustmentMovement = adjustmentMovementsResponse.body.find(
    (movement: { observation?: string | null }) =>
      movement.observation?.includes(`Ajuste #${createAdjustmentResponse.body.id}`),
  );
  assert.ok(adjustmentMovement);
  assert.equal(adjustmentMovement.type, "exit");
  assert.equal(adjustmentMovement.quantity, 8);

  const operatorAdjustmentResponse = await operatorAgent.post("/api/adjustments").send({
    warehouseId: warehouseResponse.body.id,
    productId: productResponse.body.id,
    type: "correction",
    adjustedQuantity: 10,
    reason: "No permitido",
  });
  assert.equal(operatorAdjustmentResponse.status, 403);

  const stockByLocationResponse = await managerAgent.get(
    `/api/inventory/stock?productId=${productResponse.body.id}&warehouseId=${warehouseResponse.body.id}&warehouseLocationId=${createLocationResponse.body.id}`,
  );
  assert.equal(stockByLocationResponse.status, 200);
  assert.equal(stockByLocationResponse.body[0].quantity, 12);
  assert.equal(stockByLocationResponse.body[0].warehouseLocationId, createLocationResponse.body.id);
  await assertMovementLedgerMatchesStock({
    warehouseId: warehouseResponse.body.id,
    warehouseLocationId: createLocationResponse.body.id,
    productId: productResponse.body.id,
  });
});

test("transferencias y conteos ciclicos mantienen consistencia y bloquean stock negativo", async () => {
  const adminAgent = await createAdminAgent();

  const warehouseAResponse = await adminAgent.post("/api/warehouses").send({
    name: "Warehouse A",
  });
  assert.equal(warehouseAResponse.status, 201);

  const warehouseBResponse = await adminAgent.post("/api/warehouses").send({
    name: "Warehouse B",
  });
  assert.equal(warehouseBResponse.status, 201);

  const categoryResponse = await adminAgent.post("/api/categories").send({
    name: "Transfer Goods",
  });
  assert.equal(categoryResponse.status, 201);

  const productResponse = await adminAgent.post("/api/products").send({
    name: "Portable Terminal",
    sku: "TRF-TERM-001",
    barcode: "990000000001",
    categoryId: categoryResponse.body.id,
    price: 1200,
    minimumStock: 2,
  });
  assert.equal(productResponse.status, 201);

  const createManagerResponse = await adminAgent.post("/api/users").send({
    name: "Transfer Manager",
    username: "transfer-manager",
    email: "transfer.manager@example.com",
    password: "Manager123!",
    role: "manager",
    status: "active",
  });
  assert.equal(createManagerResponse.status, 201);

  const createOperatorResponse = await adminAgent.post("/api/users").send({
    name: "Transfer Operator",
    username: "transfer-operator",
    email: "transfer.operator@example.com",
    password: "Operator123!",
    role: "operator",
    status: "active",
  });
  assert.equal(createOperatorResponse.status, 201);

  const { agent: managerAgent } = await createAuthenticatedAgent(
    "transfer.manager@example.com",
    "Manager123!",
  );
  const { agent: operatorAgent } = await createAuthenticatedAgent(
    "transfer.operator@example.com",
    "Operator123!",
  );

  const locationAResponse = await adminAgent.post("/api/locations").send({
    warehouseId: warehouseAResponse.body.id,
    code: "A-BIN-01",
    name: "Bin A1",
    type: "bin",
    active: true,
  });
  assert.equal(locationAResponse.status, 201);

  const locationBResponse = await adminAgent.post("/api/locations").send({
    warehouseId: warehouseBResponse.body.id,
    code: "B-BIN-01",
    name: "Bin B1",
    type: "bin",
    active: true,
  });
  assert.equal(locationBResponse.status, 201);

  const entryResponse = await adminAgent.post("/api/inventory/movements").send({
    productId: productResponse.body.id,
    warehouseId: warehouseAResponse.body.id,
    warehouseLocationId: locationAResponse.body.id,
    type: "entry",
    quantity: 10,
    movementDate: "2026-03-18T14:00:00.000Z",
    observation: "Stock para transferencias",
  });
  assert.equal(entryResponse.status, 201);

  const createTransferResponse = await managerAgent.post("/api/transfers").send({
    fromWarehouseId: warehouseAResponse.body.id,
    toWarehouseId: warehouseBResponse.body.id,
    fromLocationId: locationAResponse.body.id,
    toLocationId: locationBResponse.body.id,
    productId: productResponse.body.id,
    quantity: 6,
    manualDestination: "Cafeteria Central",
    carrierName: "Ruta Norte",
    notes: "Reposicion entre almacenes",
  });
  assert.equal(createTransferResponse.status, 201);
  assert.equal(createTransferResponse.body.status, "pending");
  assert.equal(createTransferResponse.body.manualDestination, "Cafeteria Central");
  assert.equal(createTransferResponse.body.carrierName, "Ruta Norte");

  const operatorApproveResponse = await operatorAgent
    .patch(`/api/transfers/${createTransferResponse.body.id}/approve`)
    .send({});
  assert.equal(operatorApproveResponse.status, 403);

  const approveTransferResponse = await managerAgent
    .patch(`/api/transfers/${createTransferResponse.body.id}/approve`)
    .send({});
  assert.equal(approveTransferResponse.status, 200);
  assert.equal(approveTransferResponse.body.status, "approved");

  const completeTransferResponse = await managerAgent
    .patch(`/api/transfers/${createTransferResponse.body.id}/complete`)
    .send({});
  assert.equal(completeTransferResponse.status, 200);
  assert.equal(completeTransferResponse.body.status, "completed");

  const transferMovementsResponse = await managerAgent.get("/api/inventory/movements?limit=20");
  assert.equal(transferMovementsResponse.status, 200);
  const completedTransferMovements = transferMovementsResponse.body.filter(
    (movement: { observation?: string | null }) =>
      movement.observation?.includes(`Transferencia #${createTransferResponse.body.id}`),
  );
  assert.equal(completedTransferMovements.length, 2);
  assert.equal(
    completedTransferMovements.filter((movement: { type: string }) => movement.type === "entry").length,
    1,
  );
  assert.equal(
    completedTransferMovements.filter((movement: { type: string }) => movement.type === "exit").length,
    1,
  );

  const stockAAfterTransfer = await managerAgent.get(
    `/api/inventory/stock?productId=${productResponse.body.id}&warehouseId=${warehouseAResponse.body.id}&warehouseLocationId=${locationAResponse.body.id}`,
  );
  assert.equal(stockAAfterTransfer.status, 200);
  assert.equal(stockAAfterTransfer.body[0].quantity, 4);

  const stockBAfterTransfer = await managerAgent.get(
    `/api/inventory/stock?productId=${productResponse.body.id}&warehouseId=${warehouseBResponse.body.id}&warehouseLocationId=${locationBResponse.body.id}`,
  );
  assert.equal(stockBAfterTransfer.status, 200);
  assert.equal(stockBAfterTransfer.body[0].quantity, 6);
  await assertMovementLedgerMatchesStock({
    warehouseId: warehouseAResponse.body.id,
    warehouseLocationId: locationAResponse.body.id,
    productId: productResponse.body.id,
  });
  await assertMovementLedgerMatchesStock({
    warehouseId: warehouseBResponse.body.id,
    warehouseLocationId: locationBResponse.body.id,
    productId: productResponse.body.id,
  });

  const blockedTransferResponse = await managerAgent.post("/api/transfers").send({
    fromWarehouseId: warehouseAResponse.body.id,
    toWarehouseId: warehouseBResponse.body.id,
    fromLocationId: locationAResponse.body.id,
    toLocationId: locationBResponse.body.id,
    productId: productResponse.body.id,
    quantity: 50,
    notes: "Intento invalido",
  });
  assert.equal(blockedTransferResponse.status, 201);

  const blockedApproveResponse = await managerAgent
    .patch(`/api/transfers/${blockedTransferResponse.body.id}/approve`)
    .send({});
  assert.equal(blockedApproveResponse.status, 200);

  const blockedCompleteResponse = await managerAgent
    .patch(`/api/transfers/${blockedTransferResponse.body.id}/complete`)
    .send({});
  assert.equal(blockedCompleteResponse.status, 400);

  const cancelTransferResponse = await managerAgent.post("/api/transfers").send({
    fromWarehouseId: warehouseAResponse.body.id,
    toWarehouseId: warehouseBResponse.body.id,
    fromLocationId: locationAResponse.body.id,
    toLocationId: locationBResponse.body.id,
    productId: productResponse.body.id,
    quantity: 1,
    notes: "Transferencia a cancelar",
  });
  assert.equal(cancelTransferResponse.status, 201);

  const cancelResultResponse = await managerAgent
    .patch(`/api/transfers/${cancelTransferResponse.body.id}/cancel`)
    .send({});
  assert.equal(cancelResultResponse.status, 200);
  assert.equal(cancelResultResponse.body.status, "cancelled");

  const transferReportResponse = await managerAgent.get("/api/reports/transfers/export?format=excel");
  assert.equal(transferReportResponse.status, 200);
  assert.match(
    transferReportResponse.headers["content-type"],
    /application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet/,
  );
  assert.match(
    transferReportResponse.headers["content-disposition"],
    /transfers-report-.*\.xlsx/,
  );
  const workbook = XLSX.read(transferReportResponse.body, { type: "buffer" });
  const transferSheet = workbook.Sheets[workbook.SheetNames[0] ?? ""];
  assert.ok(transferSheet);
  const transferRows = XLSX.utils.sheet_to_json<(string | number)[]>(transferSheet, { header: 1 });
  assert.ok(transferRows.length > 0);

  const transferPdfResponse = await managerAgent.get("/api/reports/transfers/export?format=pdf");
  assert.equal(transferPdfResponse.status, 200);
  assert.match(transferPdfResponse.headers["content-type"], /application\/pdf/);

  const createCycleCountResponse = await managerAgent.post("/api/cycle-counts").send({
    warehouseId: warehouseBResponse.body.id,
    warehouseLocationId: locationBResponse.body.id,
    notes: "Revision post transferencia",
  });
  assert.equal(createCycleCountResponse.status, 201);

  const addCycleItemResponse = await managerAgent
    .post(`/api/cycle-counts/${createCycleCountResponse.body.id}/items`)
    .send({
      productId: productResponse.body.id,
    });
  assert.equal(addCycleItemResponse.status, 201);
  assert.equal(addCycleItemResponse.body.expectedQuantity, 6);

  const startCycleCountResponse = await managerAgent
    .patch(`/api/cycle-counts/${createCycleCountResponse.body.id}/start`)
    .send({});
  assert.equal(startCycleCountResponse.status, 200);
  assert.equal(startCycleCountResponse.body.status, "in_progress");

  const updateCycleItemResponse = await managerAgent
    .patch(`/api/cycle-counts/${createCycleCountResponse.body.id}/items/${addCycleItemResponse.body.id}`)
    .send({
      countedQuantity: 4,
      resolved: false,
    });
  assert.equal(updateCycleItemResponse.status, 200);
  assert.equal(updateCycleItemResponse.body.difference, -2);

  const completeCycleCountResponse = await managerAgent
    .patch(`/api/cycle-counts/${createCycleCountResponse.body.id}/complete`)
    .send({
      applyAdjustments: true,
    });
  assert.equal(completeCycleCountResponse.status, 200);
  assert.equal(completeCycleCountResponse.body.status, "completed");
  assert.equal(completeCycleCountResponse.body.items[0].difference, -2);

  const cycleCountMovementsResponse = await managerAgent.get("/api/inventory/movements?limit=20");
  assert.equal(cycleCountMovementsResponse.status, 200);
  const cycleCountMovement = cycleCountMovementsResponse.body.find(
    (movement: { observation?: string | null }) =>
      movement.observation?.includes(`Conteo ciclico #${createCycleCountResponse.body.id}`),
  );
  assert.ok(cycleCountMovement);
  assert.equal(cycleCountMovement.type, "exit");
  assert.equal(cycleCountMovement.quantity, 2);

  const stockBAfterCycleCount = await managerAgent.get(
    `/api/inventory/stock?productId=${productResponse.body.id}&warehouseId=${warehouseBResponse.body.id}&warehouseLocationId=${locationBResponse.body.id}`,
  );
  assert.equal(stockBAfterCycleCount.status, 200);
  assert.equal(stockBAfterCycleCount.body[0].quantity, 4);
  await assertMovementLedgerMatchesStock({
    warehouseId: warehouseBResponse.body.id,
    warehouseLocationId: locationBResponse.body.id,
    productId: productResponse.body.id,
  });

  const cycleCountsListResponse = await operatorAgent.get("/api/cycle-counts");
  assert.equal(cycleCountsListResponse.status, 200);
  assert.equal(cycleCountsListResponse.body.length, 1);
});

test("despachos crean lineas y descuentan stock consolidado sin romper transferencias", async () => {
  const adminAgent = await createAdminAgent();

  const warehouseResponse = await adminAgent.post("/api/warehouses").send({
    name: "Dispatch Warehouse",
    description: "Warehouse used for dispatch tests",
  });
  assert.equal(warehouseResponse.status, 201);

  const categoryResponse = await adminAgent.post("/api/categories").send({
    name: "Dispatch Category",
    description: "Dispatch test category",
  });
  assert.equal(categoryResponse.status, 201);

  const productOneResponse = await adminAgent.post("/api/products").send({
    name: "Coffee Beans",
    description: "Dispatchable stock",
    categoryId: categoryResponse.body.id,
    price: 12.5,
    minimumStock: 2,
  });
  assert.equal(productOneResponse.status, 201);

  const productTwoResponse = await adminAgent.post("/api/products").send({
    name: "Paper Cups",
    description: "Secondary dispatch stock",
    categoryId: categoryResponse.body.id,
    price: 3.25,
    minimumStock: 5,
  });
  assert.equal(productTwoResponse.status, 201);

  const stockEntryOneResponse = await adminAgent.post("/api/inventory/movements").send({
    productId: productOneResponse.body.id,
    warehouseId: warehouseResponse.body.id,
    type: "entry",
    quantity: 10,
    movementDate: "2026-03-18T18:00:00.000Z",
    observation: "Dispatch stock one",
  });
  assert.equal(stockEntryOneResponse.status, 201);

  const stockEntryTwoResponse = await adminAgent.post("/api/inventory/movements").send({
    productId: productTwoResponse.body.id,
    warehouseId: warehouseResponse.body.id,
    type: "entry",
    quantity: 6,
    movementDate: "2026-03-18T18:05:00.000Z",
    observation: "Dispatch stock two",
  });
  assert.equal(stockEntryTwoResponse.status, 201);

  const dispatchResponse = await adminAgent.post("/api/dispatches").send({
    manualDestination: "Cafeteria Central",
    carrierName: "Ruta Norte",
    notes: "Despacho inicial de prueba",
    items: [
      {
        productId: productOneResponse.body.id,
        quantity: 4,
        unitPrice: 999.99,
      },
      {
        productId: productTwoResponse.body.id,
        quantity: 2,
        unitPrice: 0.01,
      },
    ],
  });
  assert.equal(dispatchResponse.status, 201);
  assert.equal(dispatchResponse.body.manualDestination, "Cafeteria Central");
  assert.equal(dispatchResponse.body.carrierName, "Ruta Norte");
  assert.equal(dispatchResponse.body.items.length, 2);
  assert.equal(dispatchResponse.body.totalAmount, 56.5);
  assert.equal(dispatchResponse.body.items[0].unitPrice, 12.5);
  assert.equal(dispatchResponse.body.items[1].unitPrice, 3.25);

  const dispatchMovementsResponse = await adminAgent.get("/api/inventory/movements?limit=20");
  assert.equal(dispatchMovementsResponse.status, 200);
  const dispatchExitMovements = dispatchMovementsResponse.body.filter(
    (movement: { observation?: string | null; type: string }) =>
      movement.type === "exit" && movement.observation?.includes(`Despacho #${dispatchResponse.body.id}`),
  );
  assert.equal(dispatchExitMovements.length, 2);
  assert.ok(dispatchExitMovements.every((movement: { observation?: string | null }) =>
    movement.observation?.includes("Cafeteria Central") &&
    movement.observation?.includes("Ruta Norte"),
  ));

  const productOneStockResponse = await adminAgent.get(
    `/api/inventory/stock?productId=${productOneResponse.body.id}&warehouseId=${warehouseResponse.body.id}`,
  );
  assert.equal(productOneStockResponse.status, 200);
  assert.equal(productOneStockResponse.body[0].quantity, 6);

  const productTwoStockResponse = await adminAgent.get(
    `/api/inventory/stock?productId=${productTwoResponse.body.id}&warehouseId=${warehouseResponse.body.id}`,
  );
  assert.equal(productTwoStockResponse.status, 200);
  assert.equal(productTwoStockResponse.body[0].quantity, 4);

  const dispatchPdfResponse = await adminAgent.get(
    `/api/dispatches/${dispatchResponse.body.id}/export?format=pdf`,
  );
  assert.equal(dispatchPdfResponse.status, 200);
  assert.equal(dispatchPdfResponse.headers["content-type"], "application/pdf");

  const dispatchExcelResponse = await adminAgent.get(
    `/api/dispatches/${dispatchResponse.body.id}/export?format=excel`,
  );
  assert.equal(dispatchExcelResponse.status, 200);
  assert.equal(
    dispatchExcelResponse.headers["content-type"],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );

  const dispatchOdfResponse = await adminAgent.get(
    `/api/dispatches/${dispatchResponse.body.id}/export?format=odf`,
  );
  assert.equal(dispatchOdfResponse.status, 200);
  assert.equal(
    dispatchOdfResponse.headers["content-type"],
    "application/vnd.oasis.opendocument.spreadsheet",
  );

  const dispatchListResponse = await adminAgent.get("/api/dispatches");
  assert.equal(dispatchListResponse.status, 200);
  assert.ok(dispatchListResponse.body.length >= 1);
  const createdDispatchFromList = dispatchListResponse.body.find(
    (dispatch: { id: number; items: unknown[] }) => dispatch.id === dispatchResponse.body.id,
  );
  assert.ok(createdDispatchFromList);
  assert.equal(createdDispatchFromList.items.length, 2);

  const insufficientDispatchResponse = await adminAgent.post("/api/dispatches").send({
    manualDestination: "Restaurante Sur",
    carrierName: "Ruta Sur",
    items: [
      {
        productId: productTwoResponse.body.id,
        quantity: 99,
        unitPrice: 3.25,
      },
    ],
  });
  assert.equal(insufficientDispatchResponse.status, 400);
});
