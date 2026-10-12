import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': import.meta.dirname,
      },
    },
    build: {
      rollupOptions: {
        output: {
          // Split vendor code from app code so React and its runtime cache
          // independently of application changes. Without this, every app
          // edit invalidates the browser cache for React as well.
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
              return 'vendor-react';
            }
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-icons';
            }
            return undefined;
          },
        },
      },
      chunkSizeWarningLimit: 700,
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'server/**/*.test.js'],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // The browser talks only to the API server, so the session cookie is
      // same-origin and the Roboflow credential stays behind the proxy.
      proxy: {
        '/api': {
          target: process.env.VITE_API_PROXY || 'http://localhost:4000',
          changeOrigin: false
        }
      },
    },
  };
});
