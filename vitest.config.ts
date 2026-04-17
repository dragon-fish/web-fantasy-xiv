import { defineConfig } from 'vitest/config'
import { resolve } from 'path'
import Vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    Vue({
      template: { preprocessOptions: { pug: {} } },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/tower/test-setup.ts'],
  },
})
