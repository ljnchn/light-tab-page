// Run with: node script/check-wallpaper-view.cjs
const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const ts = require("typescript")
const vue = require("vue")
const state = vue.reactive({ background: { id: "first", type: 1, url: "blob:foreign" } })
let reads = 0
let bingLoads = 0
let delayed
const store = {
  async reloadBackgroundImage() {
    reads++
    if (delayed) return delayed
    const url = state.background.id ? `blob:owned-${reads}-${state.background.id}` : null
    state.background.url = url
    return url
  },
  async loadBingDailyWallpaper() { bingLoads++; state.background.url = "https://bing.example/wallpaper.jpg" }
}
const file = fs.readFileSync(path.join(__dirname, "../src/views/home/Wallpaper.vue"), "utf8")
const script = file.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]
const code = ts.transpileModule(`${script}\nexports.displayUrl = displayUrl`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText
const dependencies = {
  vue,
  "@/types/setting": { BackgroundType: { None: 0, Local: 1, Bing: 2 }, ThemeMode: { Dart: 2 } },
  "@/store": { useSettingStore: () => store },
  "@/utils/common": { isEmpty: value => !value },
  pinia: { storeToRefs: () => ({ background: vue.toRef(state, "background"), currentTheme: vue.ref(1) }) }
}
const result = { exports: {} }
const scope = vue.effectScope()
scope.run(() => new Function("require", "module", "exports", code)(id => dependencies[id] ?? require(id), result, result.exports))
const flush = async () => { await vue.nextTick(); await Promise.resolve(); await vue.nextTick() }

async function check() {
  await flush()
  const first = result.exports.displayUrl.value
  assert.equal(reads, 1)
  assert(first.startsWith("blob:owned-"))
  state.background.url = "blob:other-tab"
  await flush()
  assert.equal(reads, 1, "URL-only storage updates must not trigger reload loops")
  assert.equal(result.exports.displayUrl.value, first, "other tabs must not replace this page's object URL")
  state.background = { ...state.background, url: "blob:hydrated" }
  await flush()
  assert.equal(reads, 1, "store hydration with unchanged ID/type must not trigger a reload")
  state.background = { id: "", type: 0, url: "" }
  state.background = { id: "first", type: 1, url: "blob:hydrated-again" }
  await flush()
  assert.equal(reads, 1, "a synchronous reset/hydrate pair must compare only the final ID/type")
  state.background.id = "imported"
  await flush()
  assert.equal(reads, 2)
  assert(result.exports.displayUrl.value.endsWith("-imported"))
  state.background.type = 2
  await flush()
  assert.equal(bingLoads, 1)
  assert.equal(result.exports.displayUrl.value, "https://bing.example/wallpaper.jpg")
  state.background.id = "inactive-local-image"
  await flush()
  assert.equal(bingLoads, 1, "dormant local assets must not refetch Bing")
  state.background.type = 1
  await flush()
  assert.equal(reads, 3)
  assert(result.exports.displayUrl.value.endsWith("-inactive-local-image"))
  let resolveStale
  delayed = new Promise(resolve => { resolveStale = resolve })
  state.background.id = "slow"
  await flush()
  delayed = undefined
  state.background.id = "latest"
  await flush()
  const latest = result.exports.displayUrl.value
  resolveStale("blob:stale")
  await flush()
  assert.equal(result.exports.displayUrl.value, latest, "a stale asynchronous read must not overwrite a newer image")
  state.background.id = null
  await flush()
  assert.equal(result.exports.displayUrl.value, null)
  scope.stop()
  console.log("Wallpaper ID/type reload, cross-tab object URL isolation, and stale-read checks passed")
}

check().catch(error => { scope.stop(); console.error(error); process.exitCode = 1 })
