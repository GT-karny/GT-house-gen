import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: { port: 5180, open: true },
  // multi-page: the house prototype (index.html), the roadside-store prototype
  // (store.html), and the apartment prototype (apartment.html) are separate entries.
  build: {
    rollupOptions: {
      input: {
        main: resolve('index.html'),
        store: resolve('store.html'),
        apartment: resolve('apartment.html'),
      },
    },
  },
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
