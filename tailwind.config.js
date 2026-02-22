/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brew-dark': '#2c3e50',
        'brew-dark-secondary': '#34495e',
        'brew-light': '#ecf0f1',
        'brew-accent': '#f1c40f',
        'brew-blue': '#2980b9',
        'brew-green': '#27ae60',
        'brew-red': '#c0392b',
        'brew-orange': '#d35400',
        'brew-purple': '#8e44ad',
      },
    },
  },
  plugins: [],
}
