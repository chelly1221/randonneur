import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Static brand palette (for decorative/fixed use)
        "sky-black": "#0a0a0a",
        "sky-darkblue": {
          DEFAULT: "#1a237e",
          light: "#283593",
          dark: "#0d1642",
        },
        "sky-blue": {
          DEFAULT: "#4fc3f7",
          light: "#80d8ff",
          dark: "#0288d1",
        },
        "sky-yellow": {
          DEFAULT: "#fdd835",
          light: "#ffee58",
          dark: "#f9a825",
        },
        "sky-orange": {
          DEFAULT: "#ff9800",
          light: "#ffb74d",
          dark: "#e65100",
        },
        "sky-red": {
          DEFAULT: "#e53935",
          light: "#ef5350",
          dark: "#b71c1c",
        },
        // Semantic theme tokens (CSS custom properties per theme)
        "t-bg": "var(--t-bg)",
        "t-surface": "var(--t-surface)",
        "t-subtle": "var(--t-subtle)",
        "t-hover": "var(--t-hover)",
        "t-border": "var(--t-border)",
        "t-divider": "var(--t-divider)",
        "t-text": "var(--t-text)",
        "t-sub": "var(--t-sub)",
        "t-muted": "var(--t-muted)",
        "t-faint": "var(--t-faint)",
        "t-icon": "var(--t-icon)",
        "t-header": "var(--t-header)",
        "t-header-x": "var(--t-header-x)",
        "t-sidebar": "var(--t-sidebar)",
        "t-accent": "var(--t-accent)",
        "t-accent-x": "var(--t-accent-x)",
        "t-link": "var(--t-link)",
        "t-link-x": "var(--t-link-x)",
        "t-focus": "var(--t-focus)",
        "t-primary": "var(--t-primary)",
        "t-primary-x": "var(--t-primary-x)",
        "t-secondary": "var(--t-secondary)",
        "t-secondary-x": "var(--t-secondary-x)",
        "t-outline-bg": "var(--t-outline-bg)",
        "t-outline-hover": "var(--t-outline-hover)",
        "t-outline-border": "var(--t-outline-border)",
        "t-badge-bg": "var(--t-badge-bg)",
        "t-badge-text": "var(--t-badge-text)",
        "t-badge-p-bg": "var(--t-badge-p-bg)",
        "t-badge-p-text": "var(--t-badge-p-text)",
        "t-success": "var(--t-success)",
        "t-danger": "var(--t-danger)",
        "t-hero-accent": "var(--t-hero-accent)",
      },
    },
  },
  plugins: [],
};

export default config;
