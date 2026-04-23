import { memo, useMemo, type ReactNode } from "react";
import type { Category, CategoryAttribute, Product } from "../../../shared/src";
import { t } from "../i18n";
import ActionGroup from "./ActionGroup";
import {
  getStockProgress,
  getStockTone,
  safeCurrency,
  safeInteger,
  safeText,
  safeTitle,
} from "../lib/format";
import MotionButton from "./MotionButton";
import type { WarehouseScopedProduct } from "../services/data-provider";

type ProductFilters = {
  search: string;
  categoryId: string;
  attributeKey: string;
  attributeValue: string;
  maximumMinimumStock: string;
  maximumCurrentStock: string;
};

type ProductListProps = {
  products: WarehouseScopedProduct[];
  loading: boolean;
  deletingProductId: number | null;
  canManage: boolean;
  canDelete: boolean;
  canExport: boolean;
  categories: Category[];
  attributeOptions: CategoryAttribute[];
  showWarehouseColumn: boolean;
  filters: ProductFilters;
  quickLookup: string;
  lookupLoading: boolean;
  onFiltersChange: (filters: ProductFilters) => void;
  onQuickLookupChange: (value: string) => void;
  onQuickLookupSubmit: () => void;
  onCreate: () => void;
  onViewDetails: (product: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
};

type ProductRowProps = {
  product: WarehouseScopedProduct;
  canManage: boolean;
  canDelete: boolean;
  isDeleting: boolean;
  showWarehouseColumn: boolean;
  onViewDetails: (product: Product) => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
};

type TableActionButtonProps = {
  children: ReactNode;
  ariaLabel: string;
  onClick: () => void;
  disabled?: boolean;
  className: string;
};

const pageSizeOptions = [5, 10, 20, 50] as const;

const TableActionButton = memo(function TableActionButton({
  children,
  ariaLabel,
  onClick,
  disabled = false,
  className,
}: TableActionButtonProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {children}
    </button>
  );
});

const stockToneClasses = {
  critical: {
    badge: "bg-rose-500/15 text-rose-100",
    track: "bg-rose-500/10",
    fill: "bg-rose-400",
  },
  low: {
    badge: "bg-amber-500/15 text-amber-100",
    track: "bg-amber-500/10",
    fill: "bg-amber-400",
  },
  healthy: {
    badge: "bg-emerald-500/15 text-emerald-100",
    track: "bg-emerald-500/10",
    fill: "bg-emerald-400",
  },
} as const;

