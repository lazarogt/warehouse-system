import { Router } from "express";
import { AppError } from "../../common/errors";
import { asyncHandler } from "../../common/http";
import { requireRoles } from "../auth/auth.middleware";
import { getCurrentStock, listRecentStockMovements, registerStockMovement } from "./inventory.service";
import { parseStockFilters, parseStockMovementFilters, parseStockMovementInput } from "./inventory.validation";

const router = Router();

router.post(
  "/movements",
  requireRoles("admin", "manager", "operator"),
  asyncHandler(async (request, response) => {
    const userId = request.authenticatedUser?.id;

    if (!userId) {
      throw new AppError(401, "Authentication required.");
    }

    const result = await registerStockMovement(parseStockMovementInput(request.body), userId);
    response.status(201).json(result);
  }),
);

router.get(
  "/stock",
  asyncHandler(async (request, response) => {
    const stock = await getCurrentStock(parseStockFilters(request.query));
    response.json(stock);
  }),
);

router.get(
  "/movements",
  asyncHandler(async (request, response) => {
    const movements = await listRecentStockMovements(parseStockMovementFilters(request.query));
    response.json(movements);
  }),
);

export default router;
