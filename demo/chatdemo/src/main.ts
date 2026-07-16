import { createApp } from 'vue'
import './style.css'
import 'highlight.js/styles/github-dark.css'
import App from './App.vue'

import router from './router/index'
import { initDataSource } from './services/datasource'
import APIClient from './services/APIClient'
import { authStore } from './services/authStore'

import {orderMessage,CustomMessage}  from "./customessage"
import WKSDK from 'wukongimjssdk'

// Wire up APIClient auth callbacks
APIClient.shared.config.tokenCallback = () => authStore.jwt
APIClient.shared.logoutCallback = () => {
  authStore.logout()
  window.location.hash = '#/'
}

// 注册自定义消息
WKSDK.shared().register(orderMessage,()=>new CustomMessage());

const appVue = createApp(App)
appVue.use(router)
appVue.mount('#app')

initDataSource()


