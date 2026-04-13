import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true }
    },
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/map',
      name: 'map',
      component: () => import('@/views/MapPortal.vue')
    },
    {
      path: '/cesium',
      name: 'cesium',
      component: () => import('@/views/cesium/CesiumLayout.vue'),
      redirect: '/cesium/draw',
      children: [
        {
          path: 'draw',
          name: 'cesium-draw',
          component: () => import('@/views/cesium/CesiumDraw.vue')
        },
        {
          path: 'models',
          name: 'cesium-models',
          component: () => import('@/views/cesium/CesiumModels.vue')
        }
      ]
    },
    {
      path: '/openlayers',
      name: 'openlayers',
      component: () => import('@/views/openlayers/OLLayout.vue'),
      redirect: '/openlayers/map',
      children: [
        {
          path: 'map',
          name: 'ol-map',
          component: () => import('@/views/openlayers/OLBasicMap.vue')
        },
        {
          path: 'draw',
          name: 'ol-draw',
          component: () => import('@/views/openlayers/OLDraw.vue')
        }
      ]
    }
  ]
})

router.beforeEach((to) => {
  const user = sessionStorage.getItem('user')
  if (!to.meta.public && !user) {
    return { name: 'login' }
  }
})

export default router
