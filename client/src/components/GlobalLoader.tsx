type GlobalLoaderProps = {
  label?: string;
  fullscreen?: boolean;
  subtle?: boolean;
};

export default function GlobalLoader({
  label = "Cargando contenido...",
  fullscreen = false,
  subtle = false,
}: GlobalLoaderProps) {
  const wrapperClassName = fullscreen
    ? "fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm"
    : "flex items-center justify-center px-4 py-10";

  return (
    <div className={wrapperClassName} aria-live="polite" aria-busy="true">
      <div
        className={`flex min-w-[220px] items-center gap-4 rounded-[24px] border border-white/10 px-5 py-4 shadow-md ${
          subtle ? "bg-slate-950/55" : "bg-slate-950/80"
        }`}
      >
        <div className="h-10 w-10 rounded-full border-2 border-white/15 border-t-cyan-300 motion-safe:animate-spin motion-reduce:animate-none" />
        <div>
          <p className="text-sm font-semibold text-white">Procesando</p>
          <p className="mt-1 text-sm text-slate-300">{label}</p>
        </div>
      </div>
    </div>
  );
}
