import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Secret Gemini API keys are server-only. Never inject them into browser bundles.
  resolve: { alias: { '@': path.resolve(process.cwd(), '.') } },
  server: { hmr: process.env.DISABLE_HMR !== 'true' }
});
