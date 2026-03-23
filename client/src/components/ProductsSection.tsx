import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Category,
  CategoryAttribute,
  Product,
  ProductInput,
  ProductListResponse,
  ReportFormat,
} from "../../../shared/src";
import { useAuth } from "../auth/AuthProvider";
import { createApiClient, getErrorMessage, saveDownloadedFile } from "../lib/api";
import { safeArray } from "../lib/format";
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

type ProductsSectionProps = {
  apiBaseUrl: string;
};

type ProductsSectionState = {
  loading: boolean;
  saving: boolean;
  deletingProductId: number | null;
  error: string | null;
  products: Product[];
  categories: Category[];
  total: number;
};

type FormMode = "create" | "edit";

const initialState: ProductsSectionState = {
  loading: true,
  saving: false,
  deletingProductId: null,
  error: null,
  products: [],
  categories: [],
  total: 0,
};

function ProductsSection({ apiBaseUrl }: ProductsSectionProps) {
  const api = useMemo(() => createApiClient(apiBaseUrl), [apiBaseUrl]);
  const { user: currentUser } = useAuth();
  const { notify } = useToast();
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
  const [debouncedSearch, setDebouncedSearch] = useState(filters.search);
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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(filters.search);
    }, 250);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [filters.search]);

  const loadProducts = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });

      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }

      if (filters.categoryId) {
        params.set("categoryId", filters.categoryId);
      }

      if (filters.attributeKey) {
        params.set("attributeKey", filters.attributeKey);
      }

      if (filters.attributeValue) {
        params.set("attributeValue", filters.attributeValue);
      }

      if (filters.maximumMinimumStock) {
        params.set("maximumMinimumStock", filters.maximumMinimumStock);
      }

      if (filters.maximumCurrentStock) {
        params.set("maximumCurrentStock", filters.maximumCurrentStock);
      }

      const [categories, products] = await Promise.all([
        api.get<Category[]>("/categories"),
        api.get<ProductListResponse>(`/products?${params.toString()}`),
      ]);

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
        categories: safeArray(categories),
        products: safeArray(products.items),
        total: normalizedTotal,
      }));
    } catch (error) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      const message = getErrorMessage(error, "No se pudieron cargar los productos.");

      setState((current) => ({
        ...current,
        loading: false,
        error: message,
      }));
    }
  }, [
    api,
    debouncedSearch,
    filters.categoryId,
    filters.attributeKey,
    filters.attributeValue,
    filters.maximumCurrentStock,
    filters.maximumMinimumStock,
    page,
    pageSize,
  ]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (!filters.categoryId) {
      setAttributeFilterOptions([]);
      return;
    }

    let active = true;

    const loadAttributeOptions = async () => {
      try {
        const attributes = await api.get<CategoryAttribute[]>(
          `/categories/${filters.categoryId}/attributes`,
        );

        if (!active) {
          return;
        }

        setAttributeFilterOptions(attributes.filter((attribute) => attribute.active));
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
  }, [api, filters.categoryId]);

  const canManage = currentUser?.role === "admin" || currentUser?.role === "manager";
  const canDelete = currentUser?.role === "admin";
  const totalPages = Math.ceil(state.total / pageSize);

  const handleOpenCreate = () => {
    setFormMode("create");
    setEditingProduct(null);
    setShowForm(true);
  };

  const handleOpenEdit = (product: Product) => {
    setFormMode("edit");
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingProduct(null);
    setFormMode("create");
  };

  const handleSubmit = async (payload: ProductInput) => {
    if (state.saving) {
      return;
    }

    setState((current) => ({ ...current, saving: true, error: null }));

    try {
      if (formMode === "create") {
        await api.post<Product>("/products", payload);
        notify({
          type: "success",
          title: "Producto creado",
          message: "El producto se agrego correctamente al catalogo.",
        });
      } else if (editingProduct) {
        await api.put<Product>(`/products/${editingProduct.id}`, payload);
        notify({
          type: "success",
          title: "Producto actualizado",
          message: `Se actualizaron los datos de ${editingProduct.name}.`,
        });
      }

      handleCloseForm();
      await loadProducts();
      triggerAlertsRefresh();
    } catch (error) {
      const message = getErrorMessage(error, "No se pudo guardar el producto.");

      setState((current) => ({
        ...current,
        saving: false,
        error: message,
      }));
      notify({
        type: "error",
        title: "No se pudo guardar el producto",
        message,
      });
      return;
    }

    setState((current) => ({ ...current, saving: false }));
  };

  const handleDelete = async (product: Product) => {
    setPendingDeleteProduct(product);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteProduct || state.deletingProductId !== null) {
      return;
    }

    setState((current) => ({
      ...current,
      deletingProductId: pendingDeleteProduct.id,
      error: null,
    }));

    try {
      await api.delete(`/products/${pendingDeleteProduct.id}`);
      await loadProducts();
      triggerAlertsRefresh();
      notify({
        type: "success",
        title: "Producto eliminado",
        message: `Se elimino ${pendingDeleteProduct.name} del catalogo.`,
      });
    } catch (error) {
      const message = getErrorMessage(error, "No se pudo eliminar el producto.");

      setState((current) => ({
        ...current,
        deletingProductId: null,
        error: message,
      }));
      notify({
        type: "error",
        title: "No se pudo eliminar el producto",
        message,
      });
      return;
    }

    setState((current) => ({
      ...current,
      deletingProductId: null,
    }));
    setPendingDeleteProduct(null);
  };

  const handleFiltersChange = (nextFilters: typeof filters) => {
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
  };

  const handleExport = async (format: ReportFormat) => {
    if (exportingFormat) {
      return;
    }

    if (state.total === 0) {
      notify({
        type: "error",
        title: "No hay datos para exportar",
        message: "El catalogo de productos esta vacio.",
      });
      return;
    }

    setExportingFormat(format);

    try {
      const file = await api.download(`/reports/products/export?format=${format}`);
      saveDownloadedFile(file);
      notify({
        type: "success",
        title: "Exportacion generada",
        message: `Se descargo el reporte de productos en ${format.toUpperCase()}.`,
      });
    } catch (error) {
      notify({
        type: "error",
        title: "No se pudo exportar productos",
        message: getErrorMessage(error, "Intentalo de nuevo."),
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const handleQuickLookup = async () => {
    if (lookupLoading) {
      return;
    }

    const value = quickLookup.trim();

    if (!value) {
      notify({
        type: "error",
        title: "Lookup vacio",
        message: "Ingresa un SKU o barcode para buscar rapido.",
      });
      return;
    }

    setLookupLoading(true);

    try {
      const isBarcode = /^\d+$/.test(value);
      const product = await api.get<Product>(
        `/products/lookup?${isBarcode ? `barcode=${encodeURIComponent(value)}` : `sku=${encodeURIComponent(value)}`}`,
      );
      setLookupResult(product);
      notify({
        type: "success",
        title: "Producto encontrado",
        message: `${product.name} listo para consulta rapida.`,
      });
    } catch (error) {
      setLookupResult(null);
      notify({
        type: "error",
        title: "Producto no encontrado",
        message: getErrorMessage(error, "No se encontro coincidencia."),
      });
    } finally {
      setLookupLoading(false);
    }
  };

  if (state.loading) {
    return <SectionLoader label="Cargando productos..." />;
  }

  return (
    <div className="space-y-6">
      {state.error && (
        <SectionNotice title="Error" message={state.error} tone="error" />
      )}

      {!canManage && (
        <section className="rounded-[24px] border border-amber-400/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-50">
          Tu rol actual puede consultar productos, pero no crear, editar ni borrar.
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
          onQuickLookupSubmit={() => void handleQuickLookup()}
          onCreate={handleOpenCreate}
          onViewDetails={setDetailProduct}
          onEdit={handleOpenEdit}
          onDelete={handleDelete}
          total={state.total}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
          onExportExcel={() => void handleExport("excel")}
          onExportPdf={() => void handleExport("pdf")}
        />

        {showForm ? null : (
          <section className="rounded-[28px] border border-white/10 bg-gradient-to-br from-emerald-400/15 to-cyan-400/10 p-6 shadow-panel">
            <p className="toolbar-label text-emerald-100">Resumen</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">Catalogo listo para operar</h3>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <article className="panel-subtle p-4">
                <p className="toolbar-label">Categorias</p>
                <p className="mt-3 text-3xl font-semibold text-white">{state.categories.length}</p>
              </article>
              <article className="panel-subtle p-4">
                <p className="toolbar-label">Productos</p>
                <p className="mt-3 text-3xl font-semibold text-white">{state.total}</p>
              </article>
            </div>

            <div className="panel-subtle mt-6 p-4 text-sm leading-7 text-slate-200">
              {canManage
                ? "Puedes crear y editar productos desde este panel. Solo admin puede eliminarlos."
                : "Tu rol mantiene acceso de consulta para revisar categoria, precio y niveles de stock."}
            </div>

            <div className="panel-subtle mt-6 p-4">
              <p className="toolbar-label">Busqueda rapida</p>
              {lookupResult ? (
                <div className="mt-3 space-y-2 text-sm text-slate-200">
                  <p className="text-lg font-semibold text-white">{lookupResult.name}</p>
                  <p>SKU: {lookupResult.sku ?? "No definido"}</p>
                  <p>Barcode: {lookupResult.barcode ?? "No definido"}</p>
                  <p>Categoria: {lookupResult.categoryName}</p>
                  <p>Stock actual: {lookupResult.currentStock}</p>
                  <MotionButton
                    aria-label={`Ver detalle rapido de ${lookupResult.name}`}
                    onClick={() => setDetailProduct(lookupResult)}
                    className="mt-3 min-h-[40px] rounded-xl border border-cyan-400/20 px-3.5 text-sm text-cyan-100 transition hover:bg-cyan-500/10"
                  >
                    Ver detalle
                  </MotionButton>
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-300">
                  Usa el campo lookup para encontrar un producto por SKU o barcode en segundos.
                </p>
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
        title="Eliminar producto"
        description={
          pendingDeleteProduct
            ? `Vas a eliminar ${pendingDeleteProduct.name}. Esta accion no se puede deshacer.`
            : ""
        }
        confirmLabel="Eliminar producto"
        confirming={pendingDeleteProduct ? state.deletingProductId === pendingDeleteProduct.id : false}
        onCancel={() => setPendingDeleteProduct(null)}
        onConfirm={() => void handleConfirmDelete()}
      />

      {exportingFormat && (
        <GlobalLoader fullscreen label={`Generando exportacion ${exportingFormat.toUpperCase()}...`} />
      )}
    </div>
  );
}

export default memo(ProductsSection);
