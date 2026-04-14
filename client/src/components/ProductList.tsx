import { memo, useMemo, type ReactNode } from "react";
import type { Category, CategoryAttribute, Product } from "../../../shared/src";
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

type ProductFilters = {
  search: string;
  categoryId: string;
  attributeKey: string;
  attributeValue: string;
  maximumMinimumStock: string;
  maximumCurrentStock: string;
};

type ProductListProps = {
  products: Product[];
  loading: boolean;
  deletingProductId: number | null;
  canManage: boolean;
  canDelete: boolean;
  categories: Category[];
  attributeOptions: CategoryAttribute[];
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
  product: Product;
  canManage: boolean;
  canDelete: boolean;
  isDeleting: boolean;
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
  onViewDetails,
  onEdit,
  onDelete,
}: ProductRowProps) {
  const name = safeText(product.name, "Producto sin nombre");
  const sku = safeText(product.sku, "No definido");
  const barcode = safeText(product.barcode, "No definido");
  const description = safeText(product.description, "");
  const categoryName = safeText(product.categoryName, "Sin categoria");
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
            title={`BARCODE ${safeTitle(product.barcode, barcode)}`}
          >
            BARCODE {barcode}
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
      <td className="px-5 py-5 text-right text-sm text-slate-200">{safeCurrency(product.price)}</td>
      <td className="px-5 py-5 text-right">
        <div className="ml-auto flex w-[140px] flex-col items-end gap-2">
          <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${toneClasses.badge}`}
            title={`Stock actual ${currentStock}`}
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
      <td className="px-5 py-5 text-right text-sm text-slate-200" title={`Stock minimo ${minimumStock}`}>
        {minimumStock}
      </td>
      <td className="w-40 px-5 py-5 text-right">
        <div className="flex flex-col items-end gap-2 flex-none">
          <TableActionButton
            ariaLabel={`Ver detalle del producto ${name}`}
            onClick={() => onViewDetails(product)}
            className="min-h-[40px] w-32 rounded-xl border border-cyan-400/20 px-3.5 text-sm text-cyan-100 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-cyan-500/10"
          >
            Detalle
          </TableActionButton>

          {canManage && (
            <TableActionButton
              ariaLabel={`Editar producto ${name}`}
              onClick={() => onEdit(product)}
              className="min-h-[40px] w-32 rounded-xl border border-white/10 px-3.5 text-sm text-slate-200 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-white/5 hover:text-white"
            >
              Editar
            </TableActionButton>
          )}

          {canDelete && (
            <TableActionButton
              ariaLabel={`Eliminar producto ${name}`}
              disabled={isDeleting}
              onClick={() => onDelete(product)}
              className="min-h-[40px] w-32 rounded-xl border border-rose-400/20 px-3.5 text-sm text-rose-200 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? "Eliminando..." : "Borrar"}
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
  categories,
  attributeOptions,
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
          key={product.id}
          product={product}
          canManage={canManage}
          canDelete={canDelete}
          isDeleting={deletingProductId === product.id}
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
          <p className="toolbar-label">Products</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">Gestion de productos</h3>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">
            Catalogo principal con categoria, precio, stock actual y umbral minimo.
          </p>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)_auto]">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <label className="col-span-2 min-w-0 space-y-2 md:col-span-1 xl:col-span-2">
              <span className="toolbar-label">Busqueda general</span>
              <input
                aria-label="Buscar productos por nombre, SKU o categoria"
                value={filters.search}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    search: event.target.value,
                  })
                }
                className="toolbar-field w-full"
                placeholder="Nombre, SKU, barcode o categoria"
                title={filters.search}
              />
            </label>

            <label className="min-w-0 space-y-2">
              <span className="toolbar-label">Categoria</span>
              <select
                aria-label="Filtrar productos por categoria"
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
                  Todas las categorias
                </option>
                {categoryOptions}
              </select>
            </label>

            <label className="min-w-0 space-y-2">
              <span className="toolbar-label">Atributo dinamico</span>
              <select
                aria-label="Filtrar productos por atributo dinamico"
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
                  {attributeOptions.length === 0 ? "Sin atributos filtrables" : "Selecciona atributo"}
                </option>
                {attributeOptionNodes}
              </select>
            </label>

            <label className="min-w-0 space-y-2">
              <span className="toolbar-label">Valor del atributo</span>
              <input
                aria-label="Filtrar productos por valor de atributo dinamico"
                value={filters.attributeValue}
                onChange={(event) =>
                  onFiltersChange({
                    ...filters,
                    attributeValue: event.target.value,
                  })
                }
                className="toolbar-field w-full disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!filters.attributeKey}
                placeholder={filters.attributeKey ? "Valor del atributo" : "Selecciona un atributo"}
                title={filters.attributeValue}
              />
            </label>

            <div className="col-span-2 min-w-0 space-y-2">
              <span className="toolbar-label">Limites de stock</span>
              <div className="flex min-w-0 gap-3">
                <input
                  aria-label="Filtrar por stock minimo maximo"
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
                  placeholder="Stock minimo max."
                  step="1"
                  type="number"
                />
                <input
                  aria-label="Filtrar por stock actual maximo"
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
                  placeholder="Stock actual max."
                  step="1"
                  type="number"
                />
              </div>
            </div>
          </div>

          <div className="panel-subtle p-4">
            <label className="space-y-2">
              <span className="toolbar-label">Lookup rapido</span>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  aria-label="Busqueda rapida por SKU o barcode"
                  value={quickLookup}
                  onChange={(event) => onQuickLookupChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onQuickLookupSubmit();
                    }
                  }}
                  className="toolbar-field min-w-0 flex-1"
                  placeholder="SKU o barcode"
                />
                <MotionButton
                  aria-label="Buscar producto por SKU o barcode"
                  onClick={onQuickLookupSubmit}
                  className="min-h-[48px] rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 text-sm font-semibold text-cyan-100 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-cyan-500/20"
                >
                  {lookupLoading ? "Buscando..." : "Lookup"}
                </MotionButton>
              </div>
            </label>
          </div>

          <div className="flex flex-col justify-between gap-3">
            <div className="panel-subtle p-4">
              <p className="toolbar-label">Acciones</p>
              <ActionGroup align="end">
                <MotionButton
                  aria-label="Exportar productos en Excel"
                  onClick={onExportExcel}
                  className="min-h-[44px] rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 text-sm font-medium text-cyan-100 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-cyan-500/20"
                >
                  Exportar Excel
                </MotionButton>
                <MotionButton
                  aria-label="Exportar productos en PDF"
                  onClick={onExportPdf}
                  className="min-h-[44px] rounded-2xl border border-orange-400/20 bg-orange-500/10 px-4 text-sm font-medium text-orange-100 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-orange-500/20"
                >
                  Exportar PDF
                </MotionButton>
                {canManage && (
                  <MotionButton
                    aria-label="Crear nuevo producto"
                    onClick={onCreate}
                    className="min-h-[44px] rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-orange-400"
                  >
                    Nuevo producto
                  </MotionButton>
                )}
              </ActionGroup>
            </div>

            <div className="panel-subtle flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm text-slate-300">
              <p>{total} productos encontrados</p>
              <div className="flex items-center gap-3">
                <span className="text-slate-400">Mostrar</span>
                <select
                  aria-label="Cantidad de productos por pagina"
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
        <p>Stock actual consolidado entre almacenes</p>
      </div>

      <div className="table-shell overflow-x-auto">
        <table className="table-fixed w-full min-w-[1080px]">
          <colgroup>
            <col className="w-[34%]" />
            <col className="w-[18%]" />
            <col className="w-[12%]" />
            <col className="w-[16%]" />
            <col className="w-[10%]" />
            <col className="w-40" />
          </colgroup>
          <thead>
            <tr className="border-b border-white/10 bg-white/[0.04] text-left text-[11px] uppercase tracking-[0.24em] text-slate-500">
              <th className="px-5 py-4 font-medium">Nombre</th>
              <th className="px-5 py-4 font-medium">Categoria</th>
              <th className="px-5 py-4 text-right font-medium">Precio</th>
              <th className="px-5 py-4 text-right font-medium">Stock actual</th>
              <th className="px-5 py-4 text-right font-medium">Stock minimo</th>
              <th className="w-40 px-5 py-4 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-5 py-6">
                  <div className="state-card text-center">
                    Cargando productos y preparando el catalogo visual...
                  </div>
                </td>
              </tr>
            )}

            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-6">
                  <div className="state-card text-center">
                    No hay productos disponibles con los filtros actuales.
                  </div>
                </td>
              </tr>
            )}

            {!loading && productRows}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-300">
          Pagina {totalPages === 0 ? 0 : page} de {totalPages}
        </p>

        <ActionGroup align="end">
          <MotionButton
            aria-label="Pagina anterior de productos"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="min-h-[40px] rounded-xl border border-white/10 px-4 text-sm text-slate-200 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Anterior
          </MotionButton>
          <MotionButton
            aria-label="Pagina siguiente de productos"
            disabled={totalPages === 0 || page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="min-h-[40px] rounded-xl border border-white/10 px-4 text-sm text-slate-200 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Siguiente
          </MotionButton>
        </ActionGroup>
      </div>
    </section>
  );
}

export default memo(ProductList);
