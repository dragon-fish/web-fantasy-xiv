import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from 'vue-router/auto-routes'
import 'virtual:uno.css'
import './styles/global.scss'
import App from './App.vue'

const router = createRouter({
  history: createWebHistory(),
  routes,
})

createApp(App).use(createPinia()).use(router).mount('#app')

const loading = document.getElementById('loading-screen')
if (loading) {
  loading.classList.add('fade-out')
  loading.addEventListener('transitionend', () => loading.remove())
}
