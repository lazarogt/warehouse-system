import { Buffer } from "node:buffer";
import type { Dispatch, ReportFormat } from "../../../../shared/src";
import { AppError } from "../../common/errors";
import { activeFilter } from "../../common/soft-delete";
import { query } from "../../lib/db";
import { getDispatchById } from "../dispatches/dispatch.service";
import {
  buildPdfReport,
  buildSpreadsheetReport,
  createReportFileDate,
  formatReportDateTime,
  formatMovementTypeLabel,
  formatReportCurrency,
  formatReportNumber,
  type ReportSummaryItem,
  type ReportTableColumn,
} from "./report-style";

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

type TransferExportRow = {
  productName: string;
  productSku: string | null;
  fromWarehouseName: string;
  fromLocationName: string | null;
  toWarehouseName: string;
  toLocationName: string | null;
  manualDestination: string | null;
  carrierName: string | null;
  quantity: number;
  status: "pending" | "approved" | "completed" | "cancelled";
  requestedByName: string;
  createdAt: string;
};

type FileExportResult = {
  buffer: Buffer;
  contentType: string;
  filename: string;
};

type DispatchExportRow = {
  productName: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number;
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

const getTransfersForExport = async () => {
  const result = await query<TransferExportRow>(
    `
      SELECT
        p.name AS "productName",
        p.sku AS "productSku",
        from_w.name AS "fromWarehouseName",
        from_l.name AS "fromLocationName",
        to_w.name AS "toWarehouseName",
        to_l.name AS "toLocationName",
        st.manual_destination AS "manualDestination",
        st.carrier_name AS "carrierName",
        st.quantity,
        st.status,
        req_user.name AS "requestedByName",
        st.created_at AS "createdAt"
      FROM stock_transfers st
      JOIN products p ON p.id = st.product_id
      JOIN warehouses from_w ON from_w.id = st.from_warehouse_id
      JOIN warehouses to_w ON to_w.id = st.to_warehouse_id
      LEFT JOIN warehouse_locations from_l ON from_l.id = st.from_location_id
      LEFT JOIN warehouse_locations to_l ON to_l.id = st.to_location_id
      JOIN users req_user ON req_user.id = st.requested_by
      ORDER BY st.created_at DESC, st.id DESC;
    `,
  );

  if (result.rows.length === 0) {
    throw new AppError(404, "No transfer data available to export.");
  }

  return result.rows;
};

const formatTransferOrigin = (transfer: TransferExportRow) =>
  transfer.fromLocationName
    ? `${transfer.fromWarehouseName} / ${transfer.fromLocationName}`
    : transfer.fromWarehouseName;

const formatTransferDestination = (transfer: TransferExportRow) => {
  const manualDestination = transfer.manualDestination?.trim();

  if (manualDestination) {
    return manualDestination;
  }

  return transfer.toLocationName
    ? `${transfer.toWarehouseName} / ${transfer.toLocationName}`
    : transfer.toWarehouseName;
};

const formatTransferStatus = (status: TransferExportRow["status"]) => {
  switch (status) {
    case "pending":
      return "Pendiente";
    case "approved":
      return "Aprobada";
    case "completed":
      return "Completada";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
};

const dispatchColumns: ReportTableColumn<DispatchExportRow>[] = [
  {
    header: "Producto",
    width: 28,
    value: (item) => item.productName,
  },
  {
    header: "Cantidad",
    width: 12,
    align: "right",
    kind: "number",
    value: (item) => item.quantity,
  },
  {
    header: "Precio unitario",
    width: 16,
    align: "right",
    kind: "currency",
    value: (item) => item.unitPrice,
  },
  {
    header: "Subtotal",
    width: 16,
    align: "right",
    kind: "currency",
    value: (item) => item.lineTotal,
  },
];

const productColumns: ReportTableColumn<ProductExportRow>[] = [
  {
    header: "Producto",
    width: 26,
    value: (product) => product.name,
  },
  {
    header: "Categoria",
    width: 20,
    value: (product) => product.categoryName,
  },
  {
    header: "Precio",
    width: 14,
    align: "right",
    kind: "currency",
    value: (product) => product.price,
  },
  {
    header: "Stock actual",
    width: 14,
    align: "right",
    kind: "number",
    value: (product) => product.currentStock,
  },
  {
    header: "Stock minimo",
    width: 14,
    align: "right",
    kind: "number",
    value: (product) => product.minimumStock,
  },
  {
    header: "Estado",
    width: 16,
    value: (product) =>
      product.currentStock <= product.minimumStock
        ? "Stock bajo"
        : product.currentStock <= product.minimumStock + 5
          ? "Seguimiento"
          : "Estable",
  },
];

const movementColumns: ReportTableColumn<MovementExportRow>[] = [
  {
    header: "Producto",
    width: 24,
    value: (movement) => movement.productName,
  },
  {
    header: "Tipo",
    width: 14,
    value: (movement) => formatMovementTypeLabel(movement.type),
  },
  {
    header: "Cantidad",
    width: 12,
    align: "right",
    kind: "number",
    value: (movement) => movement.quantity,
  },
  {
    header: "Usuario",
    width: 18,
    value: (movement) => movement.userName,
  },
  {
    header: "Fecha",
    width: 22,
    align: "right",
    kind: "datetime",
    value: (movement) => movement.movementDate,
  },
];

const transferColumns: ReportTableColumn<TransferExportRow>[] = [
  {
    header: "Producto",
    width: 22,
    value: (transfer) =>
      transfer.productSku?.trim()
        ? `${transfer.productName} · ${transfer.productSku}`
        : transfer.productName,
  },
  {
    header: "Origen",
    width: 22,
    value: (transfer) => formatTransferOrigin(transfer),
  },
  {
    header: "Destino",
    width: 24,
    value: (transfer) => formatTransferDestination(transfer),
  },
  {
    header: "Transportista",
    width: 18,
    value: (transfer) => transfer.carrierName,
  },
  {
    header: "Cantidad",
    width: 12,
    align: "right",
    kind: "number",
    value: (transfer) => transfer.quantity,
  },
  {
    header: "Estado",
    width: 14,
    value: (transfer) => formatTransferStatus(transfer.status),
  },
  {
    header: "Fecha",
    width: 20,
    align: "right",
    kind: "datetime",
    value: (transfer) => transfer.createdAt,
  },
];

const buildProductsSummary = (products: ProductExportRow[]): ReportSummaryItem[] => {
  const lowStockCount = products.filter((product) => product.currentStock <= product.minimumStock).length;
  const totalInventoryValue = products.reduce(
    (sum, product) => sum + product.price * Math.max(product.currentStock, 0),
    0,
  );

  return [
    { label: "Productos activos", value: formatReportNumber(products.length) },
    { label: "Productos con stock bajo", value: formatReportNumber(lowStockCount) },
    { label: "Valor estimado del inventario", value: formatReportCurrency(totalInventoryValue) },
  ];
};

const buildMovementsSummary = (movements: MovementExportRow[]): ReportSummaryItem[] => {
  const entryCount = movements.filter((movement) => movement.type === "entry").length;
  const exitCount = movements.filter((movement) => movement.type === "exit").length;
  const totalQuantity = movements.reduce((sum, movement) => sum + movement.quantity, 0);

  return [
    { label: "Movimientos totales", value: formatReportNumber(movements.length) },
    { label: "Entradas", value: formatReportNumber(entryCount) },
    { label: "Salidas", value: formatReportNumber(exitCount) },
    { label: "Cantidad movilizada", value: formatReportNumber(totalQuantity) },
  ];
};

const buildTransfersSummary = (transfers: TransferExportRow[]): ReportSummaryItem[] => {
  const manualDestinations = transfers.filter((transfer) => transfer.manualDestination?.trim()).length;
  const assignedCarriers = transfers.filter((transfer) => transfer.carrierName?.trim()).length;
  const completedTransfers = transfers.filter((transfer) => transfer.status === "completed").length;

  return [
    { label: "Transferencias registradas", value: formatReportNumber(transfers.length) },
    { label: "Destinos manuales", value: formatReportNumber(manualDestinations) },
    { label: "Transportistas informados", value: formatReportNumber(assignedCarriers) },
    { label: "Transferencias completadas", value: formatReportNumber(completedTransfers) },
  ];
};

const buildDispatchSummary = (dispatch: Dispatch): ReportSummaryItem[] => [
  { label: "Fecha", value: formatReportDateTime(dispatch.createdAt) },
  { label: "Destino", value: dispatch.manualDestination },
  { label: "Transportista", value: dispatch.carrierName },
  { label: "Total general", value: formatReportCurrency(dispatch.totalAmount) },
];

const mapDispatchRows = (dispatch: Dispatch): DispatchExportRow[] => [
  ...dispatch.items.map((item) => ({
    productName: item.productSku?.trim()
      ? `${item.productName} · ${item.productSku}`
      : item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  })),
  {
    productName: "TOTAL GENERAL",
    quantity: null,
    unitPrice: null,
    lineTotal: dispatch.totalAmount,
  },
];

const exportProductsSpreadsheet = async (bookType: "xlsx" | "ods"): Promise<FileExportResult> => {
  const products = await getProductsForExport();
  const extension = bookType === "xlsx" ? "xlsx" : "ods";
  const contentType =
    bookType === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/vnd.oasis.opendocument.spreadsheet";

  return {
    buffer: buildSpreadsheetReport({
      sheetName: "Productos",
      bookType,
      meta: {
        title: "Reporte operativo de productos",
        description:
          "Vista formal del catalogo activo con stock consolidado, umbrales minimos y estado operativo.",
      },
      summary: buildProductsSummary(products),
      columns: productColumns,
      rows: products,
    }),
    contentType,
    filename: `products-report-${createReportFileDate()}.${extension}`,
  };
};

const exportProductsPdf = async (): Promise<FileExportResult> => {
  const products = await getProductsForExport();
  const buffer = await buildPdfReport({
    meta: {
      title: "Reporte operativo de productos",
      description:
        "Documento formal del catalogo activo, preparado para revision operativa, control de stock y seguimiento de alertas.",
    },
    summary: buildProductsSummary(products),
    columns: productColumns,
    rows: products,
  });

  return {
    buffer,
    contentType: "application/pdf",
    filename: `products-report-${createReportFileDate()}.pdf`,
  };
};

const exportMovementsSpreadsheet = async (bookType: "xlsx" | "ods"): Promise<FileExportResult> => {
  const movements = await getMovementsForExport();
  const extension = bookType === "xlsx" ? "xlsx" : "ods";
  const contentType =
    bookType === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/vnd.oasis.opendocument.spreadsheet";

  return {
    buffer: buildSpreadsheetReport({
      sheetName: "Movimientos",
      bookType,
      meta: {
        title: "Reporte operativo de movimientos",
        description:
          "Consolidado formal de entradas y salidas de inventario para trazabilidad, auditoria y control diario.",
      },
      summary: buildMovementsSummary(movements),
      columns: movementColumns,
      rows: movements,
    }),
    contentType,
    filename: `movements-report-${createReportFileDate()}.${extension}`,
  };
};

const exportMovementsPdf = async (): Promise<FileExportResult> => {
  const movements = await getMovementsForExport();
  const buffer = await buildPdfReport({
    meta: {
      title: "Reporte operativo de movimientos",
      description:
        "Documento formal de trazabilidad con movimientos recientes de inventario, responsables y cantidades registradas.",
    },
    summary: buildMovementsSummary(movements),
    columns: movementColumns,
    rows: movements,
  });

  return {
    buffer,
    contentType: "application/pdf",
    filename: `movements-report-${createReportFileDate()}.pdf`,
  };
};

const exportTransfersSpreadsheet = async (bookType: "xlsx" | "ods"): Promise<FileExportResult> => {
  const transfers = await getTransfersForExport();
  const extension = bookType === "xlsx" ? "xlsx" : "ods";
  const contentType =
    bookType === "xlsx"
      ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      : "application/vnd.oasis.opendocument.spreadsheet";

  return {
    buffer: buildSpreadsheetReport({
      sheetName: "Transferencias",
      bookType,
      meta: {
        title: "Reporte operativo de transferencias",
        description:
          "Consolidado formal de traslados entre almacenes y destinos manuales con trazabilidad operativa.",
      },
      summary: buildTransfersSummary(transfers),
      columns: transferColumns,
      rows: transfers,
    }),
    contentType,
    filename: `transfers-report-${createReportFileDate()}.${extension}`,
  };
};

const exportTransfersPdf = async (): Promise<FileExportResult> => {
  const transfers = await getTransfersForExport();
  const buffer = await buildPdfReport({
    meta: {
      title: "Reporte operativo de transferencias",
      description:
        "Documento formal de traslados con origen, destino visible, transportista y fecha de registro.",
    },
    summary: buildTransfersSummary(transfers),
    columns: transferColumns,
    rows: transfers,
  });

  return {
    buffer,
    contentType: "application/pdf",
    filename: `transfers-report-${createReportFileDate()}.pdf`,
  };
};

export const exportProductsReport = async (format: ReportFormat) => {
  if (format === "pdf") {
    return exportProductsPdf();
  }

  return exportProductsSpreadsheet(format === "odf" ? "ods" : "xlsx");
};

export const exportMovementsReport = async (format: ReportFormat) => {
  if (format === "pdf") {
    return exportMovementsPdf();
  }

  return exportMovementsSpreadsheet(format === "odf" ? "ods" : "xlsx");
};

export const exportTransfersReport = async (format: ReportFormat) => {
  if (format === "pdf") {
    return exportTransfersPdf();
  }

  return exportTransfersSpreadsheet(format === "odf" ? "ods" : "xlsx");
};

export const exportDispatchReport = async (
  dispatchId: number,
  format: "pdf" | "excel" | "odf",
): Promise<FileExportResult> => {
  const dispatch = await getDispatchById(dispatchId);

  if (!dispatch) {
    throw new AppError(404, "Dispatch not found.");
  }

  const rows = mapDispatchRows(dispatch);
  const summary = buildDispatchSummary(dispatch);
  const meta = {
    title: "DESPACHO",
    description: "Reporte operativo del despacho.",
  };

  if (format === "pdf") {
    return {
      buffer: await buildPdfReport({
        meta,
        summary,
        columns: dispatchColumns,
        rows,
      }),
      contentType: "application/pdf",
      filename: `dispatch-${dispatch.id}-${createReportFileDate()}.pdf`,
    };
  }

  const bookType = format === "odf" ? "ods" : "xlsx";
  const extension = format === "odf" ? "ods" : "xlsx";
  const contentType =
    format === "odf"
      ? "application/vnd.oasis.opendocument.spreadsheet"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return {
    buffer: buildSpreadsheetReport({
      sheetName: `Despacho ${dispatch.id}`,
      bookType,
      meta,
      summary,
      columns: dispatchColumns,
      rows,
    }),
    contentType,
    filename: `dispatch-${dispatch.id}-${createReportFileDate()}.${extension}`,
  };
};
