<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useLocalStorage } from '@vueuse/core'
import { useJobStore } from '@/stores/job'

const router = useRouter()
const jobStore = useJobStore()
const tutorialSeen = useLocalStorage('xiv-tutorial-seen', '')

onMounted(() => {
  if (!tutorialSeen.value) {
    router.replace('/encounter/tutorial')
  }
})
</script>

<template lang="pug">
MenuShell
  RouterLink.menu-btn.primary(to="/encounters") ▶ &nbsp;开始关卡
  RouterLink.menu-btn.primary(to="/tower") ◈ &nbsp;爬塔模式
  RouterLink.menu-btn.secondary(to="/job")
    | ⚔ &nbsp;查看职业
    span.job-name {{ jobStore.job.name }}
  RouterLink.menu-btn.tertiary(to="/about") ◆ &nbsp;帮助 & 关于
</template>

<style lang="scss" scoped>
.menu-btn {
  display: block;
  min-width: 240px;
  padding: 12px 32px;
  margin: 4px 0;
  font-size: 14px;
  color: #aaa;
  letter-spacing: 0.05em;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  transition: all 0.15s ease;
  text-decoration: none;
  cursor: pointer;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
  }

  &.primary { background: rgba(255, 255, 255, 0.10); }
  &.secondary { background: rgba(255, 255, 255, 0.08); }
  &.tertiary { background: rgba(255, 255, 255, 0.04); }
}
.job-name {
  font-size: 11px;
  color: #888;
  margin-left: 8px;
}
</style>
