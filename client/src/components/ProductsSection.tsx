import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Category,
  CategoryAttribute,
  Product,
  ProductInput,
  ReportFormat,
} from "../../../shared/src";
import { t } from "../i18n";
import { useAuth } from "../auth/AuthProvider";
import { getErrorMessage, saveDownloadedFile } from "../lib/api";
import { safeArray } from "../lib/format";
import { useDebouncedValue } from "../lib/useDebouncedValue";
import { useWarehouseContext } from "../context/WarehouseContext";
import ConfirmDialog from "./ConfirmDialog";
import ProductDetailsModal from "./ProductDetailsModal";
import ProductForm from "./ProductForm";
import ProductList from "./ProductList";
import SectionLoader from "./SectionLoader";
import SectionNotice from "./SectionNotice";
import { useToast } from "./ToastProvider";
import GlobalLoader from "./GlobalLoader";
import { triggerAlertsRefresh } from "../utils/alerts";
import MotionButton from "./MotionButton";
import { type WarehouseScopedProduct, useDataProvider } from "../services/data-provider";

type ProductsSectionProps = {
  apiBaseUrl: string;
};

type ProductsSectionState = {
  loading: boolean;
  categoriesLoading: boolean;
  saving: boolean;
  deletingProductId: number | null;
  error: string | null;
  products: WarehouseScopedProduct[];
  categories: Category[];
  total: number;
};

type FormMode = "create" | "edit";

const initialState: ProductsSectionState = {
  loading: true,
  categoriesLoading: true,
  saving: false,
  deletingProductId: null,
  error: null,
  products: [],
  categories: [],
  total: 0,
};

