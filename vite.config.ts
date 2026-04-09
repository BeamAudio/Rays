import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/Rays/',
  plugins: [
    react()
  ],
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: false
  }
})
