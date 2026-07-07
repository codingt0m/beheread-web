import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuration Vite minimale : une simple SPA React statique.
// Aucun proxy, aucune fonction serveur : tout tourne dans le navigateur.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
  },
})
