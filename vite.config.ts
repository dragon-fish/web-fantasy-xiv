import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import preact from '@preact/preset-vite'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  // base: './',
  server: {
    forwardConsole: {
      logLevels: ['error', 'warn', 'info'],
    },
  },
  plugins: [preact(), UnoCSS()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
