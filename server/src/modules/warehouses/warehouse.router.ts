import { Router } from "express";
import { asyncHandler } from "../../common/http";
import { readId } from "../../common/validation";
import { requireRoles } from "../auth/auth.middleware";
import {
  createWarehouse,
  deleteWarehouse,
  getWarehouseById,
  listWarehouses,
  updateWarehouse,
} from "./warehouse.service";
import { parseWarehouseInput } from "./warehouse.validation";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_request, response) => {
    const warehouses = await listWarehouses();
    response.json(warehouses);
  }),
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const warehouse = await getWarehouseById(readId(request.params.id, "id"));

    if (!warehouse) {
      response.status(404).json({
        message: "Warehouse not found.",
      });
      return;
    }

    response.json(warehouse);
  }),
);

router.post(
  "/",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    const warehouse = await createWarehouse(parseWarehouseInput(request.body));
    response.status(201).json(warehouse);
  }),
);

router.put(
  "/:id",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    const warehouse = await updateWarehouse(
      readId(request.params.id, "id"),
      parseWarehouseInput(request.body),
    );

    response.json(warehouse);
  }),
);

router.delete(
  "/:id",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    await deleteWarehouse(readId(request.params.id, "id"));
    response.status(204).send();
  }),
);

export default router;
