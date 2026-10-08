// Exercise the real Pinia persistence plugin with a browser storage/event shim.
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
const { createApp, nextTick } = require("vue")
const { defineStore } = require("pinia")
const data = new Map()
const writes = []
global.localStorage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => { writes.push([key, value]); data.set(key, value) },
  removeItem: key => { writes.push([key, null]); data.delete(key) }
}
const listeners = new Set()
global.window = {
  addEventListener: (_event, handler) => { listeners.add(handler) },
  removeEventListener: (_event, handler) => { listeners.delete(handler) }
}
const useSettingStore = defineStore("setting", { state: () => ({ lang: "auto", topSite: { enable: false } }) })
const useTopSiteStore = defineStore("top-site", {
  state: () => ({ topSites: [], lastUpdateTime: undefined }),
  actions: {
    normalize() {
      if (this.topSites.some(item => !item.id)) this.topSites = this.topSites.map((item, i) => ({ ...item, id: item.id || `legacy-${i}` }))
    }
  }
})
let historyLoads = 0
let engineLoads = 0
const useSearchStore = () => ({ loadHistory: () => { historyLoads++ }, loadSearchEngines: () => { engineLoads++ } })
const file = path.resolve(__dirname, "../src/store/index.ts")
const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText
const loaded = { exports: {} }
new Function("require", "module", "exports", code)(id => {
  const store = { "./setting": useSettingStore, "./top-site": useTopSiteStore, "./search": useSearchStore }[id]
  return store ? { default: store } : require(id)
}, loaded, loaded.exports)
createApp({}).use(loaded.exports.default)
const settings = useSettingStore()
const sites = useTopSiteStore()

function storageEvent(key) {
  for (const handler of listeners) handler({ key, storageArea: localStorage })
}

async function check() {
  sites.$patch({ topSites: [{ id: "old", title: "Old" }], lastUpdateTime: 999 })
  settings.lang = "en"
  await nextTick()
  writes.length = 0
  const incoming = JSON.stringify({ topSites: [{ id: "new", title: "Imported" }] })
  data.set("top-site-data", incoming)
  storageEvent("top-site-data")
  assert.equal(sites.topSites[0].id, "new")
  assert.equal(sites.lastUpdateTime, undefined, "omitted timestamps must not survive hydration")
  await nextTick()
  assert.equal(data.get("top-site-data"), incoming, "reset must not overwrite the imported snapshot")
  assert.equal(writes.length, 0, "external hydration must not echo back")

  data.delete("top-site-data")
  storageEvent("top-site-data")
  await nextTick()
  assert.deepEqual(sites.topSites, [])
  assert(!data.has("top-site-data"), "a removed key must stay removed")
  data.delete("setting-data")
  storageEvent("setting-data")
  await nextTick()
  assert.equal(settings.lang, "auto")
  assert(!data.has("setting-data"))

  data.set("top-site-data", JSON.stringify({ topSites: [{ title: "Legacy" }] }))
  storageEvent("top-site-data")
  await nextTick()
  assert.equal(sites.topSites[0].id, "legacy-0")
  assert.equal(writes.length, 0, "normalization's queued subscriber must stay suppressed")
  // Successive events before a Vue flush must keep the suppression until the latest hydration.
  data.set("top-site-data", JSON.stringify({ topSites: [{ id: "next", title: "Next" }] }))
  storageEvent("top-site-data")
  storageEvent("top-site-data")
  await nextTick()
  assert.equal(writes.length, 0)

  sites.topSites.push({ id: "local", title: "Local edit" })
  await nextTick()
  assert.equal(JSON.parse(data.get("top-site-data")).topSites.length, 2, "ordinary edits persist after hydration")
  storageEvent("search-history")
  storageEvent("search-engines")
  assert.equal(historyLoads, 1)
  assert.equal(engineLoads, 1)
  data.clear()
  storageEvent(null)
  await nextTick()
  assert.deepEqual(sites.topSites, [])
  assert.equal(settings.lang, "auto")
  assert.equal(historyLoads, 2)
  assert.equal(engineLoads, 2)
  assert.equal(data.size, 0, "localStorage.clear must not repopulate stale state")
  console.log("Cross-tab persistence regression checks passed")
}

check().catch(error => { console.error(error); process.exitCode = 1 })
