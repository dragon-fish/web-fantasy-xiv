<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { provideEngine } from '@/composables/use-engine'

const canvas = useTemplateRef<HTMLCanvasElement>('canvas')
provideEngine(canvas)
</script>

<template lang="pug">
canvas#game-canvas(ref="canvas")
#ui-overlay
  RouterView
</template>

<style lang="scss" scoped>
#ui-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  font-family: 'Segoe UI', sans-serif;
  color: #fff;

  :deep(> *) {
    pointer-events: auto;
  }
}
</style>
