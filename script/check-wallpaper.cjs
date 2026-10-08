// Run with: node script/check-wallpaper.cjs
const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const ts = require("typescript")
const { createPinia, setActivePinia } = require("pinia")

function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8")
    .replaceAll("import.meta.env", '({npm_package_name: "light-tab-page", npm_package_version: "test"})')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText
  const result = { exports: {} }
  new Function("require", "module", "exports", output)(
    name => dependencies[name] ?? require(name), result, result.exports
  )
  return result.exports
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const settingTypes = load("src/types/setting.ts")
const common = load("src/utils/common.ts")
const defaults = load("src/utils/setting-defaults.ts", {
  "@/types/setting": settingTypes, "@/types/search": load("src/types/search.ts")
})
const images = load("src/utils/img.ts", { "./common": common })
const blobs = new Map()
const events = []
const revoked = []
const created = []
let nextId = 0
let write = async (id, blob) => { blobs.set(id, blob); return blob }
let read = async id => blobs.get(id) ?? null
let remove = async id => { blobs.delete(id) }
let bing = async () => "https://example.com/bing.jpg"
let backup = async () => '{"backup":true}'
let restore = async () => {}
const downloads = []
const useStore = load("src/store/setting.ts", {
  "@/utils/common": { ...common, uuid: () => `new-${++nextId}` },
  "@/plugins/localforage": { wallpaperStore: {
    setItem(id, blob) { events.push(["set", id]); return write(id, blob) },
    getItem(id) { events.push(["get", id]); return read(id) },
    removeItem(id) { events.push(["remove", id]); return remove(id) },
    clear() { throw new Error("Wallpaper replacement must never clear the entire store") }
  } },
  "@/utils/img": images,
  "@/utils/use": { usePreferredDark: () => ({ value: false }) },
  "@/api/bing": { getDailyWallpaperUrl: () => bing() },
  "file-saver": { saveAs: (...args) => downloads.push(args) },
  "@/utils/palette": { fromUrl: async () => [] },
  "@/utils/backup": { createBackup: () => backup(), parseBackup: JSON.parse, restoreBackup: data => restore(data) },
  "@/utils/setting-defaults": defaults,
  "@/types/setting": settingTypes
}).default

