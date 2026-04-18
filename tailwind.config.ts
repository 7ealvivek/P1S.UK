import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          tertiary: "var(--bg-tertiary)",
          hover: "var(--bg-hover)",
          active: "var(--bg-active)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
        },
        severity: {
          critical: "var(--color-critical)",
          high: "var(--color-high)",
          medium: "var(--color-medium)",
          low: "var(--color-low)",
          info: "var(--color-info)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          hover: "var(--color-accent-hover)",
        },
        border: {
          default: "var(--border-default)",
          subtle: "var(--border-subtle)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "Cascadia Code",
          "SF Mono",
          "monospace",
        ],
      },
      fontSize: {
        display: ["2rem", { lineHeight: "1.2", fontWeight: "700" }],
        heading: ["1.25rem", { lineHeight: "1.2", fontWeight: "600" }],
        subheading: ["1rem", { lineHeight: "1.5", fontWeight: "500" }],
        body: ["0.875rem", { lineHeight: "1.5", fontWeight: "400" }],
        caption: ["0.75rem", { lineHeight: "1.5", fontWeight: "400" }],
        mono: ["0.8125rem", { lineHeight: "1.5", fontWeight: "400" }],
      },
      borderRadius: {
        card: "8px",
        button: "6px",
        badge: "4px",
        modal: "12px",
      },
      maxWidth: {
        content: "1440px",
      },
      width: {
        sidebar: "240px",
        "sidebar-collapsed": "64px",
      },
      animation: {
        "slide-in": "slideIn 300ms ease-out",
        "fade-in": "fadeIn 200ms ease-out",
        shimmer: "shimmer 2s infinite",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateY(-8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
