import { Router } from "express";
import { notFoundError } from "../../common/errors";
import { asyncHandler } from "../../common/http";
import { readId } from "../../common/validation";
import { requireRoles } from "../auth/auth.middleware";
import { createAdjustment, getAdjustmentById, listAdjustments } from "./adjustment.service";
import { parseStockAdjustmentInput } from "./adjustment.validation";

const router = Router();

router.get(
  "/",
  asyncHandler(async (_request, response) => {
    response.json(await listAdjustments());
  }),
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const adjustment = await getAdjustmentById(readId(request.params.id, "id"));

    if (!adjustment) {
      throw notFoundError("Adjustment");
    }

    response.json(adjustment);
  }),
);

router.post(
  "/",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    response.status(201).json(
      await createAdjustment(parseStockAdjustmentInput(request.body), request.authenticatedUser!.id),
    );
  }),
);

export default router;
