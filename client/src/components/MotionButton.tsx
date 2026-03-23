import { motion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";

type MotionButtonProps = HTMLMotionProps<"button"> & {
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
    <motion.button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap align-middle ${className ?? ""}`}
      whileHover={
        disabled ? undefined : { scale: 1.05, boxShadow: "0 12px 30px rgba(8, 17, 31, 0.24)" }
      }
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      {...props}
    >
      {children}
    </motion.button>
  );
}
