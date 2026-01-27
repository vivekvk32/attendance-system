import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        smoke: "#475569",
        brand: {
          50: "#eef6ff",
          100: "#d9e9ff",
          200: "#b7d4ff",
          300: "#8ab7ff",
          400: "#5a93ff",
          500: "#346cf7",
          600: "#2757d7",
          700: "#2347ad",
          800: "#223d8a",
          900: "#1f356f"
        }
      }
    }
  },
  plugins: []
};

export default config;
