// Run with: node script/check-search.cjs
const fs = require("node:fs")
const path = require("node:path")
const assert = require("node:assert/strict")
const ts = require("typescript")
const { createPinia, setActivePinia } = require("pinia")
const { reactive } = require("vue")
const root = path.join(__dirname, "..")

function load(file, dependencies = {}) {
  // Vite expands this glob at build time; use the same JSON rules in Node.
  const source = fs.readFileSync(path.join(root, file), "utf8")
    .replace(/^const ruleModules = import\.meta\.glob.*$/m, 'const ruleModules = require("test:rules")')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText
  const result = { exports: {} }
  new Function("require", "module", "exports", output)(
    name => dependencies[name] ?? require(name), result, result.exports
  )
  return result.exports
}

const saved = new Map()
global.localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, String(value)),
  removeItem: key => saved.delete(key)
}
const opened = []
global.window = { open: (...args) => opened.push(args) }
const setting = reactive({ search: { currentEngine: "bing", useSearchEngines: ["bing"], openPageTarget: "_blank" } })
const common = load("src/utils/common.ts")
const analyze = load("src/types/analyze.ts", {
  "@/utils/common": common,
  "@/plugins/axios": { default: { get() { throw new Error("Unexpected network request") } } }
})
const rule = load("src/types/rule.ts", { "./analyze": analyze })
const ruleFixtures = Object.fromEntries(fs.readdirSync(path.join(root, "src/rules"))
  .filter(name => name.endsWith(".json"))
  .map(name => [name, JSON.parse(fs.readFileSync(path.join(root, "src/rules", name), "utf8"))]))
const searchModule = load("src/store/search.ts", {
  "@/utils/common": common,
  "@/types/search": load("src/types/search.ts"),
  "@/types/rule": rule,
  "@/types/analyze": analyze,
  "@/api/suggestion": {},
  "./setting": { default: () => setting },
  "test:rules": ruleFixtures
})
const freshStore = () => { setActivePinia(createPinia()); return searchModule.default() }
const history = (index, timestamp = index) => ({ engineId: "bing", searchText: `query-${index}`, timestamp })

async function check() {
  const store = freshStore()
  for (let index = 0; index <= 100; index++) store.putHistory(history(index))
  assert.equal(store.history.length, 100)
  assert.equal(store.history[0].searchText, "query-100")
  assert.equal(store.history[99].searchText, "query-1", "remove oldest, retaining the previous second-oldest")
  assert.ok(!store.history.some(item => item.searchText === "query-0"))
  assert.deepEqual(JSON.parse(saved.get("search-history")), Array.from(store.history))
  store.putHistory(history(50, 200))
  assert.equal(store.history[0].searchText, "query-50")
  assert.equal(store.history.filter(item => item.searchText === "query-50").length, 1)
  assert.equal(store.history.length, 100)
  const beforeDelete = saved.get("search-history")
  store.deleteHistory(-1)
  assert.equal(saved.get("search-history"), beforeDelete)

  for (const damaged of ["{", "null", "[]", '"not-an-object"']) {
    saved.set("search-engines", damaged)
    saved.set("search-history", damaged)
    const damagedStore = freshStore()
    assert.deepEqual(Array.from(damagedStore.history), [], `history recovers from ${damaged}`)
    assert.deepEqual(Object.keys(damagedStore.searchEngines).sort(), Object.keys(searchModule.DEFAULT_SEARCH_ENGINES).sort())
    assert.equal(damagedStore.currentUseEngine.id, "bing")
  }
  saved.set("search-history", JSON.stringify([null, {}, history(1), { ...history(2), timestamp: "bad" }]))
  const recovered = freshStore()
  assert.deepEqual(Array.from(recovered.history), [history(1)])
  setting.search.currentEngine = "missing-engine"
  assert.equal(recovered.currentUseEngine.id, "bing")
  await recovered.submitSearch("  safe fallback  ")
  assert.equal(recovered.history[0].engineId, "bing")
  assert.equal(new URL(opened.at(-1)[0]).hostname, "cn.bing.com")
  assert.equal(new URL(opened.at(-1)[0]).searchParams.get("q"), "safe fallback")
  recovered.openSearchPage({ engine: "missing-engine", text: "direct fallback", target: "_self" })
  assert.equal(new URL(opened.at(-1)[0]).searchParams.get("q"), "direct fallback")
  assert.equal(opened.at(-1)[1], "_self")

  const custom = { id: "custom", name: "Custom", baseUrl: "https://example.com/?q={searchText}", icon: "", description: "" }
  const beforeAdd = JSON.stringify(recovered.searchEngines)
  const beforeSavedAdd = saved.get("search-engines")
  for (const id of [...Object.keys(searchModule.DEFAULT_SEARCH_ENGINES), "__proto__", "constructor", "prototype", " bing "]) {
    assert.throws(() => recovered.addSearchEngine({ ...custom, id }), /保留/)
    assert.equal(JSON.stringify(recovered.searchEngines), beforeAdd, `${id} must not alter engines`)
    assert.equal(saved.get("search-engines"), beforeSavedAdd, `${id} must not reach storage`)
  }
  for (const baseUrl of ["javascript:alert(1)", "ftp://example.com/", "https://user:password@example.com/"]) {
    assert.throws(() => recovered.addSearchEngine({ ...custom, baseUrl }), /HTTP/)
  }
  assert.throws(() => recovered.addSearchEngine({ ...custom, name: "  " }), /名称/)
  const saveItem = localStorage.setItem
  localStorage.setItem = () => { throw new Error("quota") }
  assert.throws(() => recovered.addSearchEngine(custom), /quota/)
  assert.equal(JSON.stringify(recovered.searchEngines), beforeAdd, "failed persistence must not publish a transient engine")
  localStorage.setItem = saveItem
  recovered.addSearchEngine(custom)
  assert.deepEqual(freshStore().searchEngines.custom, custom, "custom engine survives a complete store reload")
  assert.throws(() => recovered.addSearchEngine({ ...custom, baseUrl: "https://changed.example/" }), /已存在/)
  assert.deepEqual(recovered.searchEngines.custom, custom, "duplicate names must not silently replace existing data")
  setting.search.currentEngine = "custom"
  setting.search.useSearchEngines = ["bing", "custom"]
  assert.equal(recovered.currentUseEngine.id, "custom")
  recovered.deleteSearchEngine("custom")
  assert.equal(recovered.searchEngines.custom, undefined)
  assert.equal(JSON.parse(saved.get("search-engines")).custom, undefined)
  assert.deepEqual(Array.from(setting.search.useSearchEngines), ["bing"])
  assert.equal(setting.search.currentEngine, "bing")
  recovered.deleteSearchEngine("bing")
  assert.equal(recovered.currentUseEngine.id, "bing", "built-in engines cannot be deleted")
  console.log("Search history, corrupt storage recovery, engine ID/URL validation, persistence failure, reload, and cleanup checks passed.")
}

check().catch(error => { console.error(error); process.exitCode = 1 })
