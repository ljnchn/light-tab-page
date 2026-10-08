import { nextTick } from "vue"
import type { App, Plugin } from "vue"
import { createPinia } from "pinia"
import { createPersistedState } from "pinia-plugin-persistedstate"
import useSearchStore from "./search"
import useSettingStore from "./setting"
import useTopSiteStore from "./top-site"

const pinia = createPinia()
const externalHydrations = new Map<string, number>()
let hydrationVersion = 0
const persistedState = createPersistedState({
  key: storeKey => `${storeKey}-data`,
  storage: {
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => {
      // $reset/$hydrate notify subscribers synchronously; normalization can notify on nextTick.
      if (!externalHydrations.has(key) && localStorage.getItem(key) !== value) localStorage.setItem(key, value)
    }
  },
  auto: true
})

// 注册插件
pinia.use(persistedState)
pinia.use(({ store }) => {
  if (store.$id !== "setting" && store.$id !== "top-site") return

  const onStorage = (event: StorageEvent) => {
    const key = `${store.$id}-data`
    if (event.storageArea !== localStorage || (event.key !== key && event.key !== null)) return
    const version = ++hydrationVersion
    externalHydrations.set(key, version)
    try {
      // Reset first so deletions and omitted properties (e.g. lastUpdateTime) are reflected.
      store.$reset()
      store.$hydrate()
      if (store.$id === "top-site") useTopSiteStore(pinia).normalize()
    } finally {
      void nextTick().then(() => {
        if (externalHydrations.get(key) === version) externalHydrations.delete(key)
      })
    }
  }
  window.addEventListener("storage", onStorage)
  const dispose = store.$dispose.bind(store)
  store.$dispose = () => {
    window.removeEventListener("storage", onStorage)
    dispose()
  }
})

const definePlugin: Plugin = {
  install(app: App) {
    app.use(pinia)
    window.addEventListener("storage", event => {
      if (event.storageArea !== localStorage) return
      if (event.key === "search-history" || event.key === null) useSearchStore(pinia).loadHistory()
      if (event.key === "search-engines" || event.key === null) useSearchStore(pinia).loadSearchEngines()
    })
  }
}

export default definePlugin
export { useSettingStore, useSearchStore, useTopSiteStore }
