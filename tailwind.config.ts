import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Semantic surface tokens — flip automatically via CSS variables in light/dark mode.
        // Use these in new code instead of hardcoded bg-slate-800/60 etc.
        "base":    "var(--bg-base)",
        "card":    "var(--bg-card)",
        "surface": "var(--bg-surface)",
        "input":   "var(--bg-input)",
        "primary": "var(--text-1)",
        "secondary-text": "var(--text-2)",
        "muted":   "var(--text-3)",
        "brand":   "var(--brand-primary)",
        "brand-strong": "var(--brand-primary-strong)",
        "border-default": "var(--border)",
        "border-md": "var(--border-md)",
      },
    },
  },
  plugins: [],
};
export default config;
