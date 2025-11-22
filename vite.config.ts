import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Ensures assets are loaded correctly on GitHub Pages relative paths
  define: {
    // Prevent runtime crashes when accessing process.env in the browser
    'process.env': {}
  }
})