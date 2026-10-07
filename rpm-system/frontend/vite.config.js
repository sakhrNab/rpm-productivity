import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Development server configuration
  server: {
    port: 3012,
    // Proxy API calls to backend during development
    proxy: {
      '/api': {
        target: 'http://localhost:3013',
        changeOrigin: true,
        // Optionally rewrite the path
        // rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  
  // Preview server (for testing production build locally)
  preview: {
    port: 3012,
  },
  
  // Build configuration
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        // Vite 8 (Rolldown) accepts only the function form.
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) return 'vendor';
        },
      },
    },
  },
  
  // Define environment variables prefix (default is VITE_)
  envPrefix: 'VITE_',
});