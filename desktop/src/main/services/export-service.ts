import { dialog } from "electron";
import ExcelJS from "exceljs";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import type {
  DesktopExportPayload,
  DesktopExportResult,
} from "../../../../shared/src/types/desktop-export-ipc";
import { DatabaseValidationError, type WarehouseDataService } from "./warehouse-data-service";

const DEFAULT_APP_NAME = "warehouse-system";

type ExportColumn = {
  header: string;
  key: string;
  width: number;
};

type ExportRow = Record<string, string | number>;

type ExportDataset = {
  columns: ExportColumn[];
  defaultBaseName: string;
  rows: ExportRow[];
  sheetName: string;
  subtitle?: string;
  title: string;
};

type SaveDialogResult = Awaited<ReturnType<typeof dialog.showSaveDialog>>;

type CreateDesktopExportServiceOptions = {
  appName?: string;
  saveDialog?: (options: Electron.SaveDialogOptions) => Promise<SaveDialogResult>;
  warehouseDataService: WarehouseDataService;
};

export type DesktopExportService = {
  exportExcel(payload: DesktopExportPayload): Promise<DesktopExportResult>;
  exportPdf(payload: DesktopExportPayload): Promise<DesktopExportResult>;
};

function formatDateForFilename(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function getWarehouseLabel(
  warehouseDataService: WarehouseDataService,
  warehouseId?: number,
): string | undefined {
  if (!warehouseId) {
    return undefined;
  }

  const warehouse = warehouseDataService
    .listWarehouses()
    .find((candidate) => candidate.id === warehouseId);

  return warehouse?.name;
}

function buildDataset(
  warehouseDataService: WarehouseDataService,
  payload: DesktopExportPayload,
): ExportDataset {
  const warehouseName = getWarehouseLabel(warehouseDataService, payload.warehouseId);

  if (payload.reportType === "dispatches") {
    const rows = warehouseDataService
      .listStockMovements(
        payload.warehouseId ? { warehouseId: payload.warehouseId } : undefined,
      )
      .filter((movement) => movement.reason === "dispatch" && movement.type === "out")
      .map((movement) => ({
        producto: movement.productName ?? `Producto #${movement.productId}`,
        cantidad: movement.quantity,
        almacen: movement.warehouseName ?? `Almacen #${movement.warehouseId}`,
        cliente: movement.metadata?.customer ?? "Sin cliente",
        observacion: movement.metadata?.notes ?? "",
        fecha: formatDateTime(movement.date),
      }));

    return {
      title: "Reporte de despachos",
      subtitle: warehouseName ? `Almacen: ${warehouseName}` : undefined,
      sheetName: "Despachos",
      defaultBaseName: "despacho",
      columns: [
        { header: "Producto", key: "producto", width: 32 },
        { header: "Cantidad", key: "cantidad", width: 12 },
        { header: "Almacen", key: "almacen", width: 28 },
        { header: "Cliente", key: "cliente", width: 28 },
        { header: "Observacion", key: "observacion", width: 36 },
        { header: "Fecha", key: "fecha", width: 22 },
      ],
      rows,
    };
  }

  if (payload.reportType === "inventory") {
    if (!payload.warehouseId) {
      throw new DatabaseValidationError("Selecciona un almacen para exportar el inventario.");
    }

    const rows = warehouseDataService.listWarehouseInventory(payload.warehouseId).map((item) => ({
      producto: item.productName,
      sku: item.productSku,
      almacen: item.warehouseName,
      cantidad: item.quantity,
    }));

    return {
      title: "Inventario por almacen",
      subtitle: warehouseName ? `Almacen: ${warehouseName}` : undefined,
      sheetName: "Inventario",
      defaultBaseName: "inventario",
      columns: [
        { header: "Producto", key: "producto", width: 34 },
        { header: "SKU", key: "sku", width: 20 },
        { header: "Almacen", key: "almacen", width: 28 },
        { header: "Cantidad", key: "cantidad", width: 12 },
      ],
      rows,
    };
  }

  const rows = warehouseDataService
    .listStockMovements(payload.warehouseId ? { warehouseId: payload.warehouseId } : undefined)
    .map((movement) => ({
      producto: movement.productName ?? `Producto #${movement.productId}`,
      tipo: movement.type === "in" ? "Entrada" : "Salida",
      motivo:
        movement.reason === "dispatch"
          ? "Despacho"
          : movement.reason === "transfer"
            ? "Transferencia"
            : "Ajuste",
      cantidad: movement.quantity,
      almacen: movement.warehouseName ?? `Almacen #${movement.warehouseId}`,
      fecha: formatDateTime(movement.date),
    }));

  return {
    title: "Reporte de movimientos",
    subtitle: warehouseName ? `Almacen: ${warehouseName}` : undefined,
    sheetName: "Movimientos",
    defaultBaseName: "movimientos",
    columns: [
      { header: "Producto", key: "producto", width: 32 },
      { header: "Tipo", key: "tipo", width: 14 },
      { header: "Motivo", key: "motivo", width: 18 },
      { header: "Cantidad", key: "cantidad", width: 12 },
      { header: "Almacen", key: "almacen", width: 28 },
      { header: "Fecha", key: "fecha", width: 22 },
    ],
    rows,
  };
}

async function promptSavePath(
  saveDialog: (options: Electron.SaveDialogOptions) => Promise<SaveDialogResult>,
  dataset: ExportDataset,
  extension: "pdf" | "xlsx",
): Promise<string | null> {
  const result = await saveDialog({
    title: dataset.title,
    defaultPath: `${dataset.defaultBaseName}-${formatDateForFilename(new Date())}.${extension}`,
    filters: [
      {
        name: extension === "pdf" ? "PDF" : "Excel",
        extensions: [extension],
      },
    ],
  });

  return result.canceled ? null : result.filePath ?? null;
}

function assertHasRows(dataset: ExportDataset): void {
  if (dataset.rows.length === 0) {
    throw new DatabaseValidationError("No hay datos para exportar.");
  }
}

function writePdf(filePath: string, appName: string, dataset: ExportDataset): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: "A4",
    });
    const stream = fs.createWriteStream(filePath);

    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);
    doc.pipe(stream);

    doc.fontSize(16).text(appName);
    doc.moveDown(0.3);
    doc.fontSize(13).text(dataset.title);
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#555").text(`Fecha: ${formatDateTime(new Date().toISOString())}`);

    if (dataset.subtitle) {
      doc.moveDown(0.2);
      doc.text(dataset.subtitle);
    }

    doc.moveDown(1);
    doc.fillColor("#000");
    doc.fontSize(9);

    const columns = dataset.columns.slice(0, 5);
    const printableRows = dataset.rows.map((row) => {
      const nextRow: ExportRow = {};

      for (const column of columns) {
        nextRow[column.key] = row[column.key] ?? "";
      }

      return nextRow;
    });

    const totalWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const columnWidth = totalWidth / columns.length;
    let currentY = doc.y;

    const drawRow = (row: ExportRow, header = false) => {
      let currentX = doc.page.margins.left;

      if (currentY > doc.page.height - 80) {
        doc.addPage();
        currentY = doc.y;
      }

      for (const column of columns) {
        const value = String(row[column.key] ?? "");
        doc
          .rect(currentX, currentY, columnWidth, 24)
          .strokeOpacity(0.15)
          .stroke();
        doc
          .fillColor(header ? "#111827" : "#1F2937")
          .text(value, currentX + 6, currentY + 7, {
            width: columnWidth - 12,
            ellipsis: true,
            lineBreak: false,
          });
        currentX += columnWidth;
      }

      currentY += 24;
    };

    drawRow(
      Object.fromEntries(columns.map((column) => [column.key, column.header])),
      true,
    );

    for (const row of printableRows) {
      drawRow(row);
    }

    doc.end();
  });
}

