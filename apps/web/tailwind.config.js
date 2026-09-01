/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        paper: "rgb(var(--paper) / <alpha-value>)",
        "paper-2": "rgb(var(--paper-2) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        "ink-soft": "rgb(var(--ink-soft) / <alpha-value>)",
        "ink-mute": "rgb(var(--ink-mute) / <alpha-value>)",
        rule: "rgb(var(--rule) / <alpha-value>)",
        accent: "rgb(var(--accent) / <alpha-value>)",
        "accent-strong": "rgb(var(--accent-strong) / <alpha-value>)",
        // Mobile-only "arena" identity — fixed regardless of device
        // light/dark mode, so plain hex (not CSS-var-driven like the
        // tokens above). Never used on web; see
        // docs/superpowers/specs/2026-08-13-mobile-lively-design-design.md.
        "arena-bg": "#0F2A1E",
        "arena-bg-soft": "rgba(255,255,255,0.08)",
        "arena-card": "#F7F5F0",
        "arena-accent": "#FFC738",
        "arena-accent-strong": "#C99418",
        "arena-accent-2": "#2ECC8F",
        "arena-accent-2-strong": "#1F9C6C",
        "arena-text": "#F0FBF5",
        "arena-text-soft": "#8FE8C4",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out forwards",
      },
    },
  },
  plugins: [],
};
