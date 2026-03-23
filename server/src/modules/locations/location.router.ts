import { Router } from "express";
import { notFoundError } from "../../common/errors";
import { asyncHandler } from "../../common/http";
import { readId } from "../../common/validation";
import { requireRoles } from "../auth/auth.middleware";
import { createLocation, deleteLocation, getLocationById, listLocations, updateLocation } from "./location.service";
import { parseWarehouseLocationInput } from "./location.validation";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_request, response) => {
    response.json(await listLocations());
  }),
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const location = await getLocationById(readId(request.params.id, "id"));

    if (!location) {
      throw notFoundError("Location");
    }

    response.json(location);
  }),
);

router.post(
  "/",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    response.status(201).json(await createLocation(parseWarehouseLocationInput(request.body)));
  }),
);

router.put(
  "/:id",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    response.json(
      await updateLocation(readId(request.params.id, "id"), parseWarehouseLocationInput(request.body)),
    );
  }),
);

router.delete(
  "/:id",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    await deleteLocation(readId(request.params.id, "id"));
    response.status(204).send();
  }),
);

export default router;
