// File: client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Ensure the base URL is correct for deployment
  base: '/',
  resolve: {
    alias: {
      // Setup an alias for the source directory for absolute imports
      '@': path.resolve(__dirname, 'src'), 
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  build: {
    outDir: 'dist', 
  },
});
