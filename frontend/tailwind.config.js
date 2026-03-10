/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        dark: {
          900: "#080812",
          800: "#0f0f1e",
          700: "#16162a",
          600: "#1e1e35",
          500: "#2a2a45",
        },
        brand: {
          DEFAULT: "#7c3aed",
          light: "#9d5cf6",
          dark: "#5b21b6",
        },
        accent: "#06b6d4",
        gold: "#f59e0b",
        silver: "#94a3b8",
        bronze: "#b45309",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 0.3s ease-in-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};
