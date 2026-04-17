import { defineConfig } from 'unocss'
import presetWind4 from '@unocss/preset-wind4'
import presetAttributify from '@unocss/preset-attributify'

export default defineConfig({
  presets: [presetWind4(), presetAttributify()],
})
