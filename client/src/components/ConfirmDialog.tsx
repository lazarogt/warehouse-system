import MotionButton from "./MotionButton";
import Modal from "./Modal";
import { t } from "../i18n";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  errorMessage?: string | null;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = t("common.cancel"),
  errorMessage = null,
  confirming = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  const titleId = "confirm-dialog-title";

  return (
    <Modal open={open} onClose={onCancel} titleId={titleId}>
      <section className="rounded-[28px] border border-white/10 bg-slate-950/95 p-6 shadow-panel">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-rose-200">{t("common.confirm")}</p>
          <h3 id={titleId} className="mt-2 text-2xl font-semibold text-white">
            {title}
          </h3>
          <p className="mt-3 text-sm leading-7 text-slate-300">{description}</p>
          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <MotionButton
            aria-label={confirmLabel}
            className="rounded-2xl bg-rose-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={confirming}
            onClick={onConfirm}
          >
            {confirming ? t("loading.processing") : confirmLabel}
          </MotionButton>

          <MotionButton
            aria-label={cancelLabel}
            className="rounded-2xl border border-white/10 px-5 py-3 text-sm font-medium text-slate-200 transition hover:bg-white/5"
            disabled={confirming}
            onClick={onCancel}
          >
            {cancelLabel}
          </MotionButton>
        </div>
      </section>
    </Modal>
  );
}
