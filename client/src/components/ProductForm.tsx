import { useEffect, useMemo, useState } from "react";
import type {
  Category,
  CategoryAttribute,
  Product,
  ProductAttribute,
  ProductAttributeInput,
  ProductInput,
} from "../../../shared/src";
import { t } from "../i18n";
import { useDataProvider } from "../services/data-provider";
import Modal from "./Modal";
import MotionButton from "./MotionButton";

type ProductFormProps = {
  apiBaseUrl: string;
  open: boolean;
  mode: "create" | "edit";
  categories: Category[];
  initialProduct?: Product | null;
  saving: boolean;
  onCancel: () => void;
  onSubmit: (payload: ProductInput) => Promise<void>;
};

type FormValues = {
  name: string;
  sku: string;
  barcode: string;
  categoryId: string;
  price: string;
  minimumStock: string;
  description: string;
};

type DynamicAttributeValue = string | boolean | string[];
type DynamicAttributeValues = Record<number, DynamicAttributeValue>;
type FormErrors = Record<string, string>;

const buildInitialValues = (product?: Product | null): FormValues => ({
  name: product?.name ?? "",
  sku: product?.sku ?? "",
  barcode: product?.barcode ?? "",
  categoryId: product ? String(product.categoryId) : "",
  price: product ? String(product.price) : "0",
  minimumStock: product ? String(product.minimumStock) : "0",
  description: product?.description ?? "",
});

const isEmptyDynamicValue = (value: DynamicAttributeValue | undefined) => {
  return (
    value === undefined ||
    (typeof value === "string" && !value.trim()) ||
    (Array.isArray(value) && value.length === 0)
  );
};

const buildDefaultAttributeValue = (attribute: CategoryAttribute): DynamicAttributeValue => {
  if (attribute.type === "boolean") {
    return false;
  }

  if (attribute.type === "multiselect") {
    return [];
  }

  return "";
};

const parseStoredAttributeValue = (
  attribute: CategoryAttribute,
  productAttribute?: ProductAttribute,
): DynamicAttributeValue => {
  if (!productAttribute) {
    return buildDefaultAttributeValue(attribute);
  }

  if (attribute.type === "boolean") {
    return productAttribute.value === "true";
  }

  if (attribute.type === "multiselect") {
    try {
      const parsedValue = JSON.parse(productAttribute.value);
      return Array.isArray(parsedValue) ? parsedValue.map(String) : [];
    } catch {
      return [];
    }
  }

  if (attribute.type === "json") {
    try {
      return JSON.stringify(JSON.parse(productAttribute.value), null, 2);
    } catch {
      return productAttribute.value;
    }
  }

  return productAttribute.value;
};

const formatReadOnlyAttributeValue = (attribute: CategoryAttribute, value: DynamicAttributeValue) => {
  if (attribute.type === "boolean") {
    return value ? "Si" : "No";
  }

  if (attribute.type === "multiselect") {
    return Array.isArray(value) && value.length > 0 ? value.join(", ") : "Sin valor";
  }

  if (typeof value !== "string" || !value.trim()) {
    return "Sin valor";
  }

  return value;
};

const buildAttributeValues = (
  attributes: CategoryAttribute[],
  product?: Product | null,
): DynamicAttributeValues => {
  const values: DynamicAttributeValues = {};

  attributes.forEach((attribute) => {
    const existingAttribute = product?.attributes.find(
      (item) => item.categoryAttributeId === attribute.id,
    );
    values[attribute.id] = parseStoredAttributeValue(attribute, existingAttribute);
  });

  return values;
};

