/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      animation: {
        "slide-in-right": "slideInRight 0.25s ease-out",
        "fade-in": "fadeIn 0.3s ease-in",
        "pulse-glow": "pulseGlow 0.6s ease-in-out",
        "checkmark-draw": "checkmarkDraw 0.4s ease-out forwards",
      },
      keyframes: {
        slideInRight: {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseGlow: {
          "0%": { boxShadow: "0 0 0 0 rgba(34,197,94,0.5)" },
          "50%": { boxShadow: "0 0 16px 4px rgba(34,197,94,0.3)" },
          "100%": { boxShadow: "0 0 0 0 rgba(34,197,94,0)" },
        },
        checkmarkDraw: {
          "0%": { strokeDashoffset: "24" },
          "100%": { strokeDashoffset: "0" },
        },
      },
    },
  },
  plugins: [],
};
