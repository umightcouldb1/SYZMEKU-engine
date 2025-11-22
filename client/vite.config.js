import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // FIX: Change the build target to 'es2020' to support modern features like import.meta.env
  build: {
    target: 'es2020',
  },
})
