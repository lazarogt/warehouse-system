import { Buffer } from "node:buffer";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";

type SpreadsheetBookType = "xlsx" | "ods";

type ReportSummaryItem = {
  label: string;
  value: string;
};

type ReportMeta = {
  title: string;
  description: string;
  generatedAt?: Date;
  systemName?: string;
};

type ReportColumnKind = "text" | "number" | "currency" | "datetime";

type ReportTableColumn<T> = {
  header: string;
  width: number;
  align?: "left" | "center" | "right";
  kind?: ReportColumnKind;
  value: (row: T) => string | number | Date | null | undefined;
};

type SpreadsheetBuildInput<T> = {
  sheetName: string;
  meta: ReportMeta;
  summary?: ReportSummaryItem[];
  columns: ReportTableColumn<T>[];
  rows: T[];
  bookType: SpreadsheetBookType;
};

type PdfBuildInput<T> = {
  meta: ReportMeta;
  summary?: ReportSummaryItem[];
  columns: ReportTableColumn<T>[];
  rows: T[];
};

const SYSTEM_NAME = "Warehouse Management System";
const REPORT_DATE_FORMAT = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short",
});
const REPORT_NUMBER_FORMAT = new Intl.NumberFormat("es-MX");
const REPORT_CURRENCY_FORMAT = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

const safeString = (value: string | number | Date | null | undefined) => {
  if (value === null || value === undefined) {
    return "N/A";
  }

  if (value instanceof Date) {
    return REPORT_DATE_FORMAT.format(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? REPORT_NUMBER_FORMAT.format(value) : "0";
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "N/A";
};

export const formatReportDateTime = (value: string | Date) =>
  REPORT_DATE_FORMAT.format(value instanceof Date ? value : new Date(value));

export const formatReportNumber = (value: number) =>
  Number.isFinite(value) ? REPORT_NUMBER_FORMAT.format(value) : "0";

export const formatReportCurrency = (value: number) =>
  REPORT_CURRENCY_FORMAT.format(Number.isFinite(value) ? value : 0);

export const formatMovementTypeLabel = (type: "entry" | "exit") =>
  type === "entry" ? "Entrada" : "Salida";

export const createReportFileDate = (value = new Date()) => value.toISOString().slice(0, 10);

const normalizeMeta = (meta: ReportMeta) => ({
  systemName: meta.systemName ?? SYSTEM_NAME,
  title: meta.title,
  description: meta.description,
  generatedAt: meta.generatedAt ?? new Date(),
});

const getSpreadsheetCellValue = <T>(row: T, column: ReportTableColumn<T>) => {
  const rawValue = column.value(row);

  if (rawValue === null || rawValue === undefined) {
    return "N/A";
  }

  if (rawValue instanceof Date) {
    return rawValue;
  }

  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? rawValue : 0;
  }

  const trimmed = rawValue.trim();
  return trimmed.length > 0 ? trimmed : "N/A";
};

export const buildSpreadsheetReport = <T>({
  sheetName,
  meta,
  summary = [],
  columns,
  rows,
  bookType,
}: SpreadsheetBuildInput<T>) => {
  const normalizedMeta = normalizeMeta(meta);
  const worksheet = XLSX.utils.aoa_to_sheet([
    [normalizedMeta.systemName],
    [normalizedMeta.title],
    [normalizedMeta.description],
    [`Generado: ${formatReportDateTime(normalizedMeta.generatedAt)}`],
    [],
    ["Resumen ejecutivo"],
    ...summary.map((item) => [item.label, item.value]),
    [],
    columns.map((column) => column.header),
    ...rows.map((row) => columns.map((column) => getSpreadsheetCellValue(row, column))),
  ]);

  const workbook = XLSX.utils.book_new();
  const headerRowIndex = summary.length + 9;
  const lastColumnLetter = XLSX.utils.encode_col(columns.length - 1);
  const lastRowIndex = headerRowIndex + rows.length;

  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: columns.length - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: columns.length - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: columns.length - 1 } },
    { s: { r: 5, c: 0 }, e: { r: 5, c: columns.length - 1 } },
  ];
  worksheet["!cols"] = columns.map((column) => ({ wch: column.width }));
  worksheet["!autofilter"] = {
    ref: `A${headerRowIndex}:${lastColumnLetter}${lastRowIndex}`,
  };
  worksheet["!rows"] = [{ hpt: 22 }, { hpt: 24 }, { hpt: 20 }, { hpt: 18 }];

  for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
    const headerCell = worksheet[`${XLSX.utils.encode_col(columnIndex)}${headerRowIndex}`];

    if (headerCell) {
      headerCell.s = {
        font: { bold: true },
        alignment: { horizontal: "center", vertical: "center" },
      };
    }
  }

  rows.forEach((row, rowIndex) => {
    columns.forEach((column, columnIndex) => {
      const cellAddress = `${XLSX.utils.encode_col(columnIndex)}${headerRowIndex + rowIndex + 1}`;
      const cell = worksheet[cellAddress];

      if (!cell) {
        return;
      }

      if (column.kind === "currency") {
        cell.z = '"$"#,##0.00';
      } else if (column.kind === "number") {
        cell.z = "#,##0";
      } else if (column.kind === "datetime") {
        cell.z = "dd/mm/yyyy hh:mm";
      }

      cell.s = {
        alignment: {
          horizontal: column.align ?? "left",
          vertical: "center",
        },
      };
    });
  });

  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType });
};

