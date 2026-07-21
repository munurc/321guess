import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#f6f2ea",
        "paper-2": "#ede8dc",
        ink: "#1e1c19",
        "ink-soft": "#4a4640",
        "ink-mute": "#7a746a",
        rule: "#d9d3c4",
        accent: "#3f6b56",
        "accent-strong": "#2f5443",
      },
      keyframes: {
        countdown: {
          "0%": { transform: "scale(0.4)", opacity: "0" },
          "20%": { transform: "scale(1.15)", opacity: "1" },
          "80%": { transform: "scale(1)", opacity: "1" },
          "100%": { transform: "scale(1.6)", opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        countdown: "countdown 1s ease-in-out forwards",
        "fade-in": "fade-in 0.4s ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;
