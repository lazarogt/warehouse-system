import { Router } from "express";
import { notFoundError } from "../../common/errors";
import { asyncHandler } from "../../common/http";
import { readId } from "../../common/validation";
import { requireRoles } from "../auth/auth.middleware";
import {
  addCycleCountItem,
  cancelCycleCount,
  completeCycleCount,
  createCycleCount,
  getCycleCountById,
  listCycleCounts,
  startCycleCount,
  updateCycleCountItem,
} from "./cycle-count.service";
import {
  parseCompleteCycleCountInput,
  parseCreateCycleCountInput,
  parseCreateCycleCountItemInput,
  parseUpdateCycleCountItemInput,
} from "./cycle-count.validation";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_request, response) => {
    response.json(await listCycleCounts());
  }),
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const cycleCount = await getCycleCountById(readId(request.params.id, "id"));

    if (!cycleCount) {
      throw notFoundError("Cycle count");
    }

    response.json(cycleCount);
  }),
);

router.post(
  "/",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    response.status(201).json(
      await createCycleCount(parseCreateCycleCountInput(request.body), request.authenticatedUser!.id),
    );
  }),
);

router.post(
  "/:id/items",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    response.status(201).json(
      await addCycleCountItem(
        readId(request.params.id, "id"),
        parseCreateCycleCountItemInput(request.body),
      ),
    );
  }),
);

router.patch(
  "/:id/items/:itemId",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    response.json(
      await updateCycleCountItem(
        readId(request.params.id, "id"),
        readId(request.params.itemId, "itemId"),
        parseUpdateCycleCountItemInput(request.body),
      ),
    );
  }),
);

router.patch(
  "/:id/start",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    response.json(await startCycleCount(readId(request.params.id, "id")));
  }),
);

router.patch(
  "/:id/complete",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    response.json(
      await completeCycleCount(
        readId(request.params.id, "id"),
        parseCompleteCycleCountInput(request.body),
        request.authenticatedUser!.id,
      ),
    );
  }),
);

router.patch(
  "/:id/cancel",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    response.json(await cancelCycleCount(readId(request.params.id, "id")));
  }),
);

export default router;