const drawPdfFooter = (document: PDFKit.PDFDocument) => {
  const range = document.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    document.switchToPage(index);
    document
      .font("Helvetica")
      .fontSize(8)
      .fillColor("#64748B")
      .text(
        `Documento ${index + 1} de ${range.count}`,
        document.page.margins.left,
        document.page.height - document.page.margins.bottom + 10,
        {
          width: document.page.width - document.page.margins.left - document.page.margins.right,
          align: "right",
        },
      );
  }
};

const renderPdfTable = <T>(
  document: PDFKit.PDFDocument,
  columns: ReportTableColumn<T>[],
  rows: T[],
) => {
  const availableWidth = document.page.width - document.page.margins.left - document.page.margins.right;
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const scaledWidths = columns.map((column) => (column.width / totalWidth) * availableWidth);
  const rowHeight = 24;
  const left = document.page.margins.left;
  const bottomLimit = document.page.height - document.page.margins.bottom - 30;

  const renderHeader = () => {
    const rowTop = document.y;
    let x = left;

    document
      .save()
      .rect(left, rowTop, availableWidth, rowHeight)
      .fill("#E2E8F0")
      .restore();

    columns.forEach((column, index) => {
      document
        .font("Helvetica-Bold")
        .fontSize(9)
        .fillColor("#0F172A")
        .text(column.header, x + 6, rowTop + 7, {
          width: scaledWidths[index] - 12,
          align: column.align ?? "left",
        });
      x += scaledWidths[index];
    });

    document.y = rowTop + rowHeight + 6;
  };

  renderHeader();

  rows.forEach((row, rowIndex) => {
    if (document.y + rowHeight > bottomLimit) {
      document.addPage();
      renderHeader();
    }

    if (rowIndex % 2 === 0) {
      const rowTop = document.y;
      document
        .save()
        .rect(left, rowTop, availableWidth, rowHeight)
        .fill("#F8FAFC")
        .restore();
    }

    const rowTop = document.y;
    let x = left;

    columns.forEach((column, index) => {
      const rawValue = column.value(row);
      const formattedValue =
        column.kind === "currency" && typeof rawValue === "number"
          ? formatReportCurrency(rawValue)
          : column.kind === "number" && typeof rawValue === "number"
            ? formatReportNumber(rawValue)
            : column.kind === "datetime"
              ? formatReportDateTime(rawValue instanceof Date ? rawValue : String(rawValue ?? ""))
              : safeString(rawValue);

      document
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#1E293B")
        .text(formattedValue, x + 6, rowTop + 7, {
          width: scaledWidths[index] - 12,
          align: column.align ?? "left",
          ellipsis: true,
        });
      x += scaledWidths[index];
    });

    document.y = rowTop + rowHeight;
  });
};

export const buildPdfReport = async <T>({ meta, summary = [], columns, rows }: PdfBuildInput<T>) => {
  const normalizedMeta = normalizeMeta(meta);

  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      margin: 42,
      size: "A4",
      bufferPages: true,
    });
    const chunks: Buffer[] = [];

    document.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    document.font("Helvetica-Bold").fontSize(11).fillColor("#0F172A").text(normalizedMeta.systemName);
    document.moveDown(0.3);
    document.fontSize(20).text(normalizedMeta.title);
    document.moveDown(0.2);
    document.font("Helvetica").fontSize(10).fillColor("#475569").text(normalizedMeta.description);
    document.moveDown(0.2);
    document
      .fontSize(9)
      .fillColor("#64748B")
      .text(`Generado: ${formatReportDateTime(normalizedMeta.generatedAt)}`);

    if (summary.length > 0) {
      document.moveDown(1);
      document.font("Helvetica-Bold").fontSize(11).fillColor("#0F172A").text("Resumen ejecutivo");
      document.moveDown(0.4);

      summary.forEach((item) => {
        document
          .font("Helvetica-Bold")
          .fontSize(9)
          .fillColor("#0F172A")
          .text(item.label, { continued: true })
          .font("Helvetica")
          .fillColor("#334155")
          .text(`  ${item.value}`);
      });
    }

    document.moveDown(1);
    renderPdfTable(document, columns, rows);
    drawPdfFooter(document);
    document.end();
  });
};

export type { ReportMeta, ReportSummaryItem, ReportTableColumn };
