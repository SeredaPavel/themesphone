// 📄 tailwind.config.mjs
export default {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      screens: {
        xs: '360px', // добавлен брейкпоинт для мобильных
      },
    },
  },
  darkMode: 'media',
  plugins: [require('tailwind-scrollbar-hide')],
}
