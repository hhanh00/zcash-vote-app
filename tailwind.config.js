const flowbite = require("flowbite-react/tailwind")

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,ts,tsx}", flowbite.content()],
  theme: {
    extend: {},
  },
  plugins: [
    flowbite.plugin(),
  ],
}

