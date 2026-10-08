import type { App, DirectiveBinding, Plugin } from "vue"
import type { Permissions } from "webextension-polyfill"
import type * as BrowserAPI from "webextension-polyfill"
import { isEmpty } from "@/utils/common"

// Only read native APIs here: loading the polyfill throws in the Vite web preview.
const browser = (globalThis as unknown as { browser?: typeof BrowserAPI }).browser
const chromeApi = typeof chrome === "undefined" ? undefined : chrome
const runtime = browser?.runtime ?? chromeApi?.runtime
export const isExtension = Boolean(runtime?.id)

function chromeResult<T>(action: (done: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    action(result => {
      const error = chromeApi?.runtime.lastError
      if (error) reject(new Error(error.message))
      else resolve(result)
    })
  })
}

export const Permis: Record<string, Permissions.Permissions> = {
  bing: { origins: ["https://cn.bing.com/"] },
  suggestion: {
    origins: [
      "https://suggestion.baidu.com/",
      "https://api.bing.com/",
      "https://suggestqueries.google.com/"
    ]
  },
  topSite: { permissions: ["topSites"] }
}

export function requestPermissions(permis: Permissions.Permissions): Promise<boolean> {
  if (!isExtension) return Promise.resolve(false)
  // Request immediately inside the click handler so Firefox retains user activation.
  if (browser) return browser.permissions.request(permis)
  return chromeResult(done => chromeApi!.permissions.request(permis, done))
}

export function hasPermissions(permis: Permissions.Permissions): Promise<boolean> {
  if (!isExtension) return Promise.resolve(false)
  if (browser) return browser.permissions.contains(permis)
  return chromeResult(done => chromeApi!.permissions.contains(permis, done))
}

const vuePlugin: Plugin = {
  install(app: App) {
    app.directive("permis", {
      created(el: HTMLElement, bind: DirectiveBinding<Permissions.Permissions>) {
        if (!isExtension) return
        if (isEmpty(bind.value)) return
        let replay = false
        let requesting = false
        const onRequestPermissions = (e: Event) => {
          if (replay) return
          e.preventDefault()
          e.stopImmediatePropagation()
          if (requesting) return
          requesting = true

          // 请求权限，如果成功则重新请求事件
          requestPermissions(bind.value)
            .then(isOk => {
              if (isOk) {
                replay = true
                el.click()
                replay = false
              }
            })
            .catch(error => console.warn("Permission request failed:", error))
            .finally(() => { requesting = false })
        }

        el.addEventListener("click", onRequestPermissions, true)
      }
    })
  }
}

export function getBrowserTopSites(): Promise<BrowserAPI.TopSites.MostVisitedURL[]> {
  if (!isExtension) return Promise.resolve([])
  if (browser) return browser.topSites.get()
  return chromeResult(done => chromeApi!.topSites.get(done))
}

export async function getActiveTab() {
  if (!isExtension) return undefined
  const query = { active: true, currentWindow: true }
  const tabs = browser
    ? await browser.tabs.query(query)
    : await chromeResult<chrome.tabs.Tab[]>(done => chromeApi!.tabs.query(query, done))
  return tabs[0]
}

export function getFavicon(url: string) {
  const urlObj = new URL(url)
  if (!["http:", "https:"].includes(urlObj.protocol)) return ""
  // Chromium's favicon endpoint is not available in Firefox.
  if (isExtension && runtime!.getURL("/").startsWith("chrome-extension://")) {
    const faviconUrl = new URL(runtime!.getURL("/_favicon/"))
    faviconUrl.searchParams.set("pageUrl", url)
    faviconUrl.searchParams.set("size", "128")
    return faviconUrl.toString()
  } else {
    return `${urlObj.origin}/favicon.ico`
  }
}

export default vuePlugin