function ProductsSection({ apiBaseUrl }: ProductsSectionProps) {
  const { user: currentUser } = useAuth();
  const { warehouseViewMode } = useWarehouseContext();
  const { notify } = useToast();
  const { hasDesktopFallback, http, isOffline, listProducts, lookupProduct } = useDataProvider();
  const [state, setState] = useState<ProductsSectionState>(initialState);
  const [filters, setFilters] = useState({
    search: "",
    categoryId: "",
    attributeKey: "",
    attributeValue: "",
    maximumMinimumStock: "",
    maximumCurrentStock: "",
  });
  const [attributeFilterOptions, setAttributeFilterOptions] = useState<CategoryAttribute[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formMode, setFormMode] = useState<FormMode>("create");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [pendingDeleteProduct, setPendingDeleteProduct] = useState<Product | null>(null);
  const [exportingFormat, setExportingFormat] = useState<ReportFormat | null>(null);
  const [quickLookup, setQuickLookup] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<Product | null>(null);
  const requestIdRef = useRef(0);
  const attributeOptionsCacheRef = useRef(new Map<string, CategoryAttribute[]>());
  const debouncedFilterValues = useDebouncedValue(
    useMemo(
      () => ({
        search: filters.search,
        attributeValue: filters.attributeValue,
        maximumMinimumStock: filters.maximumMinimumStock,
        maximumCurrentStock: filters.maximumCurrentStock,
      }),
      [
        filters.attributeValue,
        filters.maximumCurrentStock,
        filters.maximumMinimumStock,
        filters.search,
      ],
    ),
    250,
  );

  const loadCategories = useCallback(async () => {
    if (isOffline || hasDesktopFallback) {
      setState((current) => ({
        ...current,
        categoriesLoading: false,
        categories: [],
      }));
      return;
    }

    try {
      const categories = await http.get<Category[]>("/categories");

      setState((current) => ({
        ...current,
        categoriesLoading: false,
        categories: safeArray(categories),
      }));
    } catch (error) {
      const message = getErrorMessage(error, t("common.error"));

      setState((current) => ({
        ...current,
        categoriesLoading: false,
        error: current.error ?? message,
      }));
    }
  }, [hasDesktopFallback, http, isOffline]);

  const loadProducts = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    try {
      const products = await listProducts({
        page,
        pageSize,
        search: debouncedFilterValues.search,
      });

      if (requestId !== requestIdRef.current) {
        return;
      }

      const normalizedTotal = typeof products.total === "number" && products.total > 0 ? products.total : 0;
      const maxPage = Math.max(1, Math.ceil(normalizedTotal / pageSize));

      if (page > maxPage) {
        setPage(maxPage);
        return;
      }

      setState((current) => ({
        ...current,
        loading: false,
        error: null,
        products: safeArray(products.items),
        total: normalizedTotal,
      }));
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      const message = getErrorMessage(error, t("products.createError"));

      setState((current) => ({
        ...current,
        loading: false,
        error: message,
      }));
    }
  }, [
      debouncedFilterValues,
      filters.categoryId,
      filters.attributeKey,
      listProducts,
      page,
      pageSize,
    ]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!filters.categoryId) {
      setAttributeFilterOptions([]);
      return;
    }

    if (isOffline || hasDesktopFallback) {
      setAttributeFilterOptions([]);
      return;
    }

    const cachedAttributes = attributeOptionsCacheRef.current.get(filters.categoryId);

    if (cachedAttributes) {
      setAttributeFilterOptions(cachedAttributes);
      return;
    }

    let active = true;

    const loadAttributeOptions = async () => {
      try {
        const attributes = await http.get<CategoryAttribute[]>(
          `/categories/${filters.categoryId}/attributes`,
        );

        if (!active) {
          return;
        }

        const nextOptions = attributes.filter((attribute) => attribute.active);
        attributeOptionsCacheRef.current.set(filters.categoryId, nextOptions);
        setAttributeFilterOptions(nextOptions);
      } catch {
        if (active) {
          setAttributeFilterOptions([]);
        }
      }
    };

    void loadAttributeOptions();

    return () => {
      active = false;
    };
  }, [filters.categoryId, hasDesktopFallback, http, isOffline]);

  const canManage =
    !hasDesktopFallback &&
    !isOffline &&
    (currentUser?.role === "admin" || currentUser?.role === "manager");
  const canDelete = !hasDesktopFallback && !isOffline && currentUser?.role === "admin";
  const canExport = !hasDesktopFallback;
  const totalPages = useMemo(() => Math.ceil(state.total / pageSize), [pageSize, state.total]);

  const handleOpenCreate = useCallback(() => {
    setFormMode("create");
    setEditingProduct(null);
    setShowForm(true);
  }, []);

  const handleOpenEdit = useCallback((product: Product) => {
    setFormMode("edit");
    setEditingProduct(product);
    setShowForm(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setShowForm(false);
    setEditingProduct(null);
    setFormMode("create");
  }, []);

  const handleSubmit = useCallback(async (payload: ProductInput) => {
    if (state.saving) {
      return;
    }

    setState((current) => ({ ...current, saving: true, error: null }));

    try {
      if (formMode === "create") {
        await http.post<Product>("/products", payload);
        notify({
          type: "success",
          title: t("products.createSuccess"),
          message: t("products.saveSuccessCreated"),
        });
      } else if (editingProduct) {
        await http.put<Product>(`/products/${editingProduct.id}`, payload);
        notify({
          type: "success",
          title: t("products.createSuccess"),
          message: t("products.saveSuccessUpdated"),
        });
      }

      handleCloseForm();
      await loadProducts();
      triggerAlertsRefresh();
    } catch (error) {
      const message = getErrorMessage(error, t("products.createError"));

      setState((current) => ({
        ...current,
        saving: false,
        error: message,
      }));
      notify({
        type: "error",
        title: t("products.createError"),
        message,
      });
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  }, [editingProduct, formMode, handleCloseForm, http, loadProducts, notify, state.saving]);

  const handleDelete = useCallback(async (product: Product) => {
    setPendingDeleteProduct(product);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDeleteProduct || state.deletingProductId !== null) {
      return;
    }

    setState((current) => ({
      ...current,
      deletingProductId: pendingDeleteProduct.id,
      error: null,
    }));

    try {
      await http.delete(`/products/${pendingDeleteProduct.id}`);
      await loadProducts();
      triggerAlertsRefresh();
      notify({
        type: "success",
        title: t("products.deleteSuccess"),
        message: pendingDeleteProduct.name,
      });
    } catch (error) {
      const message = getErrorMessage(error, t("products.deleteError"));

      setState((current) => ({
        ...current,
        deletingProductId: null,
        error: message,
      }));
      notify({
        type: "error",
        title: t("products.deleteError"),
        message,
      });
      return;
    }

    setState((current) => ({
      ...current,
      deletingProductId: null,
    }));
    setPendingDeleteProduct(null);
  }, [http, loadProducts, notify, pendingDeleteProduct, state.deletingProductId]);

  const handleFiltersChange = useCallback((nextFilters: typeof filters) => {
    setFilters((current) => {
      if (current.categoryId !== nextFilters.categoryId) {
        return {
          ...nextFilters,
          attributeKey: "",
          attributeValue: "",
        };
      }

      if (!nextFilters.attributeKey) {
        return {
          ...nextFilters,
          attributeValue: "",
        };
      }

      return nextFilters;
    });
    setPage(1);
  }, []);

  const handleExport = useCallback(async (format: ReportFormat) => {
    if (exportingFormat) {
      return;
    }

    if (state.total === 0) {
      notify({
        type: "error",
        title: t("common.error"),
        message: t("products.empty"),
      });
      return;
    }

    setExportingFormat(format);

    try {
      const file = await http.download(`/reports/products/export?format=${format}`);
      saveDownloadedFile(file);
      notify({
        type: "success",
        title: t("products.exportSuccess"),
        message: format.toUpperCase(),
      });
    } catch (error) {
      notify({
        type: "error",
        title: t("products.exportError"),
        message: getErrorMessage(error, t("app.retry")),
      });
    } finally {
      setExportingFormat(null);
    }
  }, [exportingFormat, http, notify, state.total]);

  const handleQuickLookup = useCallback(async () => {
    if (lookupLoading) {
      return;
    }

    const value = quickLookup.trim();

    if (!value) {
      notify({
        type: "error",
        title: t("common.error"),
        message: t("products.lookupEmpty"),
      });
      return;
    }

    setLookupLoading(true);

    try {
      const product = await lookupProduct(value);
      setLookupResult(product);
      notify({
        type: "success",
        title: t("products.lookupResult"),
        message: product.name,
      });
    } catch (error) {
      setLookupResult(null);
      notify({
        type: "error",
        title: t("products.lookupError"),
        message: getErrorMessage(error, t("products.lookupError")),
      });
    } finally {
      setLookupLoading(false);
    }
  }, [lookupLoading, lookupProduct, notify, quickLookup]);

  const handleQuickLookupSubmit = useCallback(() => {
    void handleQuickLookup();
  }, [handleQuickLookup]);

  const handlePageSizeChange = useCallback((nextPageSize: number) => {
    setPageSize(nextPageSize);
    setPage(1);
  }, []);

  const handleExportExcel = useCallback(() => {
    void handleExport("excel");
  }, [handleExport]);

  const handleExportPdf = useCallback(() => {
    void handleExport("pdf");
  }, [handleExport]);

  if (state.loading || state.categoriesLoading) {
    return <SectionLoader label={t("products.loading")} />;
  }

  return (
    <div className="space-y-6">
      {state.error && (
        <SectionNotice title={t("common.error")} message={state.error} tone="error" />
      )}

      {!canManage && (
        <section className="rounded-[24px] border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-50">
          {isOffline
            ? t("common.offlineMode")
            : t("products.manageInfoReadOnly")}
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <ProductList
          products={state.products}
          loading={state.loading}
          deletingProductId={state.deletingProductId}
          canManage={canManage}
          canDelete={canDelete}
          categories={state.categories}
          attributeOptions={attributeFilterOptions}
          filters={filters}
          quickLookup={quickLookup}
          lookupLoading={lookupLoading}
          onFiltersChange={handleFiltersChange}
          onQuickLookupChange={setQuickLookup}
          onQuickLookupSubmit={handleQuickLookupSubmit}
          onCreate={handleOpenCreate}
          onViewDetails={setDetailProduct}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          total={state.total}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          onExportExcel={handleExportExcel}
          onExportPdf={handleExportPdf}
          canExport={canExport}
          showWarehouseColumn={warehouseViewMode === "all"}
        />

        {showForm ? null : (
          <section className="rounded-[28px] border border-white/10 bg-gradient-to-br from-emerald-400/15 to-cyan-400/10 p-6 shadow-panel">
            <p className="toolbar-label text-emerald-100">{t("common.section")}</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">{t("products.catalogReady")}</h3>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <article className="panel-subtle p-4">
                <p className="toolbar-label">{t("common.category")}</p>
                <p className="mt-3 text-3xl font-semibold text-white">{state.categories.length}</p>
              </article>
              <article className="panel-subtle p-4">
                <p className="toolbar-label">{t("sections.productos.label")}</p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {warehouseViewMode === "all"
                    ? new Set(state.products.map((product) => product.id)).size
                    : state.total}
                </p>
              </article>
            </div>

            <div className="panel-subtle mt-6 p-4 text-sm leading-7 text-slate-200">
              {canManage
                ? t("products.manageInfoAdmin")
                : t("products.manageInfoReadOnly")}
            </div>

            <div className="panel-subtle mt-6 p-4">
              <p className="toolbar-label">{t("products.quickView")}</p>
              {lookupResult ? (
                <div className="mt-3 space-y-2 text-sm text-slate-200">
                  <p className="text-lg font-semibold text-white">{lookupResult.name}</p>
                  <p>SKU: {lookupResult.sku ?? t("common.noDefined")}</p>
                  <p>{t("common.barcode")}: {lookupResult.barcode ?? t("common.noDefined")}</p>
                  <p>{t("common.category")}: {lookupResult.categoryName}</p>
                  <p>{t("common.stock")}: {lookupResult.currentStock}</p>
                  <MotionButton
                    aria-label={`${t("products.quickViewButton")} ${lookupResult.name}`}
                    onClick={() => setDetailProduct(lookupResult)}
                    className="mt-3 min-h-[40px] rounded-xl border border-cyan-400/20 px-3.5 text-sm text-cyan-100 motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out motion-reduce:transition-none hover:bg-cyan-500/10"
                  >
                    {t("products.quickViewButton")}
                  </MotionButton>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-300">{t("products.lookupHelp")}</p>
              )}
            </div>
          </section>
        )}
      </div>

      <ProductForm
        apiBaseUrl={apiBaseUrl}
        open={showForm}
        mode={formMode}
        categories={state.categories}
        initialProduct={editingProduct}
        saving={state.saving}
        onCancel={handleCloseForm}
        onSubmit={handleSubmit}
      />

      <ProductDetailsModal
        open={Boolean(detailProduct)}
        product={detailProduct}
        onClose={() => setDetailProduct(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteProduct)}
        title={t("products.deleteConfirm")}
        description={
          pendingDeleteProduct
            ? `${pendingDeleteProduct.name}. ${t("products.deleteDescription")}`
            : ""
        }
        confirmLabel={t("products.deleteConfirm")}
        confirming={pendingDeleteProduct ? state.deletingProductId === pendingDeleteProduct.id : false}
        onCancel={() => setPendingDeleteProduct(null)}
        onConfirm={() => void handleConfirmDelete()}
      />

      {exportingFormat && (
        <GlobalLoader fullscreen label={`${t("common.generate")} ${exportingFormat.toUpperCase()}...`} />
      )}
    </div>
  );
}

export default memo(ProductsSection);
