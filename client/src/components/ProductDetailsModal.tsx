import type { Product } from "../../../shared/src";
import Modal from "./Modal";
import MotionButton from "./MotionButton";

type ProductDetailsModalProps = {
  open: boolean;
  product: Product | null;
  onClose: () => void;
};

const formatAttributeValue = (type: Product["attributes"][number]["type"], value: string) => {
  if (type === "boolean") {
    return value === "true" ? "Si" : "No";
  }

  if (type === "multiselect" || type === "json") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }

  return value;
};

export default function ProductDetailsModal({
  open,
  product,
  onClose,
}: ProductDetailsModalProps) {
  const titleId = "product-details-modal";

  return (
    <Modal open={open} onClose={onClose} titleId={titleId}>
      <section className="rounded-[30px] border border-white/10 bg-gradient-to-br from-slate-950/95 via-slate-950/95 to-slate-900/95 p-6 shadow-panel">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="toolbar-label">Product details</p>
            <h3 id={titleId} className="mt-2 text-2xl font-semibold text-white">
              {product?.name ?? "Detalle de producto"}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Vista de campos base y atributos universales asociados a la categoria.
            </p>
          </div>

          <MotionButton
            aria-label="Cerrar detalle del producto"
            onClick={onClose}
            className="min-h-[42px] rounded-2xl border border-white/10 px-4 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            Cerrar
          </MotionButton>
        </div>

        {product && (
          <div className="mt-6 space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              <article className="panel-subtle p-4">
                <p className="toolbar-label">SKU</p>
                <p className="mt-3 text-sm font-semibold text-white">{product.sku ?? "No definido"}</p>
              </article>
              <article className="panel-subtle p-4">
                <p className="toolbar-label">Barcode</p>
                <p className="mt-3 text-sm font-semibold text-white">{product.barcode ?? "No definido"}</p>
              </article>
              <article className="panel-subtle p-4">
                <p className="toolbar-label">Categoria</p>
                <p className="mt-3 text-sm font-semibold text-white">{product.categoryName}</p>
              </article>
              <article className="panel-subtle p-4">
                <p className="toolbar-label">Precio</p>
                <p className="mt-3 text-sm font-semibold text-white">${product.price.toFixed(2)}</p>
              </article>
              <article className="panel-subtle p-4">
                <p className="toolbar-label">Stock actual</p>
                <p className="mt-3 text-sm font-semibold text-white">{product.currentStock}</p>
              </article>
              <article className="panel-subtle p-4">
                <p className="toolbar-label">Stock minimo</p>
                <p className="mt-3 text-sm font-semibold text-white">{product.minimumStock}</p>
              </article>
            </section>

            {product.description && (
              <section className="panel-subtle p-4">
                <p className="toolbar-label">Descripcion</p>
                <p className="mt-3 text-sm leading-6 text-slate-200">{product.description}</p>
              </section>
            )}

            <section className="panel-subtle p-4">
              <div className="flex flex-col gap-2 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="toolbar-label">Atributos dinamicos</p>
                  <h4 className="mt-2 text-lg font-semibold text-white">Campos universales cargados</h4>
                </div>
                <p className="text-sm text-slate-400">Se muestran ordenados segun la categoria actual.</p>
              </div>
              {product.attributes.length === 0 ? (
                <p className="state-card mt-4">
                  Este producto no tiene atributos dinamicos configurados.
                </p>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {product.attributes.map((attribute) => (
                    <article
                      key={attribute.id}
                      className="rounded-2xl border border-white/10 bg-slate-950/45 p-4"
                    >
                      <p className="toolbar-label">{attribute.label}</p>
                      <pre className="mt-3 whitespace-pre-wrap break-words font-sans text-sm text-white">
                        {formatAttributeValue(attribute.type, attribute.value)}
                      </pre>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </Modal>
  );
}
