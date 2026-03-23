import { Router } from "express";
import { notFoundError } from "../../common/errors";
import { asyncHandler } from "../../common/http";
import { readId } from "../../common/validation";
import { requireRoles } from "../auth/auth.middleware";
import {
  approveTransfer,
  cancelTransfer,
  completeTransfer,
  createTransfer,
  getTransferById,
  listTransfers,
} from "./transfer.service";
import { parseCreateTransferInput, parseTransferFilters } from "./transfer.validation";

const router = Router();

router.get(
  "/",
  asyncHandler(async (request, response) => {
    response.json(await listTransfers(parseTransferFilters(request.query)));
  }),
);

router.get(
  "/:id",
  asyncHandler(async (request, response) => {
    const transfer = await getTransferById(readId(request.params.id, "id"));

    if (!transfer) {
      throw notFoundError("Transfer");
    }

    response.json(transfer);
  }),
);

router.post(
  "/",
  requireRoles("admin", "manager", "operator"),
  asyncHandler(async (request, response) => {
    response.status(201).json(
      await createTransfer(parseCreateTransferInput(request.body), request.authenticatedUser!.id),
    );
  }),
);

router.patch(
  "/:id/approve",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    response.json(await approveTransfer(readId(request.params.id, "id"), request.authenticatedUser!.id));
  }),
);

router.patch(
  "/:id/complete",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    response.json(await completeTransfer(readId(request.params.id, "id"), request.authenticatedUser!.id));
  }),
);

router.patch(
  "/:id/cancel",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    response.json(await cancelTransfer(readId(request.params.id, "id")));
  }),
);

export default router;
