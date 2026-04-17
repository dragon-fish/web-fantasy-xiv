<script setup lang="ts"></script>

<template lang="pug">
.menu-shell
  .menu-title-block
    .menu-crystal-bg
      .menu-crystal
    h1.menu-title Web Fantasy XIV
    p.menu-subtitle 最终页游14
  slot
</template>

<style lang="scss" scoped>
.menu-shell {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 100;
  background: #000;
  pointer-events: auto;
}
.menu-title-block {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 40px;
}
.menu-crystal-bg {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 120px;
  height: 180px;
  opacity: 0.3;
  filter: blur(1px);
  pointer-events: none;
}
.menu-crystal {
  width: 100%;
  height: 100%;
  clip-path: polygon(50% 0%, 85% 35%, 50% 100%, 15% 35%);
  background: linear-gradient(160deg, #a8d8ff 0%, #4a7fff 40%, #2244aa 70%, #1a1a5e 100%);
}
.menu-title {
  position: relative;
  font-family: 'Cormorant Garamond', 'Playfair Display', 'Georgia', serif;
  font-size: 42px;
  font-weight: 400;
  letter-spacing: -1px;
  text-transform: uppercase;
  color: #d0dce8;
  text-shadow: 0 0 20px rgba(120, 160, 255, 0.4), 0 0 40px rgba(80, 120, 220, 0.2), 0 0 2px rgba(200, 220, 255, 0.5);
  margin: 0;
}
.menu-subtitle {
  position: relative;
  font-family: 'Cormorant Garamond', 'Georgia', serif;
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 6px;
  text-transform: uppercase;
  color: rgba(140, 160, 190, 0.6);
  margin-top: 2px;
}
</style>
