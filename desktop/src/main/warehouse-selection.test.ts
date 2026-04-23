import { test } from "vitest";
import assert from "node:assert/strict";
import {
  parseStoredWarehouseId,
  resolveSelectedWarehouseId,
} from "../../../client/src/lib/warehouse-selection";

const warehouses = [
  {
    id: 3,
    name: "Central",
    location: "Centro",
    isActive: true,
    createdAt: "2026-04-20T10:00:00.000Z",
  },
  {
    id: 8,
    name: "Norte",
    location: "Norte",
    isActive: true,
    createdAt: "2026-04-20T11:00:00.000Z",
  },
];

test("resolveSelectedWarehouseId keeps the current warehouse when it is still available", () => {
  const selectedWarehouseId = resolveSelectedWarehouseId({
    availableWarehouses: warehouses,
    currentSelectedWarehouseId: 8,
    storedWarehouseId: 3,
  });

  assert.equal(selectedWarehouseId, 8);
});

test("resolveSelectedWarehouseId falls back to the stored warehouse when current is missing", () => {
  const selectedWarehouseId = resolveSelectedWarehouseId({
    availableWarehouses: warehouses,
    currentSelectedWarehouseId: 99,
    storedWarehouseId: 3,
  });

  assert.equal(selectedWarehouseId, 3);
});

test("resolveSelectedWarehouseId falls back to the first warehouse when no saved choice is valid", () => {
  const selectedWarehouseId = resolveSelectedWarehouseId({
    availableWarehouses: warehouses,
    currentSelectedWarehouseId: 99,
    storedWarehouseId: 42,
  });

  assert.equal(selectedWarehouseId, 3);
});

test("parseStoredWarehouseId accepts only positive integer values", () => {
  assert.equal(parseStoredWarehouseId("12"), 12);
  assert.equal(parseStoredWarehouseId("0"), null);
  assert.equal(parseStoredWarehouseId("abc"), null);
  assert.equal(parseStoredWarehouseId(null), null);
});
