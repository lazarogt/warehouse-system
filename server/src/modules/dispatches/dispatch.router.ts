import { Router } from "express";
import { asyncHandler } from "../../common/http";
import { readId } from "../../common/validation";
import { requireRoles } from "../auth/auth.middleware";
import { createDispatch, listDispatches } from "./dispatch.service";
import { parseCreateDispatchInput } from "./dispatch.validation";
import { exportDispatchReport } from "../reports/reports.service";
import { AppError } from "../../common/errors";

const router = Router();

router.get(
  "/",
  requireRoles("admin", "manager", "operator"),
  asyncHandler(async (_request, response) => {
    response.json(await listDispatches());
  }),
);

router.post(
  "/",
  requireRoles("admin", "manager", "operator"),
  asyncHandler(async (request, response) => {
    response
      .status(201)
      .json(await createDispatch(parseCreateDispatchInput(request.body), request.authenticatedUser!.id));
  }),
);

router.get(
  "/:id/export",
  requireRoles("admin", "manager"),
  asyncHandler(async (request, response) => {
    const format = request.query.format;

    if (format !== "pdf" && format !== "excel" && format !== "odf") {
      throw new AppError(400, "format must be either pdf, excel or odf.");
    }

    const result = await exportDispatchReport(readId(request.params.id, "id"), format);
    response.setHeader("Content-Type", result.contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    response.send(result.buffer);
  }),
);

export default router;
