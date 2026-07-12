import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Configuration Vite minimale : une simple SPA React statique.
// Aucun proxy, aucune fonction serveur : tout tourne dans le navigateur.
export default defineConfig({
  plugins: [react()],
  // Port fixe : l'origine autorisee dans Google Cloud (OAuth) doit
  // correspondre EXACTEMENT, port compris. strictPort => erreur claire si
  // 5173 est occupe, plutot qu'un glissement silencieux qui casserait la
  // connexion Google.
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
  },
})
