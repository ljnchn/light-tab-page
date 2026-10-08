// Run with: node script/check-top-sites.cjs
const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const ts = require("typescript")
const { createPinia, setActivePinia } = require("pinia")

function load(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8")
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText
  const result = { exports: {} }
  new Function("require", "module", "exports", output)(
    name => dependencies[name] ?? require(name), result, result.exports
  )
  return result.exports
}

const helper = load("src/utils/top-site.ts")
const link = (title, url, fields = {}) => ({ title, url, textIcon: true, custom: true, ...fields })
const legacy = [
  link("One", "example.com"),
  { id: "folder", kind: "folder", title: "Folder", url: "", textIcon: true, custom: true },
  link("Child", "https://child.example", { folderId: "folder", custom: false }),
  link("Orphan", "https://orphan.example", { folderId: "missing" })
]
const normalized = helper.normalizeTopSites(legacy)
assert.deepEqual(helper.normalizeTopSites(legacy), normalized, "legacy migration must agree across tabs")
assert.deepEqual(helper.normalizeTopSites(normalized), normalized, "migration must be idempotent")
assert.equal(normalized[2].folderId, "folder")
assert.equal(normalized[2].custom, true)
assert.equal(normalized[3].folderId, undefined)
assert.equal(new Set(helper.normalizeTopSites([
  link("a", "https://a.example", { id: "same" }), link("b", "https://b.example", { id: "same" })
]).map(item => item.id)).size, 2)
assert.throws(() => helper.normalizeSiteUrl("javascript:alert(1)"))
assert.throws(() => helper.normalizeSiteUrl("https://user:pass@example.com"))
for (const [input, expected] of [
  ["localhost:5173", "https://localhost:5173/"],
  ["example.com:8080/path", "https://example.com:8080/path"],
  ["127.0.0.1:3000", "https://127.0.0.1:3000/"],
  ["[::1]:8000", "https://[::1]:8000/"]
]) assert.equal(helper.normalizeSiteUrl(input), expected)
for (const input of ["javascript:123", "data:text/html,x", "file:///x", "https:example.com"]) {
  assert.throws(() => helper.normalizeSiteUrl(input))
}
assert.equal(helper.normalizeTopSites([link("Local service", "localhost:5173")]).length, 1,
  "migration must retain scheme-less URLs with a port")

const iconCases = [
  link("Old Chrome", "https://chrome.example/", { id: "chrome", textIcon: false, icon: "chrome-extension://old-id/_favicon/?pageUrl=https%3A%2F%2Fchrome.example" }),
  link("Old Firefox", "https://firefox.example/", { id: "firefox", textIcon: false, icon: "moz-extension://old-id/_favicon/?pageUrl=https%3A%2F%2Ffirefox.example" }),
  link("Browser favicon", "https://browser.example/", { id: "browser", textIcon: false, icon: "chrome://favicon/https://browser.example/" }),
  link("Old website favicon", "https://site.example/page", { id: "website", textIcon: false, icon: "https://site.example/favicon.ico" }),
  link("Missing image", "https://missing.example/", { id: "missing-icon", textIcon: false }),
  link("Old transient failure", "https://failed.example/", { id: "failed-icon", custom: false }),
  link("Custom image", "https://custom.example/", { id: "custom", textIcon: false, icon: "https://cdn.example/image.png" }),
  link("Embedded custom image", "https://embedded.example/", { id: "embedded", textIcon: false, icon: "data:image/png;base64,aWNvbg==" }),
  link("Explicit favicon image", "https://fixed.example/", { id: "fixed", textIcon: false, autoIcon: false, icon: "https://fixed.example/favicon.ico" }),
  link("Custom text", "https://text.example/", { id: "text", icon: "chrome-extension://old-id/_favicon/" }),
  link("Explicit browser text", "https://browser-text.example/", { id: "browser-text", autoIcon: false, custom: false }),
  link("New auto mode", "https://automatic.example/", { id: "automatic", autoIcon: true, icon: "https://previous.example/icon.png" })
]
const iconModes = helper.normalizeTopSites(iconCases)
for (const id of ["chrome", "firefox", "browser", "website", "missing-icon", "failed-icon", "automatic"]) {
  const item = iconModes.find(item => item.id === id)
  assert.equal(item.autoIcon, true, `${id} must migrate to automatic image mode`)
  assert.equal(item.textIcon, false, `${id} must retry instead of persisting a text fallback`)
}
for (const id of ["custom", "embedded", "fixed", "text", "browser-text"]) {
  assert.equal(iconModes.find(item => item.id === id).autoIcon, false, `${id} must retain the user's mode`)
}
assert.deepEqual(helper.normalizeTopSites(iconModes), iconModes, "icon mode migration must be idempotent")

