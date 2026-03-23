import { Router } from "express";
import { asyncHandler } from "../../common/http";
import { listLowStockAlerts } from "./alerts.service";

const router = Router();

router.get(
  "/low-stock",
  asyncHandler(async (_request, response) => {
    const alerts = await listLowStockAlerts();
    response.json(alerts);
  }),
);

export default router;
