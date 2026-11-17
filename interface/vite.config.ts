import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// La version compilee va dans outil/Interface/app, servie par outil/Scripts/Serveur-Interface.ps1.
// Elle est versionnee : les utilisateurs n'ont pas besoin de Node.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  base: './',
  build: { outDir: path.resolve(import.meta.dirname, '../outil/Interface/app'), emptyOutDir: true },
  server: { proxy: { '/api': 'http://localhost:8765' } },
})
