import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import Vue from '@vitejs/plugin-vue'
import VueJsx from '@vitejs/plugin-vue-jsx'
import VueRouter from 'vue-router/vite'
import Components from 'unplugin-vue-components/vite'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  server: {
    forwardConsole: {
      logLevels: ['error', 'warn', 'info'],
    },
  },
  plugins: [
    VueRouter({
      routesFolder: 'src/pages',
      dts: 'src/typed-router.d.ts',
    }),
    Vue({
      template: { preprocessOptions: { pug: {} } },
    }),
    VueJsx(),
    Components({
      dirs: ['src/components'],
      directoryAsNamespace: true,
      collapseSamePrefixes: true,
      dts: 'src/typed-components.d.ts',
    }),
    UnoCSS(),
  ],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
    },
  },
})
