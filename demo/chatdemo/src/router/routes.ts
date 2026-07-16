import { RouteRecordRaw } from 'vue-router';
import Chat from '../view/Chat.vue';
import { authStore } from '../services/authStore';

const login = () => import('../view/Login.vue');
const profile = () => import('../view/Profile.vue');
const admin = () => import('../view/Admin.vue');

const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    component: login,
  },
  {
    path: '/chat',
    component: Chat,
    beforeEnter: (_to, _from, next) => {
      if (!authStore.isAuthenticated) {
        next('/');
      } else {
        next();
      }
    },
  },
  {
    path: '/profile',
    component: profile,
    beforeEnter: (_to, _from, next) => {
      if (!authStore.isAuthenticated) {
        next('/');
      } else {
        next();
      }
    },
  },
  {
    path: '/admin',
    component: admin,
    beforeEnter: (_to, _from, next) => {
      if (!authStore.isAuthenticated) {
        next('/');
      } else if (!authStore.isAdmin) {
        next('/chat');
      } else {
        next();
      }
    },
  },
];
export default routes;
