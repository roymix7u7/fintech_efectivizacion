/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Tokens de shadcn. Antes faltaban casi todos, asi que clases
        // como bg-card o text-muted-foreground no producian nada y los
        // componentes se veian sin estilo.
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

        // Identidad de AlToque Perú, la misma que usa la app movil.
        marca: {
          950: "#0B1426",
          900: "#0F1B33",
          800: "#16243F",
          700: "#1B2A4A",
          600: "#2C4270",
          500: "#3D588F",
          200: "#C3CEE2",
          100: "#E3E8F4",
          50: "#F2F5FB",
        },
        oro: {
          700: "#8A6D00",
          600: "#C49B00",
          500: "#E8B800",
          300: "#F5D976",
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
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(15, 27, 51, 0.04), 0 1px 3px rgba(15, 27, 51, 0.06)",
        alzado: "0 4px 12px rgba(15, 27, 51, 0.08), 0 1px 3px rgba(15, 27, 51, 0.06)",
        flotante: "0 12px 32px rgba(15, 27, 51, 0.16)",
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
