type SectionNoticeProps = {
  title: string;
  message: string;
  tone?: "error" | "warning" | "info";
};

const toneStyles: Record<NonNullable<SectionNoticeProps["tone"]>, string> = {
  error: "border-rose-400/20 bg-rose-500/10 text-rose-100",
  warning: "border-amber-400/20 bg-amber-500/10 text-amber-50",
  info: "border-white/10 bg-white/5 text-slate-200",
};

export default function SectionNotice({
  title,
  message,
  tone = "info",
}: SectionNoticeProps) {
  return (
    <section className={`rounded-[24px] border px-5 py-4 shadow-panel ${toneStyles[tone]}`}>
      <p className="text-xs uppercase tracking-[0.25em]">{title}</p>
      <p className="mt-3 text-sm leading-7">{message}</p>
    </section>
  );
}
