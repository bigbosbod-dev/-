/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  // Tailwind อ่านชื่อคลาสจากไฟล์เหล่านี้ (รวมคลาสที่อยู่ในโค้ด JS) แล้วสร้างเฉพาะ CSS ที่ใช้จริง
  content: ['./index.html', './js/**/*.js'],
  theme: { extend: {} },
  plugins: [],
};
