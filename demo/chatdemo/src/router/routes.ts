import { RouteRecordRaw } from 'vue-router';
import Chat from '../view/Chat.vue'
const login = () => import('../view/Login.vue')
const routes:Array<RouteRecordRaw> = [
    {
        path: '/',
        component: login,
    },
    {
        path: '/chat',
        component: Chat,
    },
]
export default routes;

