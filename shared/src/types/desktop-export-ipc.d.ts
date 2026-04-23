export type DesktopExportReportType = "dispatches" | "inventory" | "movements";

export interface DesktopExportPayload {
  reportType: DesktopExportReportType;
  warehouseId?: number;
}

export interface DesktopExportResult {
  canceled: boolean;
  filePath: string | null;
  reportType: DesktopExportReportType;
}