async function writeExcel(filePath: string, appName: string, dataset: ExportDataset): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(dataset.sheetName);

  worksheet.columns = dataset.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width,
  }));

  worksheet.addRow([]);
  worksheet.insertRow(1, [appName]);
  worksheet.insertRow(2, [dataset.title]);
  worksheet.insertRow(
    3,
    [dataset.subtitle ?? `Fecha: ${formatDateTime(new Date().toISOString())}`],
  );
  worksheet.insertRow(4, []);

  const headerRowNumber = 5;
  const headerRow = worksheet.getRow(headerRowNumber);

  for (const row of dataset.rows) {
    worksheet.addRow(row);
  }

  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
  });

  await workbook.xlsx.writeFile(filePath);
}

export function createDesktopExportService(
  options: CreateDesktopExportServiceOptions,
): DesktopExportService {
  const appName = options.appName ?? DEFAULT_APP_NAME;
  const saveDialog = options.saveDialog ?? ((dialogOptions) => dialog.showSaveDialog(dialogOptions));
  const { warehouseDataService } = options;

  return {
    async exportPdf(payload) {
      const dataset = buildDataset(warehouseDataService, payload);
      assertHasRows(dataset);
      const filePath = await promptSavePath(saveDialog, dataset, "pdf");

      if (!filePath) {
        return {
          canceled: true,
          filePath: null,
          reportType: payload.reportType,
        };
      }

      await writePdf(filePath, appName, dataset);

      return {
        canceled: false,
        filePath,
        reportType: payload.reportType,
      };
    },
    async exportExcel(payload) {
      const dataset = buildDataset(warehouseDataService, payload);
      assertHasRows(dataset);
      const filePath = await promptSavePath(saveDialog, dataset, "xlsx");

      if (!filePath) {
        return {
          canceled: true,
          filePath: null,
          reportType: payload.reportType,
        };
      }

      await writeExcel(filePath, appName, dataset);

      return {
        canceled: false,
        filePath,
        reportType: payload.reportType,
      };
    },
  };
}
