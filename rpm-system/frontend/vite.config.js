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
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  
  // Define environment variables prefix (default is VITE_)
  envPrefix: 'VITE_',
});