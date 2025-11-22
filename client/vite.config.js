// File: client/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path'; // Required for path resolution

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Set the root alias for better module resolution
      '@': path.resolve(__dirname, 'src'), 
      'src': path.resolve(__dirname, 'src'), 
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json'],
  },
  build: {
    outDir: 'dist', // Ensure the output directory is correct
  },
});
