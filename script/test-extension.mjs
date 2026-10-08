// Run with: node script/test-extension.mjs
import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import vm from "node:vm"

const require = createRequire(import.meta.url)
const { buildSync } = require(require.resolve("esbuild", { paths: [dirname(require.resolve("vite"))] }))
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const { outputFiles } = buildSync({
  absWorkingDir: root,
  entryPoints: ["src/plugins/extension.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  external: ["vue"]
})

function load(globals = {}) {
  const context = { module: { exports: {} }, require, URL, console, ...globals }
  vm.runInNewContext(outputFiles[0].text, context)
  return context.module.exports
}

const preview = load()
assert.equal(preview.isExtension, false)
assert.equal(await preview.getActiveTab(), undefined)
assert.equal((await preview.getBrowserTopSites()).length, 0)
assert.equal(await preview.requestPermissions({ permissions: ["topSites"] }), false)
assert.equal(await preview.hasPermissions({ permissions: ["topSites"] }), false)
assert.equal(preview.getFavicon("https://example.com/page"), "https://example.com/favicon.ico")
assert.equal(preview.getFavicon("javascript:alert(1)"), "")

let requested = false
let granted = true
const activeTab = { url: "https://example.com/page", title: "Example" }
const chrome = {
  runtime: { id: "test", getURL: path => `chrome-extension://test${path}` },
  permissions: {
    request: (_permissions, callback) => { requested = true; callback(granted) },
    contains: (_permissions, callback) => callback(granted)
  },
  tabs: { query: (query, callback) => {
    assert.equal(query.active, true)
    assert.equal(query.currentWindow, true)
    callback([activeTab])
  } },
  topSites: { get: callback => callback([activeTab]) }
}
const chromium = load({ chrome })
assert.equal(chromium.isExtension, true)
const permission = chromium.requestPermissions({ permissions: ["topSites"] })
assert.equal(requested, true, "permissions.request must run before the first await")
assert.equal(await permission, true)
assert.equal(await chromium.hasPermissions({ permissions: ["topSites"] }), true)
assert.equal(await chromium.getActiveTab(), activeTab)
assert.equal((await chromium.getBrowserTopSites())[0], activeTab)
const favicon = new URL(chromium.getFavicon(activeTab.url))
assert.equal(favicon.protocol, "chrome-extension:")
assert.equal(favicon.searchParams.get("pageUrl"), activeTab.url)
chrome.runtime.lastError = { message: "Tab is unavailable" }
await assert.rejects(chromium.getActiveTab(), /Tab is unavailable/)
delete chrome.runtime.lastError
granted = false
assert.equal(await chromium.requestPermissions({ permissions: ["topSites"] }), false)
assert.equal(await chromium.hasPermissions({ permissions: ["topSites"] }), false)

requested = false
const firefox = load({ browser: {
  runtime: { id: "test", getURL: path => `moz-extension://test${path}` },
  permissions: {
    request: () => { requested = true; return Promise.resolve(true) },
    contains: () => Promise.resolve(true)
  },
  tabs: { query: () => Promise.resolve([activeTab]) },
  topSites: { get: () => Promise.resolve([activeTab]) }
} })
const firefoxPermission = firefox.requestPermissions({ origins: ["https://example.com/*"] })
assert.equal(requested, true, "Firefox permission requests must retain the user gesture")
assert.equal(await firefoxPermission, true)
assert.equal(await firefox.hasPermissions({ permissions: ["topSites"] }), true)
assert.equal(await firefox.getActiveTab(), activeTab)
assert.equal((await firefox.getBrowserTopSites())[0], activeTab)
assert.equal(firefox.getFavicon(activeTab.url), "https://example.com/favicon.ico")

console.log("Extension checks passed: web preview, Chrome, Firefox, permissions, tabs, and favicons.")
