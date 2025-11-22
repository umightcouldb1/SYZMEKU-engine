import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// This configuration is necessary to support import.meta.env in the build process.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2020',
  },
})
