import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plugin to force proper MIME types for strict module checking on Windows
const forceMimeTypePlugin = () => {
  return {
    name: 'force-mime-type',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const url = req.url || '';
        if (url.includes('.ts') || url.includes('.tsx') || url.includes('.js')) {
          res.setHeader('Content-Type', 'application/javascript');
        }
        next();
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/Rays/',
  plugins: [
    react(),
    forceMimeTypePlugin()
  ],
  build: {
    target: 'esnext',
    minify: 'terser',
    sourcemap: false
  }
})