export default function ProductForm({
  apiBaseUrl,
  open,
  mode,
  categories,
  initialProduct,
  saving,
  onCancel,
  onSubmit,
}: ProductFormProps) {
  const { http } = useDataProvider();
  const [values, setValues] = useState<FormValues>(buildInitialValues(initialProduct));
  const [attributeDefinitions, setAttributeDefinitions] = useState<CategoryAttribute[]>([]);
  const [attributeValues, setAttributeValues] = useState<DynamicAttributeValues>({});
  const [attributeLoading, setAttributeLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    setValues(buildInitialValues(initialProduct));
    setErrors({});
  }, [initialProduct, mode, open]);

  useEffect(() => {
    if (!open || !values.categoryId) {
      setAttributeDefinitions([]);
      setAttributeValues({});
      return;
    }

    let active = true;

    const loadAttributes = async () => {
      setAttributeLoading(true);

      try {
        const attributes = await http.get<CategoryAttribute[]>(
          `/categories/${values.categoryId}/attributes`,
        );
        const visibleAttributes = attributes.filter((attribute) => {
          if (attribute.active) {
            return true;
          }

          return Boolean(
            initialProduct?.attributes.find((item) => item.categoryAttributeId === attribute.id),
          );
        });

        if (!active) {
          return;
        }

        setAttributeDefinitions(visibleAttributes);
        setAttributeValues(buildAttributeValues(visibleAttributes, initialProduct));
      } catch {
        if (!active) {
          return;
        }

        setAttributeDefinitions([]);
        setAttributeValues({});
      } finally {
        if (active) {
          setAttributeLoading(false);
        }
      }
    };

    void loadAttributes();

    return () => {
      active = false;
    };
  }, [http, initialProduct, open, values.categoryId]);

  const title = useMemo(() => {
    return mode === "create" ? "Crear producto" : "Editar producto";
  }, [mode]);
  const titleId = "product-form-title";

  const validate = () => {
    const nextErrors: FormErrors = {};
    const price = Number(values.price);
    const minimumStock = Number(values.minimumStock);

    if (!values.name.trim()) {
      nextErrors.name = "El nombre es obligatorio.";
    }

    if (values.sku && values.sku.length > 80) {
      nextErrors.sku = "El SKU no puede superar los 80 caracteres.";
    }

    if (values.barcode && values.barcode.length > 120) {
      nextErrors.barcode = `${t("common.barcode")} no puede superar los 120 caracteres.`;
    }

    if (!values.categoryId) {
      nextErrors.categoryId = "Selecciona una categoria.";
    }

    if (!Number.isFinite(price) || price < 0) {
      nextErrors.price = "El precio debe ser un numero mayor o igual a 0.";
    }

    if (!Number.isInteger(minimumStock) || minimumStock < 0) {
      nextErrors.minimumStock = "El stock minimo debe ser un entero mayor o igual a 0.";
    }

    attributeDefinitions.forEach((attribute) => {
      if (!attribute.active) {
        return;
      }

      const value = attributeValues[attribute.id];
      const errorKey = `attribute-${attribute.id}`;

      if (attribute.required && isEmptyDynamicValue(value)) {
        nextErrors[errorKey] = `${attribute.label} es obligatorio.`;
        return;
      }

      if (isEmptyDynamicValue(value)) {
        return;
      }

      if (attribute.type === "number") {
        if (typeof value !== "string" || !Number.isFinite(Number(value))) {
          nextErrors[errorKey] = `${attribute.label} debe ser numerico.`;
        }
      }

      if (attribute.type === "date") {
        if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
          nextErrors[errorKey] = `${attribute.label} debe ser una fecha valida.`;
        }
      }

      if (attribute.type === "select") {
        if (typeof value !== "string" || !(attribute.options ?? []).includes(value)) {
          nextErrors[errorKey] = `Selecciona una opcion valida para ${attribute.label}.`;
        }
      }

      if (attribute.type === "multiselect") {
        if (
          !Array.isArray(value) ||
          value.some((item) => !(attribute.options ?? []).includes(item))
        ) {
          nextErrors[errorKey] = `Selecciona opciones validas para ${attribute.label}.`;
        }
      }

      if (attribute.type === "json" && typeof value === "string" && value.trim()) {
        try {
          JSON.parse(value);
        } catch {
          nextErrors[errorKey] = `${attribute.label} debe contener JSON valido.`;
        }
      }
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildAttributePayload = (): ProductAttributeInput[] => {
    const payload: ProductAttributeInput[] = [];

    attributeDefinitions.forEach((attribute) => {
      if (!attribute.active) {
        return;
      }

      const rawValue = attributeValues[attribute.id];

      if (attribute.type === "boolean") {
        payload.push({
          categoryAttributeId: attribute.id,
          value: Boolean(rawValue),
        });
        return;
      }

      if (attribute.type === "multiselect") {
        if (!Array.isArray(rawValue) || rawValue.length === 0) {
          return;
        }

        payload.push({
          categoryAttributeId: attribute.id,
          value: rawValue,
        });
        return;
      }

      if (typeof rawValue !== "string" || !rawValue.trim()) {
        return;
      }

      if (attribute.type === "number") {
        payload.push({
          categoryAttributeId: attribute.id,
          value: Number(rawValue),
        });
        return;
      }

      payload.push({
        categoryAttributeId: attribute.id,
        value: rawValue.trim(),
      });
    });

    return payload;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!validate()) {
      return;
    }

    await onSubmit({
      name: values.name.trim(),
      sku: values.sku.trim() ? values.sku.trim() : null,
      barcode: values.barcode.trim() ? values.barcode.trim() : null,
      categoryId: Number(values.categoryId),
      price: Number(values.price),
      minimumStock: Number(values.minimumStock),
      description: values.description.trim() ? values.description.trim() : null,
      attributes: buildAttributePayload(),
    });
  };

  const renderDynamicField = (attribute: CategoryAttribute) => {
    const error = errors[`attribute-${attribute.id}`];
    const currentValue = attributeValues[attribute.id];

    if (!attribute.active) {
      return (
        <div
          key={attribute.id}
          className="space-y-3 rounded-2xl border border-amber-400/20 bg-amber-500/10 p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-sm font-medium text-amber-50">{attribute.label}</span>
              <p className="mt-1 text-xs text-amber-100/80">
                Atributo inactivo. El valor se conserva para no romper datos existentes.
              </p>
            </div>
            <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100">
              Inactivo
            </span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm text-white">
            {formatReadOnlyAttributeValue(attribute, currentValue)}
          </div>
        </div>
      );
    }

    if (attribute.type === "boolean") {
      return (
        <label
          key={attribute.id}
          className="panel-subtle space-y-3 p-4"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="field-label">{attribute.label}</span>
              <p className="field-hint">Tipo booleano</p>
            </div>
            <input
              aria-label={attribute.label}
              checked={Boolean(currentValue)}
              className="h-5 w-5 rounded border-white/10 bg-white/5"
              onChange={(event) =>
                setAttributeValues((current) => ({
                  ...current,
                  [attribute.id]: event.target.checked,
                }))
              }
              type="checkbox"
            />
          </div>
          {error && <span className="text-sm text-rose-300">{error}</span>}
        </label>
      );
    }

    if (attribute.type === "select") {
      return (
        <label key={attribute.id} className="panel-subtle space-y-2 p-4">
          <span className="field-label">
            {attribute.label}
            {attribute.required ? " *" : ""}
          </span>
          <p className="field-hint">Seleccion unica basada en opciones de categoria.</p>
          <select
            aria-label={attribute.label}
            value={typeof currentValue === "string" ? currentValue : ""}
            onChange={(event) =>
              setAttributeValues((current) => ({
                ...current,
                [attribute.id]: event.target.value,
              }))
            }
            className="toolbar-field w-full"
          >
            <option value="" className="bg-slate-900">
              Selecciona una opcion
            </option>
            {(attribute.options ?? []).map((option) => (
              <option key={option} value={option} className="bg-slate-900">
                {option}
              </option>
            ))}
          </select>
          {error && <span className="text-sm text-rose-300">{error}</span>}
        </label>
      );
    }

    if (attribute.type === "multiselect") {
      const selectedValues = Array.isArray(currentValue) ? currentValue : [];

      return (
        <div key={attribute.id} className="panel-subtle space-y-3 p-4">
          <div>
            <span className="field-label">
              {attribute.label}
              {attribute.required ? " *" : ""}
            </span>
            <p className="field-hint">Seleccion multiple</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {(attribute.options ?? []).map((option) => {
              const checked = selectedValues.includes(option);

              return (
                <label
                  key={option}
                  className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-200"
                >
                  <input
                    aria-label={`${attribute.label}: ${option}`}
                    checked={checked}
                    onChange={(event) => {
                      setAttributeValues((current) => {
                        const previous = Array.isArray(current[attribute.id])
                          ? [...(current[attribute.id] as string[])]
                          : [];

                        return {
                          ...current,
                          [attribute.id]: event.target.checked
                            ? [...previous, option]
                            : previous.filter((item) => item !== option),
                        };
                      });
                    }}
                    type="checkbox"
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </div>

          {error && <span className="text-sm text-rose-300">{error}</span>}
        </div>
      );
    }

    if (attribute.type === "json") {
      return (
        <label key={attribute.id} className="panel-subtle space-y-2 p-4">
          <span className="field-label">
            {attribute.label}
            {attribute.required ? " *" : ""}
          </span>
          <p className="field-hint">JSON estructurado valido para datos avanzados.</p>
          <textarea
            aria-label={attribute.label}
            value={typeof currentValue === "string" ? currentValue : ""}
            onChange={(event) =>
              setAttributeValues((current) => ({
                ...current,
                [attribute.id]: event.target.value,
              }))
            }
            className="toolbar-field min-h-28 w-full font-mono"
            placeholder='{"key":"value"}'
          />
          {error && <span className="text-sm text-rose-300">{error}</span>}
        </label>
      );
    }

    return (
      <label key={attribute.id} className="panel-subtle space-y-2 p-4">
        <span className="field-label">
          {attribute.label}
          {attribute.required ? " *" : ""}
        </span>
        <p className="field-hint">
          {attribute.type === "number"
            ? "Valor numerico"
            : attribute.type === "date"
              ? "Fecha valida"
              : "Valor libre"}
        </p>
        <input
          aria-label={attribute.label}
          value={typeof currentValue === "string" ? currentValue : ""}
          onChange={(event) =>
            setAttributeValues((current) => ({
              ...current,
              [attribute.id]: event.target.value,
            }))
          }
          className="toolbar-field w-full"
          inputMode={attribute.type === "number" ? "decimal" : undefined}
          placeholder={`Valor para ${attribute.label}`}
          type={attribute.type === "number" ? "number" : attribute.type === "date" ? "date" : "text"}
        />
        {error && <span className="text-sm text-rose-300">{error}</span>}
      </label>
    );
  };

  return (
    <Modal open={open} onClose={onCancel} titleId={titleId}>
      <section className="rounded-[30px] border border-white/10 bg-gradient-to-br from-slate-950/95 via-slate-950/95 to-slate-900/95 p-6 shadow-panel">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="toolbar-label">{t("products.title")}</p>
            <h3 id={titleId} className="mt-2 text-2xl font-semibold text-white">
              {title}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Configura campos base y atributos universales segun la categoria seleccionada.
            </p>
          </div>

          <MotionButton
            aria-label="Cerrar formulario de producto"
            onClick={onCancel}
            className="min-h-[42px] rounded-2xl border border-white/10 px-4 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Cancelar
          </MotionButton>
        </div>

        <form className="mt-6 space-y-6" onSubmit={handleSubmit}>
          <section className="panel-subtle p-5">
            <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="toolbar-label">Campos base</p>
                <h4 className="mt-2 text-lg font-semibold text-white">Identidad y clasificacion</h4>
              </div>
              <p className="text-sm text-slate-400">
                Nombre, codigos y categoria principal del producto.
              </p>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              <label className="space-y-2">
                <span className="field-label">Nombre</span>
                <p className="field-hint">Nombre visible dentro del catalogo.</p>
                <input
                  aria-label="Nombre del producto"
                  autoFocus
                  value={values.name}
                  onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
                  className="toolbar-field w-full"
                  placeholder="Nombre del producto"
                />
                {errors.name && <span className="text-sm text-rose-300">{errors.name}</span>}
              </label>

              <label className="space-y-2">
                <span className="field-label">SKU</span>
                <p className="field-hint">Clave interna para operacion y busqueda.</p>
                <input
                  aria-label="SKU del producto"
                  value={values.sku}
                  onChange={(event) => setValues((current) => ({ ...current, sku: event.target.value }))}
                  className="toolbar-field w-full"
                  placeholder="Ej. ELEC-SENSOR-001"
                />
                {errors.sku && <span className="text-sm text-rose-300">{errors.sku}</span>}
              </label>

              <label className="space-y-2">
                <span className="field-label">{t("common.barcode")}</span>
                <p className="field-hint">Código para búsqueda rápida y escaneo.</p>
                <input
                  aria-label={t("common.barcode")}
                  value={values.barcode}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, barcode: event.target.value }))
                  }
                  className="toolbar-field w-full"
                  placeholder="Ej. 770100000001"
                />
                {errors.barcode && <span className="text-sm text-rose-300">{errors.barcode}</span>}
              </label>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-3">
              <label className="space-y-2">
                <span className="field-label">Categoria</span>
                <p className="field-hint">Determina atributos dinamicos y clasificacion.</p>
                <select
                  aria-label="Categoria del producto"
                  value={values.categoryId}
                  onChange={(event) => setValues((current) => ({ ...current, categoryId: event.target.value }))}
                  className="toolbar-field w-full"
                >
                  <option value="" className="bg-slate-900">
                    Selecciona una categoria
                  </option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id} className="bg-slate-900">
                      {category.name}
                    </option>
                  ))}
                </select>
                {errors.categoryId && <span className="text-sm text-rose-300">{errors.categoryId}</span>}
              </label>

              <label className="space-y-2">
                <span className="field-label">Precio</span>
                <p className="field-hint">Valor unitario de referencia del producto.</p>
                <input
                  aria-label="Precio del producto"
                  value={values.price}
                  onChange={(event) => setValues((current) => ({ ...current, price: event.target.value }))}
                  className="toolbar-field w-full"
                  inputMode="decimal"
                  min="0"
                  placeholder="0.00"
                  type="number"
                />
                {errors.price && <span className="text-sm text-rose-300">{errors.price}</span>}
              </label>

              <label className="space-y-2">
                <span className="field-label">Stock minimo</span>
                <p className="field-hint">Umbral visual para alertas y reposicion.</p>
                <input
                  aria-label="Stock minimo del producto"
                  value={values.minimumStock}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, minimumStock: event.target.value }))
                  }
                  className="toolbar-field w-full"
                  inputMode="numeric"
                  min="0"
                  step="1"
                  type="number"
                />
                {errors.minimumStock && <span className="text-sm text-rose-300">{errors.minimumStock}</span>}
              </label>
            </div>
          </section>

          <section className="panel-subtle p-5">
            <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="toolbar-label">Contexto</p>
                <h4 className="mt-2 text-lg font-semibold text-white">Descripcion operativa</h4>
              </div>
              <p className="text-sm text-slate-400">
                Texto breve para que el equipo identifique mejor el producto.
              </p>
            </div>

            <label className="mt-5 block space-y-2">
              <span className="field-label">Descripcion</span>
              <p className="field-hint">Opcional. Se muestra en la tabla y el detalle del producto.</p>
              <textarea
                aria-label="Descripcion del producto"
                value={values.description}
                onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))}
                className="toolbar-field min-h-28 w-full"
                placeholder="Detalles opcionales del producto"
              />
            </label>
          </section>

          <section className="panel-subtle p-5">
            <div className="flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="toolbar-label">Atributos dinamicos</p>
                <h4 className="mt-2 text-lg font-semibold text-white">Campos segun categoria</h4>
                <p className="mt-2 text-sm text-slate-400">
                  El formulario se adapta automaticamente a la categoria elegida.
                </p>
              </div>
              {attributeLoading && <span className="text-sm text-slate-400">Cargando atributos...</span>}
            </div>

            {!values.categoryId && (
              <p className="state-card mt-5">
                Selecciona una categoria para cargar sus atributos universales.
              </p>
            )}

            {values.categoryId && !attributeLoading && attributeDefinitions.length === 0 && (
              <p className="state-card mt-5">
                Esta categoria no tiene atributos dinamicos activos. El producto funcionara solo con
                sus campos base.
              </p>
            )}

            {attributeDefinitions.length > 0 && (
              <div className="mt-5 grid gap-5 xl:grid-cols-2">
                {attributeDefinitions.map(renderDynamicField)}
              </div>
            )}
          </section>

          <div className="flex flex-col gap-4 border-t border-white/10 pt-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-slate-400">
              {mode === "create"
                ? "El producto se crea con campos base y atributos validados segun la categoria."
                : "Puedes actualizar catalogo y atributos sin afectar el historial de stock."}
            </p>

            <MotionButton
              aria-label={mode === "create" ? "Crear producto" : "Guardar cambios del producto"}
              type="submit"
              disabled={saving}
              className="min-h-[48px] rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Guardando..." : mode === "create" ? "Crear producto" : "Guardar cambios"}
            </MotionButton>
          </div>
        </form>
      </section>
    </Modal>
  );
}
