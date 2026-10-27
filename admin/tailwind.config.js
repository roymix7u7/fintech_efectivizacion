/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Los colores de cada persona del equipo viven en lib/colores.js:
    // sin esta línea Tailwind los descartaba y las etiquetas salían grises.
    "./src/lib/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tokens de shadcn. Sin ellos clases como bg-card o
        // text-muted-foreground no producen nada.
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        // Identidad de AlToque Perú, la misma que usa la app móvil
        // (app/src/theme/tokens.js).
        marca: {
          950: "#0B1426",
          900: "#0F1B33",
          800: "#16243F",
          700: "#1B2A4A",
          600: "#2C4270",
          500: "#3D588F",
          300: "#9FB0CF",
          200: "#C3CEE2",
          100: "#E3E8F4",
          50: "#F2F5FB",
        },
        oro: {
          700: "#8C6A00",
          600: "#C49B00",
          500: "#E8B800",
          300: "#F5D976",
          200: "#FBE7A1",
          100: "#FFF3CC",
          50: "#FFFBEB",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["var(--font-texto)", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        heading: ["var(--font-titulo)", "var(--font-texto)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      // Escala del panel. Nada por debajo de 12 px: antes había textos de
      // 9 y 10 px que no se leían en una pantalla normal.
      fontSize: {
        xs: ["0.75rem", { lineHeight: "1.1rem" }], // 12
        chico: ["0.8125rem", { lineHeight: "1.2rem" }], // 13
        sm: ["0.875rem", { lineHeight: "1.3rem" }], // 14
        md: ["0.9375rem", { lineHeight: "1.4rem" }], // 15
        base: ["1rem", { lineHeight: "1.5rem" }], // 16
        lg: ["1.125rem", { lineHeight: "1.6rem" }], // 18
        xl: ["1.25rem", { lineHeight: "1.7rem" }], // 20
        "2xl": ["1.5rem", { lineHeight: "1.9rem" }], // 24
        "3xl": ["1.875rem", { lineHeight: "2.2rem" }], // 30
      },
      boxShadow: {
        panel: "0 1px 2px rgba(15, 27, 51, 0.05), 0 1px 3px rgba(15, 27, 51, 0.05)",
        alzado: "0 6px 16px rgba(15, 27, 51, 0.08), 0 1px 3px rgba(15, 27, 51, 0.06)",
        flotante: "0 16px 40px rgba(15, 27, 51, 0.18)",
      },
      keyframes: {
        aparecer: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        aparecer: "aparecer 180ms ease-out",
      },
    },
  },
  plugins: [],
};
