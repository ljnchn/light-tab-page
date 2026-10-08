// Run with: node script/check-backup-webdav.cjs (uses the project's existing TypeScript).
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
const root = path.resolve(__dirname, "..")
const cache = new Map()
const images = {
  data: new Map(),
  async keys() { return [...this.data.keys()] },
  async getItem(id) { return this.data.get(id) ?? null },
  async setItem(id, value) { this.data.set(id, value); return value },
  async removeItem(id) { this.data.delete(id) }
}

function load(file) {
  file = path.resolve(root, file)
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }
  cache.set(file, module)
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText
  new Function("require", "module", "exports", code)(id => {
    if (id === "@/plugins/localforage") return { wallpaperStore: images }
    // The browser decoder is an async boundary; exercise its rejection before any writes.
    if (id === "./img" && file.endsWith("backup.ts")) return {
      verifyImageUrl: async url => Buffer.from(url.split(",")[1], "base64").subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
    }
    if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`)
    if (id.startsWith(".")) return load(path.resolve(path.dirname(file), `${id}.ts`))
    return require(id)
  }, module, module.exports)
  return module.exports
}

const backup = load("src/utils/backup.ts")
const dav = load("src/utils/webdav.ts")
function storage(entries = {}) {
  const data = new Map(Object.entries(entries))
  return {
    data,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: key => { data.delete(key) }
  }
}

async function check() {
  const blank = storage({ "webdav-config": '{"password":"local-only-secret"}', unrelated: "keep" })
  const exported = await backup.createBackup(blank)
  assert(!exported.includes("local-only-secret"))
  const clean = backup.parseBackup(exported)
  assert.deepEqual(Object.keys(clean).sort(), [...backup.BACKUP_KEYS, "wallpapers"].sort())
  assert.equal(JSON.parse(exported).version, 2)
  const settings = JSON.parse(clean["setting-data"])
  settings.webdav = { password: "must-not-leak" }
  settings.theme.password = "must-not-leak"
  settings.background = { ...settings.background, type: 1, id: "local-blob", url: "blob:local" }
  blank.setItem("setting-data", JSON.stringify(settings))
  await assert.rejects(backup.createBackup(blank), error => error.code === "wallpaperMissing")
  const png = new Blob([Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl8sAAAAASUVORK5CYII=", "base64")], { type: "image/png" })
  images.data.set("local-blob", png)
  const withWallpaper = await backup.createBackup(blank)
  assert(!withWallpaper.includes("must-not-leak"))
  const wallpaperBackup = backup.parseBackup(withWallpaper)
  assert.equal(JSON.parse(wallpaperBackup["setting-data"]).background.url, null)
  assert.equal(JSON.parse(wallpaperBackup["setting-data"]).background.id, "local-blob")
  assert(wallpaperBackup.wallpapers["local-blob"].startsWith("data:image/png;base64,"))

  // An inactive uploaded wallpaper must survive export as well.
  for (const type of [0, 2]) {
    settings.background.type = type
    settings.background.url = type === 2 ? "https://example.com/bing.jpg" : "blob:local"
    blank.setItem("setting-data", JSON.stringify(settings))
    assert.equal(backup.parseBackup(await backup.createBackup(blank)).wallpapers["local-blob"], wallpaperBackup.wallpapers["local-blob"])
  }

  const folder = { id: "folder", title: "Work", url: "", kind: "folder", custom: true, textIcon: true }
  const site = { title: "Example", url: "https://example.com/", custom: true, textIcon: true, folderId: "folder" }
  const legacy = JSON.stringify({ _MARK_: "light-tab-page", "top-site-data": JSON.stringify({ topSites: [folder, site] }), "webdav-config": "malicious", unrelated: "malicious" })
  const migrated = backup.parseBackup(legacy)
  assert.equal(JSON.parse(migrated["top-site-data"]).topSites[1].folderId, "folder")
  assert(JSON.parse(migrated["top-site-data"]).topSites[1].id)
  const previousSettings = blank.getItem("setting-data")
  await backup.restoreBackup(migrated, blank)
  assert.equal(blank.getItem("unrelated"), "keep")
  assert.equal(blank.getItem("webdav-config"), '{"password":"local-only-secret"}')
  assert.equal(blank.getItem("setting-data"), previousSettings, "legacy partial imports preserve sections they do not contain")
  assert(JSON.parse(blank.getItem("top-site-data")).lastUpdateTime > 0, "import must not trigger first-run replacement of browser links")

  for (const value of [
    { topSites: [{ ...site, url: "javascript:alert(1)" }] },
    { topSites: [{ ...site, folderId: "missing" }] },
    { topSites: [folder, { ...folder }] },
    { topSites: [{ ...folder, folderId: "folder" }] },
    { topSites: [{ ...site, title: " " }] }
  ]) {
    assert.throws(() => backup.parseBackup(JSON.stringify({ _MARK_: "light-tab-page", "top-site-data": JSON.stringify(value) })), error => error.code === "invalid")
  }
  assert.throws(() => backup.parseBackup('{"_MARK_":"another-app"}'))
  await assert.rejects(backup.restoreBackup({ "setting-data": "{}", "search-history": "broken" }, blank))
  assert.equal(blank.getItem("setting-data"), previousSettings, "validation must finish before writing")
  const before = new Map(blank.data)
  const imagesBefore = new Map(images.data)
  let fail = true
  const originalSet = blank.setItem
  blank.setItem = (key, value) => {
    if (key === "search-engines" && fail) { fail = false; throw new Error("quota") }
    originalSet(key, value)
  }
  await assert.rejects(backup.restoreBackup(wallpaperBackup, blank), error => error.code === "writeFailed")
  assert.deepEqual(blank.data, before, "failed restore rolls all application keys back")
  assert.deepEqual(images.data, imagesBefore, "failed settings commit keeps old wallpaper and removes staged images")
  blank.setItem = originalSet

  const writeImage = images.setItem
  images.setItem = async () => { throw new Error("IndexedDB quota") }
  await assert.rejects(backup.restoreBackup(wallpaperBackup, blank), error => error.code === "writeFailed")
  assert.deepEqual(blank.data, before, "image failure must precede any settings writes")
  assert.deepEqual(images.data, imagesBefore, "old images remain available on staging failure")
  images.setItem = writeImage

  for (const wallpaper of ["data:text/html;base64,SGk=", "data:image/png;base64,broken!", "data:image/png;base64,"]) {
    assert.throws(() => backup.parseBackup(JSON.stringify({ _MARK_: "light-tab-page", version: 2, data: { ...wallpaperBackup, wallpapers: { "local-blob": wallpaper } } })), error => error.code === "invalid")
  }
  assert.throws(() => backup.parseBackup(JSON.stringify({ _MARK_: "light-tab-page", version: 2, data: { "setting-data": "{}", wallpapers: {} } })), error => error.code === "invalid")
  await assert.rejects(backup.restoreBackup({ ...wallpaperBackup, wallpapers: { "local-blob": "data:image/png;base64,aGVsbG8=" } }, blank), error => error.code === "invalid")
  assert.deepEqual(blank.data, before, "undecodable images cannot commit settings")
  assert.deepEqual(images.data, imagesBefore, "undecodable images cannot replace the old wallpaper")

  // A full non-default snapshot round-trips all preferences, folders/order, icon modes,
  // custom search engines, history and wallpaper bytes into a separate device.
  const allSettings = JSON.parse(wallpaperBackup["setting-data"])
  Object.assign(allSettings, { lang: "en" })
  Object.assign(allSettings.theme, { mode: 2, primaryColor: "#112233", colorPalette: ["#123456"] })
  Object.assign(allSettings.topSite, { enable: true, col: 4, row: 3, gap: 24, iconSize: 38, boardSize: 70, boardRadius: 20, boardColor: "#cccccc", boardOpacity: 0.6 })
  Object.assign(allSettings.background, { blur: 12, maskOpacity: 0.4, maskColor: "#112233", autoOpacity: false })
  Object.assign(allSettings.search, { currentEngine: "custom", openPageTarget: "_self", showEngineIcon: false, showEngineSelect: false, searchInputRadius: 24, suggestion: 2, useSearchEngines: ["custom", "google"] })
  Object.assign(allSettings.layout, { align: 1, offsetY: -45 })
  allSettings.popup.current = 1
  const sites = [folder, { ...site, id: "auto", autoIcon: true, textIcon: false, icon: "chrome-extension://old/_favicon/?pageUrl=https://example.com/" }, { ...site, id: "custom", autoIcon: false, textIcon: false, icon: "https://example.com/custom.png" }, { ...site, id: "text", autoIcon: false }, { ...site, id: "custom-favicon", autoIcon: false, textIcon: false, icon: "https://example.com/favicon.ico" }]
  const engines = { custom: { id: "custom", name: "Docs", baseUrl: "https://example.com/search?q={searchText}", icon: "https://example.com/logo.png", description: "My docs" } }
  const history = [{ engineId: "custom", searchText: "all data", timestamp: 12345 }]
  const snapshot = { ...wallpaperBackup, "setting-data": JSON.stringify(allSettings), "top-site-data": JSON.stringify({ topSites: sites, lastUpdateTime: 1234 }), "search-engines": JSON.stringify(engines), "search-history": JSON.stringify(history) }
  const destination = storage()
  await backup.restoreBackup(snapshot, destination)
  const restoredSettings = JSON.parse(destination.getItem("setting-data"))
  assert.notEqual(restoredSettings.background.id, "local-blob", "restoration stages new image IDs")
  assert.equal(restoredSettings.background.url, null)
  const restoredImage = images.data.get(restoredSettings.background.id)
  assert.equal(restoredImage.type, png.type)
  assert.deepEqual(Buffer.from(await restoredImage.arrayBuffer()), Buffer.from(await png.arrayBuffer()))
  assert.deepEqual({ ...restoredSettings, background: { ...restoredSettings.background, id: "local-blob" } }, allSettings)
  assert.deepEqual(JSON.parse(destination.getItem("top-site-data")), { topSites: sites, lastUpdateTime: 1234 })
  assert.deepEqual(JSON.parse(destination.getItem("search-engines")), engines)
  assert.deepEqual(JSON.parse(destination.getItem("search-history")), history)
  const reexported = backup.parseBackup(await backup.createBackup(destination))
  assert.equal(Object.values(reexported.wallpapers)[0], wallpaperBackup.wallpapers["local-blob"])
  assert.equal(images.data.size, 1, "old images are removed only after a successful restore")

  const brokenRollback = storage(Object.fromEntries(destination.data))
  const commit = brokenRollback.setItem
  brokenRollback.setItem = (key, value) => {
    if (key === "search-engines") throw new Error("persistent quota")
    commit(key, value)
  }
  brokenRollback.removeItem = () => { throw new Error("storage inaccessible") }
  await assert.rejects(backup.restoreBackup(snapshot, brokenRollback), error => error.code === "rollbackFailed")
  const stillReferenced = JSON.parse(brokenRollback.getItem("setting-data")).background.id
  assert(images.data.has(stillReferenced), "failed rollback must not delete a staged image still referenced by settings")

  const config = { url: "https://dav.example.com:8443/backups/page.json", username: "用户名", password: "密碼" }
  assert.equal(Buffer.from(dav.basicAuthorization(config).slice(6), "base64").toString("utf8"), "用户名:密碼")
  assert.deepEqual(dav.webDavPermission(config), { origins: ["https://dav.example.com/*"] })
  for (const url of ["file:///secret", "https://user:pass@example.com/page.json", "https://dav.example.com/folder/", "https://dav.example.com/page.json#fragment"]) {
    assert.throws(() => dav.validateWebDavConfig({ ...config, url }), error => error.code === "url")
  }
  assert.throws(() => dav.validateWebDavConfig({ ...config, username: "a:b" }), error => error.code === "username")

  const originalFetch = global.fetch
  try {
    let captured
    global.fetch = async (_url, options) => { captured = options; return new Response(null, { status: 404 }) }
    const missing = await dav.readWebDav(config)
    assert.equal(missing.exists, false)
    global.fetch = async (_url, options) => { captured = options; return new Response(null, { status: 201 }) }
    await dav.writeWebDav(config, exported, missing)
    assert.equal(captured.headers["If-None-Match"], "*")
    assert.equal(captured.redirect, "error")
    assert.equal(captured.credentials, "omit")
    await dav.writeWebDav(config, exported, { exists: true, etag: '"revision-1"', text: exported })
    assert.equal(captured.headers["If-Match"], '"revision-1"')
    for (const etag of [null, 'W/"revision-1"', "invalid"]) {
      assert.throws(() => dav.writeWebDav(config, exported, { exists: true, etag, text: exported }), error => error.code === "noEtag")
    }
    global.fetch = async () => new Response(null, { status: 412 })
    await assert.rejects(dav.writeWebDav(config, exported, { exists: true, etag: '"revision-1"', text: exported }), error => error.code === "conflict")
    global.fetch = async () => new Response(exported, { headers: { ETag: '"revision-2"' } })
    const remote = await dav.readWebDav(config)
    assert.equal(remote.text, exported)
    assert.equal(remote.etag, '"revision-2"')
    global.fetch = async () => new Response("", { headers: { "Content-Length": backup.MAX_BACKUP_SIZE + 1 } })
    await assert.rejects(dav.readWebDav(config), error => error.code === "tooLarge")
    global.fetch = (_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted"))))
    await assert.rejects(dav.readWebDav(config, 5), error => error.code === "timeout")
  } finally { global.fetch = originalFetch }
  console.log("Backup/WebDAV regression checks passed")
}

check().catch(error => { console.error(error); process.exitCode = 1 })
