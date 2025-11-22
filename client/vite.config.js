import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Explicitly set the base directory for the build to the current folder (client/)
  // This helps Vite find index.html correctly.
  root: '.', 
  build: {
    // Output directory relative to the project root (client)
    outDir: 'dist',
    assetsDir: 'assets', 
    emptyOutDir: true,
  },
  server: {
    // Proxy API requests from the client to the server on port 3001
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      // You may need to add more paths here if you use GraphQL or other API paths
    },
  },
});
