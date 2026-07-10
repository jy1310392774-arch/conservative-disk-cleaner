/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        primary: "var(--primary)"
      },
      animation: {
        rippling: "rippling 1s ease-out",
        "gradient-first": "gradient-first 18s ease-in-out infinite",
        "gradient-second": "gradient-second 22s ease-in-out infinite",
        "gradient-third": "gradient-third 24s ease-in-out infinite",
        "gradient-fourth": "gradient-fourth 20s ease-in-out infinite",
        "gradient-fifth": "gradient-fifth 26s ease-in-out infinite"
      },
      keyframes: {
        rippling: {
          "0%": {
            opacity: "1"
          },
          "100%": {
            transform: "scale(2)",
            opacity: "0"
          }
        },
        "gradient-first": {
          "0%, 100%": { transform: "translate(-15%, -10%) rotate(0deg)" },
          "50%": { transform: "translate(18%, 12%) rotate(180deg)" }
        },
        "gradient-second": {
          "0%, 100%": { transform: "translate(15%, 5%) rotate(0deg)" },
          "50%": { transform: "translate(-12%, -18%) rotate(-180deg)" }
        },
        "gradient-third": {
          "0%, 100%": { transform: "translate(-5%, 18%) rotate(0deg)" },
          "50%": { transform: "translate(15%, -10%) rotate(180deg)" }
        },
        "gradient-fourth": {
          "0%, 100%": { transform: "translate(12%, -14%) rotate(0deg)" },
          "50%": { transform: "translate(-18%, 15%) rotate(-180deg)" }
        },
        "gradient-fifth": {
          "0%, 100%": { transform: "translate(-16%, 12%) rotate(0deg)" },
          "50%": { transform: "translate(16%, -16%) rotate(180deg)" }
        }
      }
    }
  },
  plugins: []
};
