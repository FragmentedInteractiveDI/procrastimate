// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: { enabled: true }, // enables virtual import in dev
      manifest: {
        name: 'ProcrastiMate',
        short_name: 'ProcrastiMate',
        start_url: '/',
        display: 'standalone',
        background_color: '#111111',
        theme_color: '#111111',
        icons: [],
      },
    }),
  ],
  css: { transformer: 'postcss' },
  optimizeDeps: { exclude: ['lightningcss'] },
  ssr: { noExternal: ['lightningcss'] },
});
