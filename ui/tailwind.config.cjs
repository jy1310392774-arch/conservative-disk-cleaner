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
        rippling: "rippling 1s ease-out"
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
        }
      }
    }
  },
  plugins: []
};
