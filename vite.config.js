import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Change base to '/' if using a custom domain with GitHub Pages
export default defineConfig({
  plugins: [react()],
  base: '/la-tekken-rank-tracker/',
  server: {
    port: 3000,
    strictPort: false,
  },
})
