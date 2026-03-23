import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#08111f",
        panel: "#0f1b2d",
        accent: "#f97316",
        mist: "#cbd5e1",
        mint: "#7dd3c7",
      },
      boxShadow: {
        panel: "0 24px 80px rgba(8, 17, 31, 0.26)",
      },
      backgroundImage: {
        grid: "radial-gradient(circle at top, rgba(125, 211, 199, 0.18), transparent 28%), linear-gradient(135deg, rgba(249, 115, 22, 0.14), transparent 38%)",
      },
    },
  },
  plugins: [],
} satisfies Config;
