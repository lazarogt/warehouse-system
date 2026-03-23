import type { ReactNode } from "react";

type ActionGroupProps = {
  children: ReactNode;
  align?: "start" | "end";
};

export default function ActionGroup({ children, align = "start" }: ActionGroupProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${align === "end" ? "justify-end" : "justify-start"}`}
    >
      {children}
    </div>
  );
}