let finishBrowserRequest
const extension = {
  isExtension: true, Permis: { topSite: {} }, hasPermissions: async () => true,
  getBrowserTopSites: () => new Promise(resolve => { finishBrowserRequest = resolve }),
  getFavicon: url => url + "/icon"
}
const useStore = load("src/store/top-site.ts", {
  "./setting": { default: () => ({ topSite: { row: 2, col: 3 } }) },
  "@/plugins/extension": extension,
  "@/utils/img": { verifyImageUrl: async () => true },
  "@/utils/top-site": helper
}).default

async function check() {
  setActivePinia(createPinia())
  const store = useStore()
  store.topSites = normalized
  const before = JSON.stringify(store.topSites)
  store.sortTopSites({ from: -1, to: 0 })
  store.sortTopSites({ from: 0, to: 999 })
  store.deleteTopSite(-1)
  assert.equal(JSON.stringify(store.topSites), before, "invalid drag/delete must not affect data")
  store.sortTopSites({ from: 0, to: 2 })
  assert.equal(JSON.stringify(store.topSites), before, "cross-folder drops must not reorder links")
  const folder = store.addFolder("  Work  ")
  const added = store.addTopSite(link("New", "new.example", { folderId: folder }))
  assert.equal(added.folderId, folder)
  store.updateTopSite({ ...added, title: "Renamed", index: 0 })
  assert.equal(store.topSites.find(item => item.id === added.id).title, "Renamed", "stable ID wins over stale index")
  store.moveToFolder(added.id)
  assert.equal(store.topSites.find(item => item.id === added.id).folderId, undefined)
  assert.throws(() => store.moveToFolder(added.id, "missing"))
  store.moveToFolder(added.id, folder)
  store.deleteTopSite(store.topSites.findIndex(item => item.id === folder))
  assert.equal(store.topSites.find(item => item.id === added.id).folderId, undefined, "deleting a folder retains its links")
  const sync = store.syncBrowserTopSites()
  await Promise.resolve()
  const during = store.addTopSite(link("During request", "https://during.example"))
  store.moveToFolder(added.id, "folder")
  finishBrowserRequest([
    { title: "Remote duplicate", url: "https://during.example/" },
    { title: "Browser", url: "https://browser.example" },
    { title: "Browser icon", url: "https://browser-icon.example", favicon: "https://cdn.example/browser-icon.png" }
  ])
  await sync
  assert.equal(store.topSites.filter(item => item.url === during.url).length, 1)
  assert.ok(store.topSites.some(item => item.id === during.id), "sync retains links added during the request")
  assert.equal(store.topSites.find(item => item.id === added.id).folderId, "folder")
  assert.ok(store.topSites.some(item => item.url === "https://browser.example/"))
  const synced = store.topSites.find(item => item.url === "https://browser.example/")
  assert.equal(synced.autoIcon, true)
  assert.equal(synced.textIcon, false, "browser sync must leave transient image fallback to the renderer")
  const nativeIcon = store.topSites.find(item => item.url === "https://browser-icon.example/")
  assert.equal(nativeIcon.icon, "https://cdn.example/browser-icon.png", "portable browser-provided images should not be replaced")
  assert.ok(store.topSites.some(item => item.kind === "folder"))
  checkIcons()
  checkDrops()
  console.log("Top-site migration, icon portability, custom icon preservation, URL validation, folder CRUD, stable edits, committed drops, drag guards, and async sync checks passed.")
}

