import GlobalLoader from "./GlobalLoader";
import { t } from "../i18n";

type SectionLoaderProps = {
  label?: string;
};

export default function SectionLoader({ label = t("loading.section") }: SectionLoaderProps) {
  return (
    <section className="rounded-[28px] border border-white/10 bg-slate-950/55 p-6 shadow-panel">
      <GlobalLoader label={label} subtle />
    </section>
  );
}
