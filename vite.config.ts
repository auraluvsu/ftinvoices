import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // Libraries change far less often than app code: give them their own long-cached chunks.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'router', test: /node_modules[\\/](react-router|cookie|set-cookie-parser)[\\/]/ },
            { name: 'supabase', test: /node_modules[\\/](@supabase|tslib|iceberg-js)[\\/]/ },
          ],
        },
      },
    },
  },
})