const ProductRow = memo(function ProductRow({
  product,
  canManage,
  canDelete,
  isDeleting,
  showWarehouseColumn,
  onViewDetails,
  onEdit,
  onDelete,
}: ProductRowProps) {
  const name = safeText(product.name, t("products.nameNoData"));
  const sku = safeText(product.sku, t("common.noDefined"));
  const barcode = safeText(product.barcode, t("common.noDefined"));
  const description = safeText(product.description, "");
  const categoryName = safeText(product.categoryName, t("common.noData"));
  const currentStock = safeInteger(product.currentStock);
  const minimumStock = safeInteger(product.minimumStock);
  const tone = getStockTone(product.currentStock, product.minimumStock);
  const stockProgress = getStockProgress(product.currentStock, product.minimumStock);
  const toneClasses = stockToneClasses[tone];

  return (
    <tr className="border-t border-white/10 align-top motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-white/[0.035]">
      <td className="px-5 py-5">
        <div className="min-w-0 space-y-1.5">
          <p className="truncate text-sm font-semibold text-white" title={safeTitle(product.name, name)}>
            {name}
          </p>
          <p
            className="truncate text-xs uppercase tracking-[0.18em] text-cyan-200"
            title={`SKU ${safeTitle(product.sku, sku)}`}
          >
            SKU {sku}
          </p>
          <p
            className="truncate text-xs uppercase tracking-[0.18em] text-emerald-200"
            title={`${t("common.barcode")} ${safeTitle(product.barcode, barcode)}`}
          >
            {t("common.barcode")} {barcode}
          </p>
          {description ? (
            <p className="truncate text-sm text-slate-400" title={description}>
              {description}
            </p>
          ) : null}
        </div>
      </td>

      <td className="px-5 py-5 text-left text-sm text-slate-200">
        <span className="block truncate" title={categoryName}>
          {categoryName}
        </span>
      </td>
      {showWarehouseColumn && (
        <td className="px-5 py-5 text-left text-sm text-slate-200">
          <span className="block truncate" title={product.warehouseName ?? t("common.noDefined")}>
            {product.warehouseName ?? t("common.noDefined")}
          </span>
        </td>
      )}
      <td className="px-5 py-5 text-right text-sm text-slate-200">{safeCurrency(product.price)}</td>
      <td className="px-5 py-5 text-right">
        <div className="ml-auto flex w-[140px] flex-col items-end gap-2">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${toneClasses.badge}`}
            title={`${t("common.stock")} ${t("common.current").toLowerCase()} ${currentStock}`}
          >
            {currentStock}
          </span>
          <div className={`h-1.5 w-full overflow-hidden rounded-full ${toneClasses.track}`} aria-hidden="true">
            <div
              className={`h-full rounded-full ${toneClasses.fill}`}
              style={{ width: `${stockProgress}%` }}
            />
          </div>
        </div>
      </td>
      <td
        className="px-5 py-5 text-right text-sm text-slate-200"
        title={`${t("common.stock")} ${t("common.minimum").toLowerCase()} ${minimumStock}`}
      >
        {minimumStock}
      </td>
      <td className="w-40 px-5 py-5 text-right">
        <div className="flex flex-col items-end gap-2 flex-none">
          <TableActionButton
            ariaLabel={`${t("common.view")} ${t("common.detail").toLowerCase()} ${name}`}
            onClick={() => onViewDetails(product)}
            className="min-h-[40px] w-32 rounded-xl border border-cyan-400/20 px-3.5 text-sm text-cyan-100 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-cyan-500/10"
          >
            {t("common.detail")}
          </TableActionButton>

          {canManage && (
            <TableActionButton
              ariaLabel={`${t("common.edit")} ${name}`}
              onClick={() => onEdit(product)}
              className="min-h-[40px] w-32 rounded-xl border border-white/10 px-3.5 text-sm text-slate-200 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-white/5 hover:text-white"
            >
              {t("common.edit")}
            </TableActionButton>
          )}

          {canDelete && (
            <TableActionButton
              ariaLabel={`${t("common.delete")} ${name}`}
              disabled={isDeleting}
              onClick={() => onDelete(product)}
              className="min-h-[40px] w-32 rounded-xl border border-rose-400/20 px-3.5 text-sm text-rose-200 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? t("loading.processing") : t("common.delete")}
            </TableActionButton>
          )}
        </div>
      </td>
    </tr>
  );
});

function ProductList({
  products,
  loading,
  deletingProductId,
  canManage,
  canDelete,
  canExport,
  categories,
  attributeOptions,
  showWarehouseColumn,
  filters,
  quickLookup,
  lookupLoading,
  onFiltersChange,
  onQuickLookupChange,
  onQuickLookupSubmit,
  onCreate,
  onViewDetails,
  onEdit,
  onDelete,
  total,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onExportExcel,
  onExportPdf,
}: ProductListProps) {
  const categoryOptions = useMemo(
    () =>
      categories.map((category) => (
        <option key={category.id} value={category.id} className="bg-slate-900">
          {category.name}
        </option>
      )),
    [categories],
  );

  const attributeOptionNodes = useMemo(
    () =>
      attributeOptions.map((attribute) => (
        <option key={attribute.id} value={attribute.key} className="bg-slate-900">
          {attribute.label}
        </option>
      )),
    [attributeOptions],
  );

  const productRows = useMemo(
    () =>
      products.map((product) => (
        <ProductRow
          key={showWarehouseColumn ? `${product.id}-${product.warehouseId ?? "all"}` : product.id}
          product={product}
          canManage={canManage}
          canDelete={canDelete}
          isDeleting={deletingProductId === product.id}
          showWarehouseColumn={showWarehouseColumn}
          onViewDetails={onViewDetails}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )),
    [canDelete, canManage, deletingProductId, onDelete, onEdit, onViewDetails, products],
  );

  return (
    <section className="panel-surface">
      <div className="flex flex-col gap-5 border-b border-white/10 pb-5">
        <div>
          <p className="toolbar-label">{t("products.title")}</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{t("products.titleSubtitle")}</h3>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">{t("products.catalogSummary")}</p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)_auto]">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <label className="col-span-2 min-w-0 space-y-2 md:col-span-1 xl:col-span-2">
              <span className="toolbar-label">{t("products.filterSearch")}</span>
              <input
                aria-label={t("products.filterSearch")}
                value={filters.search}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    search: event.target.value,
                  })
                }
                className="toolbar-field w-full"
                placeholder={t("products.placeholderSearch")}
                title={filters.search}
              />
            </label>

            <label className="min-w-0 space-y-2">
              <span className="toolbar-label">{t("common.category")}</span>
              <select
                aria-label={t("common.category")}
                value={filters.categoryId}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    categoryId: event.target.value,
                  })
                }
                className="toolbar-field w-full"
              >
                <option value="" className="bg-slate-900">
                  {t("products.allCategories")}
                </option>
                {categoryOptions}
              </select>
            </label>

            <label className="min-w-0 space-y-2">
              <span className="toolbar-label">{t("products.dynamicAttribute")}</span>
              <select
                aria-label={t("products.dynamicAttribute")}
                value={filters.attributeKey}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    attributeKey: event.target.value,
                    attributeValue: event.target.value ? filters.attributeValue : "",
                  })
                }
                className="toolbar-field w-full disabled:cursor-not-allowed disabled:opacity-50"
                disabled={attributeOptions.length === 0}
              >
                <option value="" className="bg-slate-900">
                  {attributeOptions.length === 0
                    ? t("products.noAttributes")
                    : t("products.selectAttribute")}
                </option>
                {attributeOptionNodes}
              </select>
            </label>

            <label className="min-w-0 space-y-2">
              <span className="toolbar-label">{t("products.valueAttribute")}</span>
              <input
                aria-label={t("products.valueAttribute")}
                value={filters.attributeValue}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    attributeValue: event.target.value,
                  })
                }
                className="toolbar-field w-full disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!filters.attributeKey}
                placeholder={filters.attributeKey ? t("products.valueAttribute") : t("products.selectAttribute")}
                title={filters.attributeValue}
              />
            </label>

            <div className="col-span-2 min-w-0 space-y-2">
              <span className="toolbar-label">{t("common.stock")}</span>
              <div className="flex min-w-0 gap-3">
                <input
                  aria-label={`${t("common.stock")} ${t("common.minimum").toLowerCase()}`}
                  value={filters.maximumMinimumStock}
                  onChange={(event) =>
                    onFiltersChange({
                      ...filters,
                      maximumMinimumStock: event.target.value,
                    })
                  }
                  className="toolbar-field min-w-0 flex-1"
                  inputMode="numeric"
                  min="0"
                  placeholder={`${t("common.stock")} ${t("common.minimum").toLowerCase()}`}
                  step="1"
                  type="number"
                />
                <input
                  aria-label={`${t("common.stock")} ${t("common.current").toLowerCase()}`}
                  value={filters.maximumCurrentStock}
                  onChange={(event) =>
                    onFiltersChange({
                      ...filters,
                      maximumCurrentStock: event.target.value,
                    })
                  }
                  className="toolbar-field min-w-0 flex-1"
                  inputMode="numeric"
                  min="0"
                  placeholder={`${t("common.stock")} ${t("common.current").toLowerCase()}`}
                  step="1"
                  type="number"
                />
              </div>
            </div>
          </div>

          <div className="panel-subtle p-4">
            <label className="space-y-2">
              <span className="toolbar-label">{t("products.lookup")}</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  aria-label={t("products.lookup")}
                  value={quickLookup}
                  onChange={(event) => onQuickLookupChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onQuickLookupSubmit();
                    }
                  }}
                  className="toolbar-field min-w-0 flex-1"
                  placeholder={t("products.barcodeLookup")}
                />
                <MotionButton
                  aria-label={t("products.lookup")}
                  onClick={onQuickLookupSubmit}
                  className="min-h-[48px] rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 text-sm font-semibold text-cyan-100 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-cyan-500/20"
                >
                  {lookupLoading ? t("loading.processing") : t("common.search")}
                </MotionButton>
              </div>
            </label>
          </div>

          <div className="flex flex-col justify-between gap-3">
            <div className="panel-subtle p-4">
              <p className="toolbar-label">{t("common.actions")}</p>
              <ActionGroup align="end">
                {canExport && (
                  <>
                    <MotionButton
                      aria-label={t("common.exportExcel")}
                      onClick={onExportExcel}
                      className="min-h-[44px] rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 text-sm font-medium text-cyan-100 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-cyan-500/20"
                    >
                      {t("common.exportExcel")}
                    </MotionButton>
                    <MotionButton
                      aria-label={t("common.exportPdf")}
                      onClick={onExportPdf}
                      className="min-h-[44px] rounded-2xl border border-orange-400/20 bg-orange-500/10 px-4 text-sm font-medium text-orange-100 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-orange-500/20"
                    >
                      {t("common.exportPdf")}
                    </MotionButton>
                  </>
                )}
                {canManage && (
                  <MotionButton
                    aria-label={t("products.new")}
                    onClick={onCreate}
                    className="min-h-[44px] rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-orange-400"
                  >
                    {t("products.new")}
                  </MotionButton>
                )}
              </ActionGroup>
            </div>

            <div className="panel-subtle flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-slate-300">
              <p>
                {total} {t("products.found")}
              </p>
              <div className="flex items-center gap-3">
                <span className="text-slate-400">{t("common.show")}</span>
                <select
                  aria-label={t("common.show")}
                  value={pageSize}
                  onChange={(event) => onPageSizeChange(Number(event.target.value))}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none focus:border-cyan-300"
                >
                  {pageSizeOptions.map((value) => (
                    <option key={value} value={value} className="bg-slate-900">
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-2 mt-5 flex items-center justify-between text-sm text-slate-400">
        <p>{t("products.inventorySummary")}</p>
      </div>

      <div className="table-shell overflow-x-auto">
        <table className="table-fixed w-full min-w-[1080px]">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[18%]" />
            {showWarehouseColumn && <col className="w-[16%]" />}
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[10%]" />
            <col className="w-40" />
          </colgroup>
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">
              <th className="px-5 py-4 font-medium">{t("common.name")}</th>
              <th className="px-5 py-4 font-medium">{t("common.category")}</th>
              {showWarehouseColumn && (
                <th className="px-5 py-4 font-medium">{t("common.warehouse")}</th>
              )}
              <th className="px-5 py-4 text-right font-medium">{t("common.price")}</th>
              <th className="px-5 py-4 text-right font-medium">
                {t("common.stock")} {t("common.current").toLowerCase()}
              </th>
              <th className="px-5 py-4 text-right font-medium">
                {t("common.stock")} {t("common.minimum").toLowerCase()}
              </th>
              <th className="w-40 px-5 py-4 text-right font-medium">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={showWarehouseColumn ? 7 : 6} className="px-5 py-6">
                  <div className="state-card text-center">{t("products.loading")}</div>
                </td>
              </tr>
            )}

            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={showWarehouseColumn ? 7 : 6} className="px-5 py-6">
                  <div className="state-card text-center">{t("products.empty")}</div>
                </td>
              </tr>
            )}

            {!loading && productRows}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-300">
          {t("products.page")} {totalPages === 0 ? 0 : page} de {totalPages}
        </p>

        <ActionGroup align="end">
          <MotionButton
            aria-label={t("common.previous")}
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="min-h-[40px] rounded-xl border border-white/10 px-4 text-sm text-slate-200 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("common.previous")}
          </MotionButton>
          <MotionButton
            aria-label={t("common.next")}
            disabled={totalPages === 0 || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="min-h-[40px] rounded-xl border border-white/10 px-4 text-sm text-slate-200 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("common.next")}
          </MotionButton>
        </ActionGroup>
      </div>
    </section>
  );
}

export default memo(ProductList);
