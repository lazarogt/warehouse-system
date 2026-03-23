import { Buffer } from "node:buffer";
import PDFDocument from "pdfkit";
import * as XLSX from "xlsx";
import type { ReportFormat } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { activeFilter } from "../../common/soft-delete";
import { query } from "../../config/db";

type ProductExportRow = {
  name: string;
  categoryName: string;
  price: number;
  currentStock: number;
  minimumStock: number;
};

type MovementExportRow = {
  productName: string;
  type: "entry" | "exit";
  quantity: number;
  userName: string;
  movementDate: string;
};

type FileExportResult = {
  buffer: Buffer;
  contentType: string;
  filename: string;
};

const buildPdfBuffer = (build: (document: PDFKit.PDFDocument) => void) => {
  return new Promise<Buffer>((resolve, reject) => {
    const document = new PDFDocument({
      margin: 36,
      size: "A4",
    });
    const chunks: Buffer[] = [];

    document.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    build(document);
    document.end();
  });
};

const createTimestamp = () => {
  return new Date().toISOString().slice(0, 10);
};

const getProductsForExport = async () => {
  const result = await query<ProductExportRow>(
    `
      SELECT
        p.name,
        c.name AS "categoryName",
        p.price::float8 AS price,
        COALESCE(SUM(ws.quantity), 0)::int AS "currentStock",
        p.minimum_stock AS "minimumStock"
      FROM products p
      JOIN categories c ON c.id = p.category_id
      LEFT JOIN warehouse_stock ws ON ws.product_id = p.id
      WHERE ${activeFilter("p")}
      GROUP BY
        p.id,
        c.name
      ORDER BY p.name ASC;
    `,
  );

  if (result.rows.length === 0) {
    throw new AppError(404, "No product data available to export.");
  }

  return result.rows;
};

const getMovementsForExport = async () => {
  const result = await query<MovementExportRow>(
    `
      SELECT
        p.name AS "productName",
        sm.type,
        sm.quantity,
        u.name AS "userName",
        sm.movement_date AS "movementDate"
      FROM stock_movements sm
      JOIN products p ON p.id = sm.product_id
      JOIN users u ON u.id = sm.user_id
      ORDER BY sm.movement_date DESC, sm.id DESC;
    `,
  );

  if (result.rows.length === 0) {
    throw new AppError(404, "No movement data available to export.");
  }

  return result.rows;
};

const exportProductsExcel = async (): Promise<FileExportResult> => {
  const products = await getProductsForExport();
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(
    products.map((product) => ({
      Nombre: product.name,
      Categoria: product.categoryName,
      Precio: product.price,
      "Stock actual": product.currentStock,
      "Stock minimo": product.minimumStock,
    })),
  );

  XLSX.utils.book_append_sheet(workbook, worksheet, "Productos");

  return {
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `products-report-${createTimestamp()}.xlsx`,
  };
};

const exportProductsPdf = async (): Promise<FileExportResult> => {
  const products = await getProductsForExport();
  const buffer = await buildPdfBuffer((document) => {
    document.fontSize(18).text("Reporte de Productos", { underline: true });
    document.moveDown();
    document.fontSize(11);

    products.forEach((product, index) => {
      document
        .text(
          `${index + 1}. ${product.name} | ${product.categoryName} | Precio: $${product.price.toFixed(2)} | Stock actual: ${product.currentStock} | Stock minimo: ${product.minimumStock}`,
        )
        .moveDown(0.5);
    });
  });

  return {
    buffer,
    contentType: "application/pdf",
    filename: `products-report-${createTimestamp()}.pdf`,
  };
};

const exportMovementsExcel = async (): Promise<FileExportResult> => {
  const movements = await getMovementsForExport();
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(
    movements.map((movement) => ({
      Producto: movement.productName,
      Tipo: movement.type,
      Cantidad: movement.quantity,
      Usuario: movement.userName,
      Fecha: new Date(movement.movementDate).toLocaleString(),
    })),
  );

  XLSX.utils.book_append_sheet(workbook, worksheet, "Movimientos");

  return {
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    filename: `movements-report-${createTimestamp()}.xlsx`,
  };
};

const exportMovementsPdf = async (): Promise<FileExportResult> => {
  const movements = await getMovementsForExport();
  const buffer = await buildPdfBuffer((document) => {
    document.fontSize(18).text("Reporte de Movimientos", { underline: true });
    document.moveDown();
    document.fontSize(11);

    movements.forEach((movement, index) => {
      document
        .text(
          `${index + 1}. ${movement.productName} | ${movement.type} | Cantidad: ${movement.quantity} | Usuario: ${movement.userName} | Fecha: ${new Date(movement.movementDate).toLocaleString()}`,
        )
        .moveDown(0.5);
    });
  });

  return {
    buffer,
    contentType: "application/pdf",
    filename: `movements-report-${createTimestamp()}.pdf`,
  };
};

export const exportProductsReport = async (format: ReportFormat) => {
  return format === "excel" ? exportProductsExcel() : exportProductsPdf();
};

export const exportMovementsReport = async (format: ReportFormat) => {
  return format === "excel" ? exportMovementsExcel() : exportMovementsPdf();
};
