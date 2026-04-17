<script setup lang="ts">
defineProps<{ to: string }>()
</script>

<template lang="pug">
RouterLink.back-button(:to="to")
  | {{ '<' }} 返回
</template>

<style lang="scss" scoped>
.back-button {
  font-size: 12px;
  color: #777;
  text-decoration: none;
  cursor: pointer;
  margin-bottom: 16px;
  transition: color 0.15s;

  &:hover {
    color: #ddd;
  }
}
</style>
