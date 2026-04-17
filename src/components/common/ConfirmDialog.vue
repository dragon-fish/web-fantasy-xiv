<!-- src/components/common/ConfirmDialog.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

interface Props {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  /** danger style uses red confirm button */
  variant?: 'normal' | 'danger'
}

const props = withDefaults(defineProps<Props>(), {
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  variant: 'normal',
})

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('cancel')
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => document.removeEventListener('keydown', handleKeydown))
</script>

<template lang="pug">
.confirm-overlay(@click.self="emit('cancel')")
  .confirm-card
    .confirm-title {{ title }}
    .confirm-message(v-if="message") {{ message }}
    .confirm-actions
      button.confirm-btn.cancel(type="button" @click="emit('cancel')") {{ cancelText }}
      button.confirm-btn(type="button" :class="{ danger: variant === 'danger' }" @click="emit('confirm')") {{ confirmText }}
</template>

<style lang="scss" scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(2px);
}
.confirm-card {
  min-width: 280px;
  max-width: 400px;
  padding: 20px 24px;
  background: rgba(20, 20, 20, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  color: #ddd;
}
.confirm-title {
  font-size: 15px;
  font-weight: bold;
  margin-bottom: 8px;
}
.confirm-message {
  font-size: 12px;
  color: #aaa;
  margin-bottom: 16px;
}
.confirm-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.confirm-btn {
  padding: 6px 14px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 3px;
  color: #ccc;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #fff;
  }

  &.cancel {
    background: rgba(255, 255, 255, 0.02);
  }

  &.danger {
    background: rgba(200, 80, 80, 0.25);
    border-color: rgba(200, 80, 80, 0.5);
    color: #f0c0c0;

    &:hover {
      background: rgba(200, 80, 80, 0.4);
      color: #fff;
    }
  }
}
</style>
