/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{js,jsx,ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        green: {
          900: '#0f2e22',
          800: '#1e5940',
          700: '#2a7a58',
          200: '#b8d9cc',
          100: '#dff0e8',
          50:  '#f0f8f4',
        },
        amber: {
          700: '#a07820',
          500: '#c89b3c',
          300: '#e2c47a',
          100: '#f5e8c4',
        },
        cream: {
          DEFAULT: '#faf6ec',
          dark:    '#f0ead8',
        },
        neutral: {
          900: '#1a1a18',
          700: '#3d3d38',
          500: '#6b6b62',
          300: '#b0b0a4',
          100: '#e8e8e0',
        },
      },
      fontFamily: {
        serif: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans:  ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '20px',
      },
    },
  },
  plugins: [],
};
