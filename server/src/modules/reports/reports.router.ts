import { Router } from "express";
import { asyncHandler } from "../../common/http";
import { requireRoles } from "../auth/auth.middleware";
import { exportMovementsReport, exportProductsReport, exportTransfersReport } from "./reports.service";
import { parseReportFormat } from "./reports.validation";

const router = Router();

router.get(
  "/products/export",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    const result = await exportProductsReport(parseReportFormat(request.query.format));
    response.setHeader("Content-Type", result.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    response.send(result.buffer);
  }),
);

router.get(
  "/movements/export",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    const result = await exportMovementsReport(parseReportFormat(request.query.format));
    response.setHeader("Content-Type", result.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    response.send(result.buffer);
  }),
);

router.get(
  "/transfers/export",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    const result = await exportTransfersReport(parseReportFormat(request.query.format));
    response.setHeader("Content-Type", result.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    response.send(result.buffer);
  }),
);

export default router;