function checkIcons() {
  setActivePinia(createPinia())
  const store = useStore()
  const originalFavicon = extension.getFavicon
  extension.isExtension = false
  extension.getFavicon = url => `${new URL(url).origin}/favicon.ico`
  store.topSites = iconCases
  store.refreshIconUrls()
  const byId = id => store.topSites.find(item => item.id === id)
  for (const id of ["chrome", "firefox", "browser", "website", "missing-icon", "failed-icon", "automatic"]) {
    assert.equal(byId(id).icon, `${new URL(byId(id).url).origin}/favicon.ico`, "web preview must refresh imported automatic icons too")
  }
  for (const id of ["custom", "embedded", "fixed", "text", "browser-text"]) {
    const original = iconCases.find(item => item.id === id)
    assert.equal(byId(id).icon, original.icon, "normalization must not replace a custom image")
    assert.equal(byId(id).textIcon, original.textIcon, "normalization must retain explicit text mode")
  }
  const prepared = store.topSites
  store.normalize()
  assert.equal(store.topSites, prepared, "repeated refresh must not emit redundant storage updates")

  extension.isExtension = true
  extension.getFavicon = url => `chrome-extension://current-id/_favicon/?pageUrl=${encodeURIComponent(url)}&size=128`
  // Cross-page hydration uses normalize directly, not the home component's mount hook.
  store.normalize()
  assert.equal(byId("chrome").icon, extension.getFavicon(byId("chrome").url))
  assert.equal(byId("firefox").icon, extension.getFavicon(byId("firefox").url))
  assert.equal(byId("fixed").icon, "https://fixed.example/favicon.ico")
  const auto = store.addTopSite(link("Auto", "https://added.example/", { autoIcon: true }))
  assert.equal(auto.icon, extension.getFavicon(auto.url))
  assert.equal(auto.textIcon, false)
  const custom = store.addTopSite(link("Manual", "https://added-custom.example/", { autoIcon: false, textIcon: false, icon: "https://cdn.example/custom.png" }))
  store.updateTopSite({ ...custom, index: 0, title: "Renamed manual" })
  assert.equal(byId(custom.id).autoIcon, false)
  assert.equal(byId(custom.id).icon, custom.icon)
  extension.getFavicon = originalFavicon
}

function checkDrops() {
  setActivePinia(createPinia())
  const store = useStore()
  const folder = id => ({ id, title: id, kind: "folder", url: "", textIcon: true, custom: true })
  store.topSites = [
    link("a", "https://a.example/", { id: "a", custom: false }),
    link("b", "https://b.example/", { id: "b", custom: false }),
    folder("f1"),
    link("x", "https://x.example/", { id: "x", folderId: "f1" }),
    link("c", "https://c.example/", { id: "c", custom: false }),
    folder("f2"),
    link("y", "https://y.example/", { id: "y", folderId: "f1" }),
    link("z", "https://z.example/", { id: "z", folderId: "f2" })
  ]
  const ids = folderId => store.topSites.filter(item => item.folderId === folderId).map(item => item.id)
  const item = id => store.topSites.find(item => item.id === id)
  let commits = 0
  const unsubscribe = store.$subscribe(() => commits++, { flush: "sync", detached: true })
  function noDrop(source, target, placement = "before") {
    const snapshot = JSON.stringify(store.topSites)
    const beforeCommits = commits
    assert.equal(store.dropTopSite(source, target, placement), false)
    assert.equal(JSON.stringify(store.topSites), snapshot, "cancelled or invalid drops preserve data")
    assert.equal(commits, beforeCommits, "no-op drops must not notify persistence")
  }
  function drop(source, target, placement) {
    const beforeCommits = commits
    assert.equal(store.dropTopSite(source, target, placement), true)
    assert.equal(commits - beforeCommits, 1, "a completed drop commits once")
  }

  noDrop("a", "a", "inside")
  noDrop("missing", "f1", "inside")
  noDrop("a", "missing", "inside")
  noDrop("f1", "f2", "inside")
  noDrop("a", "b", "inside")
  noDrop("x", "f1", "inside")
  noDrop("x", "z", "before")
  noDrop("x", "a", "after")
  noDrop("a", "b")
  noDrop("x", "y", "before") // Hidden root entries between siblings do not change their order.
  noDrop("y", "x", "after")
  const deletedTarget = store.addFolder("Will be deleted before drop")
  store.deleteTopSite(store.topSites.findIndex(item => item.id === deletedTarget))
  noDrop("a", deletedTarget, "inside")

  drop("a", "c", "after")
  assert.deepEqual(ids(), ["b", "f1", "c", "a", "f2"])
  assert.equal(item("a").custom, true)
  drop("f2", "b", "before")
  assert.deepEqual(ids(), ["f2", "b", "f1", "c", "a"])
  drop("a", "b", "before")
  assert.deepEqual(ids(), ["f2", "a", "b", "f1", "c"])
  drop("f2", "c", "after")
  assert.deepEqual(ids(), ["a", "b", "f1", "c", "f2"])
  drop("y", "x", "before")
  assert.deepEqual(ids("f1"), ["y", "x"])
  drop("a", "f1", "inside")
  assert.equal(item("a").folderId, "f1")
  assert.ok(!ids().includes("a"))
  drop("a", "f2", "inside")
  assert.equal(item("a").folderId, "f2", "links may move between folders")
  assert.equal(item("a").custom, true)
  noDrop("a", "f2", "inside")
  assert.equal(item("f1").folderId, undefined)
  assert.equal(item("f2").folderId, undefined)
  unsubscribe()
}

check().catch(error => { console.error(error); process.exitCode = 1 })
