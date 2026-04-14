import type { ReportFormat } from "../../../../shared/src";
import { AppError } from "../../common/errors";

export const parseReportFormat = (value: unknown): ReportFormat => {
  if (value === "excel" || value === "pdf" || value === "odf") {
    return value;
  }

  throw new AppError(400, "format must be either excel, pdf or odf.");
};
