import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.BACKEND_PORT ?? '4000';
  const backendTarget = env.BACKEND_URL ?? `http://localhost:${backendPort}`;

  return {
    plugins: [react()],
    // .xlsx isn't in Vite's built-in asset-extension list, so without this
    // it tries to parse the Task 3 Download Template file as JS. Treat it
    // as a plain static asset (import gives back a URL) like any image.
    assetsInclude: ['**/*.xlsx'],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    // `vite preview` (the static server for the production build) needs its
    // own proxy config — it doesn't inherit from `server`. Match dev port +
    // API proxy so the CORS whitelist (localhost:5173) stays valid under PM2.
    preview: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'dist',
      // Off by default: published .map files hand the full original source
      // to anyone who opens the site. Set BUILD_SOURCEMAP=true for a local
      // debugging build only — never for the build that gets deployed.
      sourcemap: env.BUILD_SOURCEMAP === 'true',
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      globals: true,
      css: false,
      // Vitest owns src/**; Playwright owns e2e/**. Exclude e2e explicitly
      // so vitest does not try to run *.spec.ts files that import
      // @playwright/test.
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      exclude: ['node_modules/**', 'dist/**', 'e2e/**'],
      env: {
        // Absolute URL — Node's fetch (used by vitest+jsdom) rejects relative URLs.
        VITE_API_BASE_URL: 'http://localhost:5173/api',
      },
    },
  };
});
