import { sentryVitePlugin } from '@sentry/vite-plugin';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import info from '../server/src/serverInfo.json' with { type: 'json' };

const isDemoMode = process.env.VITE_ENV === 'demo';
const isPreview = process.env.VITE_ENV === 'artifact';
const isProdMode = process.env.VITE_ENV === 'prod';

const plugins = [react()];

// PodSleep: no Sentry upload (the Pod is kept offline).
void isProdMode; void info; void sentryVitePlugin;

export default defineConfig({
  base: isPreview ? './' : '/',
  plugins,
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: '0.0.0.0', // This makes the server accessible to other devices on the network
    port: 5173, // Optional: specify a port if you want something other than the default
  },
  build: {
    sourcemap: false,
    outDir: isPreview ? './dist-preview/' : isDemoMode ? './dist/' : '../server/public/',
    rolldownOptions: {
      output: {
        // PodSleep: hashed names so phones never run a stale copy after an update.
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
});
