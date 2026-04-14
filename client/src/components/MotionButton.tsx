import type { ReactNode } from "react";
import type { ButtonHTMLAttributes } from "react";

type MotionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
};

export default function MotionButton({
  children,
  type = "button",
  disabled,
  className,
  ...props
}: MotionButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={`ui-button inline-flex items-center justify-center gap-2 whitespace-nowrap align-middle ${className ?? ""}`}
      {...props}
    >
      {children}
    </button>
  );
}
