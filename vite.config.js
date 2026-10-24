import { defineConfig } from 'vite';

// base: './' makes every asset path relative, so the same build works on
// GitHub Pages (https://<user>.github.io/<repo>/) and on any other host.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
  },
  server: { host: true },
});