async function check() {
  setActivePinia(createPinia())
  const store = useStore()
  const { BackgroundType } = settingTypes
  const oldImage = new Blob(["old image"], { type: "image/png" })
  const newImage = new Blob(["new image"], { type: "image/png" })
  blobs.set("old", oldImage)
  blobs.set("unrelated", oldImage)
  store.background = { ...store.background, type: BackgroundType.Local, id: "old", url: "blob:another-tab" }
  const original = JSON.stringify(store.background)
  const failedWrite = deferred()
  write = () => failedWrite.promise
  const upload = store.uploadBackgroundImage(newImage)
  assert.equal(JSON.stringify(store.background), original, "pending upload must leave existing settings intact")
  assert.ok(blobs.has("old"))
  assert.ok(!events.some(([type]) => type === "remove"))
  failedWrite.reject(new Error("quota exhausted"))
  await assert.rejects(upload, /quota exhausted/)
  assert.equal(JSON.stringify(store.background), original)
  assert.equal(blobs.get("old"), oldImage)
  assert.equal(revoked.includes("blob:another-tab"), false)
  assert.ok(revoked.includes(created.at(-1)), "failed upload must release its temporary URL")

  write = async (id, blob) => { blobs.set(id, blob); return blob }
  remove = async () => { throw new Error("cleanup unavailable") }
  await store.uploadBackgroundImage(newImage)
  const savedId = store.background.id
  const savedUrl = store.background.url
  assert.notEqual(savedId, "old")
  assert.equal(blobs.get(savedId), newImage)
  assert.ok(blobs.has("old"), "failed cleanup must not roll back the new wallpaper")
  assert.ok(!revoked.includes(savedUrl))
  assert.ok(!revoked.includes("blob:another-tab"))
  remove = async id => { blobs.delete(id) }
  const eventStart = events.length
  await store.uploadBackgroundImage(newImage)
  assert.deepEqual(events.slice(eventStart).map(([type]) => type), ["set", "remove"])
  assert.ok(!blobs.has(savedId))
  assert.ok(blobs.has("unrelated"), "replacement only removes the previous wallpaper key")
  assert.ok(revoked.includes(savedUrl), "a replaced page-owned URL is released")

  const pendingRead = deferred()
  read = () => pendingRead.promise
  const readStart = events.filter(([type]) => type === "get").length
  const firstReload = store.reloadBackgroundImage()
  const secondReload = store.reloadBackgroundImage()
  pendingRead.resolve(newImage)
  const [firstUrl, secondUrl] = await Promise.all([firstReload, secondReload])
  assert.equal(firstUrl, secondUrl, "concurrent reloads share a live URL")
  assert.equal(events.filter(([type]) => type === "get").length - readStart, 1)
  assert.ok(!revoked.includes(firstUrl))

  const staleRead = deferred()
  read = () => staleRead.promise
  const reload = store.reloadBackgroundImage()
  store.background.id = "newer-choice"
  store.background.url = "blob:newer-choice"
  staleRead.resolve(oldImage)
  assert.equal(await reload, undefined)
  assert.equal(store.background.url, "blob:newer-choice", "stale reads cannot overwrite a new wallpaper")
  read = async () => null
  assert.equal(await store.reloadBackgroundImage(), null)
  assert.equal(store.background.id, "newer-choice", "missing wallpaper IDs remain available for export validation")
  store.background.type = BackgroundType.None
  assert.equal(await store.reloadBackgroundImage(), undefined)
  assert.equal(store.background.id, "newer-choice")
  store.background.url = "https://example.com/retained.jpg"
  await store.uploadBackgroundImage(newImage)
  assert.equal(store.background.type, BackgroundType.None)
  assert.equal(store.background.url, "https://example.com/retained.jpg")
  assert.equal(blobs.get(store.background.id), newImage, "inactive wallpaper remains backed by its file")

  const pendingBing = deferred()
  bing = () => pendingBing.promise
  store.background.type = BackgroundType.Bing
  const bingLoad = store.loadBingDailyWallpaper()
  store.background.type = BackgroundType.Local
  store.background.url = "blob:local-choice"
  pendingBing.resolve("https://example.com/stale-bing.jpg")
  await bingLoad
  assert.equal(store.background.url, "blob:local-choice")
  assert.ok(revoked.every(url => url.startsWith("blob:owned-")), "foreign object URLs must never be revoked")
  await assert.rejects(store.uploadBackgroundImage(new Blob(["bad"], { type: "text/plain" })), /invalidImage/)

  const pendingBackup = deferred()
  backup = () => pendingBackup.promise
  const exporting = store.exportSetting()
  assert.equal(downloads.length, 0, "export waits for IndexedDB backup creation")
  pendingBackup.resolve('{"backup":true}')
  await exporting
  assert.equal(await downloads[0][0].text(), '{"backup":true}')
  assert.equal(downloads[0][1], "light-tab-page_test.json")
  backup = async () => { throw new Error("wallpaperMissing") }
  await assert.rejects(store.exportSetting(), /wallpaperMissing/)
  assert.equal(downloads.length, 1)
  const pendingRestore = deferred()
  restore = data => { assert.deepEqual(data, { backup: true }); return pendingRestore.promise }
  let imported = false
  const importing = store.importSetting(new Blob(['{"backup":true}'])).then(() => { imported = true })
  await Promise.resolve()
  assert.equal(imported, false)
  pendingRestore.resolve()
  await importing
  assert.equal(imported, true)
  restore = async () => { throw new Error("write failed") }
  await assert.rejects(store.importSetting(new Blob(['{"backup":true}'])), /write failed/)
  console.log("Atomic wallpaper upload, URL ownership, concurrent/stale reloads, inactive files, and async backup caller checks passed.")
}

const nativeCreate = URL.createObjectURL
const nativeRevoke = URL.revokeObjectURL
URL.createObjectURL = () => { const url = `blob:owned-${created.length + 1}`; created.push(url); return url }
URL.revokeObjectURL = url => { revoked.push(url) }
check().catch(error => { console.error(error); process.exitCode = 1 }).finally(() => {
  URL.createObjectURL = nativeCreate
  URL.revokeObjectURL = nativeRevoke
})
