import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Define environment variables during the build process
  define: {
    // Check if we are building for production (Render)
    'process.env.VITE_API_BASE_URL': 
      // If it's production mode, set the API URL to a relative path ("/")
      // This makes the browser automatically use the current host (syzmeku-api.onrender.com)
      mode === 'production' 
        ? JSON.stringify('/')
        // Otherwise (development mode), fall back to the value defined in .env
        : JSON.stringify(process.env.VITE_API_BASE_URL),
  },
  build: {
    // Ensure the output directory is 'dist' for the server to find the files
    outDir: 'dist',
  }
}));
