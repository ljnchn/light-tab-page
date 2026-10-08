import { createDefaultSetting } from "./setting-defaults"
import { createSiteId, normalizeTopSites } from "./top-site"
import { wallpaperStore } from "@/plugins/localforage"
import { verifyImageUrl } from "./img"

export const BACKUP_KEYS = ["setting-data", "top-site-data", "search-engines", "search-history"] as const
export const MAX_BACKUP_SIZE = 50 * 1024 * 1024
export type BackupData = Partial<Record<(typeof BACKUP_KEYS)[number], string>> & { wallpapers?: Record<string, string> }
const APP_MARK = "light-tab-page"

export class BackupError extends Error {
  constructor(public code: "invalid" | "tooLarge" | "writeFailed" | "rollbackFailed" | "wallpaperMissing") {
    super(code)
  }
}

function assert(valid: unknown): asserts valid {
  if (!valid) throw new BackupError("invalid")
}

function object(value: unknown): Record<string, any> {
  assert(value && typeof value === "object" && !Array.isArray(value))
  return value as Record<string, any>
}

function string(value: unknown, max = 10000): asserts value is string {
  assert(typeof value === "string" && value.length <= max)
}

function number(value: unknown, min: number, max: number, integer = false) {
  assert(typeof value === "number" && Number.isFinite(value) && value >= min && value <= max)
  if (integer) assert(Number.isInteger(value))
}

function httpUrl(value: unknown) {
  string(value)
  try {
    const url = new URL(value)
    assert(["http:", "https:"].includes(url.protocol) && !url.username && !url.password)
  } catch { throw new BackupError("invalid") }
}

function settings(value: unknown) {
  const source = object(value)
  const clean = createDefaultSetting() as unknown as Record<string, any>
  // Only copy declared settings. Old backups may contain unrelated local credentials.
  for (const key of Object.keys(clean)) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue
    if (key === "lang") {
      assert(["auto", "zh-CN", "zh-TW", "en"].includes(source.lang))
      clean.lang = source.lang
      continue
    }
    const section = object(source[key])
    for (const field of Object.keys(clean[key])) {
      if (!Object.prototype.hasOwnProperty.call(section, field)) continue
      const current = section[field]
      const fallback = clean[key][field]
      if (["id", "url"].includes(field) && key === "background") {
        assert(current === null || typeof current === "string")
      } else if (Array.isArray(fallback)) {
        assert(Array.isArray(current) && current.length <= 1000)
        current.forEach(item => string(item))
      } else {
        assert(typeof current === typeof fallback)
        if (typeof current === "string") string(current)
        if (typeof current === "number") assert(Number.isFinite(current))
      }
      clean[key][field] = current
    }
  }
  number(clean.theme.mode, 0, 2, true)
  number(clean.background.type, 0, 2, true)
  number(clean.background.blur, 0, 100)
  number(clean.background.maskOpacity, 0, 1)
  number(clean.search.searchInputRadius, 0, 1000)
  number(clean.search.suggestion, 0, 3, true)
  assert(["_blank", "_self"].includes(clean.search.openPageTarget))
  assert(clean.search.currentEngine.length > 0)
  for (const name of ["col", "row"]) number(clean.topSite[name], 1, 100, true)
  for (const name of ["gap", "iconSize", "boardSize", "boardRadius"]) number(clean.topSite[name], 0, 1000)
  number(clean.topSite.boardOpacity, 0, 1)
  number(clean.layout.align, 0, 1, true)
  number(clean.layout.offsetY, -10000, 10000)
  number(clean.popup.current, 0, 1, true)
  // Session object URLs are rebuilt from the embedded wallpaper after restoration.
  if (clean.background.type === 1 || clean.background.url?.startsWith("blob:")) {
    clean.background.url = null
  } else if (clean.background.url) httpUrl(clean.background.url)
  return clean
}

function topSites(value: unknown) {
  const state = object(value)
  assert(Array.isArray(state.topSites) && state.topSites.length <= 10000)
  const ids = new Set<string>()
  const folderIds = new Set<string>()
  const list = state.topSites.map((item: unknown) => {
    const source = object(item)
    string(source.title)
    assert(source.title.trim().length > 0)
    string(source.url)
    assert(typeof source.custom === "boolean" && typeof source.textIcon === "boolean")
    const clean: Record<string, any> = {
      title: source.title, url: source.url, custom: source.custom, textIcon: source.textIcon
    }
    if (source.autoIcon !== undefined) {
      assert(typeof source.autoIcon === "boolean")
      clean.autoIcon = source.autoIcon
    }
    for (const key of ["id", "kind", "folderId", "icon", "color"]) {
      if (source[key] === undefined) continue
      string(source[key], key === "icon" ? MAX_BACKUP_SIZE : 10000)
      clean[key] = source[key]
    }
    if (source.id !== undefined) {
      assert(source.id.trim().length > 0 && !ids.has(source.id))
      ids.add(source.id)
    }
    assert(source.kind === undefined || source.kind === "folder")
    if (source.kind === "folder") {
      assert(source.id && source.url === "" && source.folderId === undefined)
      folderIds.add(source.id)
    } else httpUrl(source.url)
    return clean
  })
  list.forEach(item => assert(item.folderId === undefined || folderIds.has(item.folderId)))
  if (state.lastUpdateTime !== undefined) number(state.lastUpdateTime, 0, Number.MAX_SAFE_INTEGER)
  const normalized = normalizeTopSites(list)
  assert(normalized.length === list.length)
  assert(list.every((item, index) => item.id === undefined || normalized[index].id === item.id))
  return { topSites: normalized, lastUpdateTime: state.lastUpdateTime }
}

function searchEngines(value: unknown) {
  const clean = Object.create(null)
  const source = object(value)
  assert(Object.keys(source).length <= 1000)
  for (const [id, item] of Object.entries(source)) {
    assert(id !== "__proto__" && id !== "constructor" && id !== "prototype")
    const engine = object(item)
    const result: Record<string, string> = {}
    for (const key of ["id", "name", "baseUrl", "icon", "description"]) {
      string(engine[key])
      result[key] = engine[key]
    }
    assert(result.id === id && id.length > 0 && result.name.length > 0)
    httpUrl(result.baseUrl)
    clean[id] = result
  }
  return clean
}

function searchHistory(value: unknown) {
  assert(Array.isArray(value) && value.length <= 10000)
  return value.map(item => {
    const entry = object(item)
    string(entry.engineId)
    string(entry.searchText)
    number(entry.timestamp, 0, Number.MAX_SAFE_INTEGER)
    return { engineId: entry.engineId, searchText: entry.searchText, timestamp: entry.timestamp }
  })
}

const validators = { "setting-data": settings, "top-site-data": topSites, "search-engines": searchEngines, "search-history": searchHistory }

function wallpaperData(value: unknown): Record<string, string> {
  const source = object(value)
  assert(Object.keys(source).length <= 1000)
  const clean: Record<string, string> = Object.create(null)
  for (const [id, image] of Object.entries(source)) {
    assert(id.trim().length > 0 && id.length <= 10000 && !["__proto__", "constructor", "prototype"].includes(id))
    string(image, MAX_BACKUP_SIZE)
    const comma = image.indexOf(",")
    assert(/^data:image\/(?:png|jpeg|jpg|gif);base64$/i.test(image.slice(0, comma)))
    const bytes = image.slice(comma + 1)
    assert(bytes.length > 0 && bytes.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(bytes))
    clean[id] = image
  }
  return clean
}

export function parseBackup(text: string): BackupData {
  if (new Blob([text]).size > MAX_BACKUP_SIZE) throw new BackupError("tooLarge")
  try {
    const backup = object(JSON.parse(text))
    assert(backup._MARK_ === APP_MARK)
    assert(backup.version === undefined || backup.version === 1 || backup.version === 2)
    const source = backup.version === undefined ? backup : object(backup.data)
    const data: BackupData = {}
    for (const key of BACKUP_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(source, key)) continue
      string(source[key], MAX_BACKUP_SIZE)
      data[key] = JSON.stringify(validators[key](JSON.parse(source[key])))
    }
    assert(Object.keys(data).length > 0)
    if (backup.version === 2) {
      // A new full backup must never silently accept a truncated application snapshot.
      assert(BACKUP_KEYS.every(key => data[key] !== undefined))
      data.wallpapers = wallpaperData(source.wallpapers)
    }
    if (data["setting-data"]) {
      const setting = JSON.parse(data["setting-data"])
      const { search, background } = setting
      if (backup.version === 2) {
        assert(!background.id || Object.prototype.hasOwnProperty.call(data.wallpapers, background.id))
      } else {
        // Legacy files never carried IndexedDB images; their IDs are not portable.
        background.id = null
      }
      data["setting-data"] = JSON.stringify(setting)
      const engines = JSON.parse(data["search-engines"] || "{}")
      const available = new Set(["bing", "google", "baidu", "npm", "maven", ...Object.keys(engines)])
      assert(available.has(search.currentEngine))
      assert(search.useSearchEngines.every((id: string) => available.has(id)))
    }
    return data
  } catch (error) {
    if (error instanceof BackupError) throw error
    throw new BackupError("invalid")
  }
}

export async function createBackup(storage: Storage = localStorage): Promise<string> {
  const defaults = { "setting-data": createDefaultSetting(), "top-site-data": { topSites: [] }, "search-engines": {}, "search-history": [] }
  const raw = Object.fromEntries(BACKUP_KEYS.map(key => [key, storage.getItem(key) ?? JSON.stringify(defaults[key])]))
  const wallpapers: Record<string, string> = Object.create(null)
  const keys = await wallpaperStore.keys()
  const background = JSON.parse(raw["setting-data"]).background
  if (background?.id && !keys.includes(background.id)) throw new BackupError("wallpaperMissing")
  let encodedSize = new Blob([JSON.stringify(raw)]).size
  for (const id of keys) {
    const image = await wallpaperStore.getItem<Blob>(id)
    if (!(image instanceof Blob) || !image.type.startsWith("image/") || !image.size) throw new BackupError("wallpaperMissing")
    encodedSize += 4 * Math.ceil(image.size / 3)
    if (encodedSize > MAX_BACKUP_SIZE) throw new BackupError("tooLarge")
    const bytes = new Uint8Array(await image.arrayBuffer())
    let binary = ""
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
    wallpapers[id] = `data:${image.type};base64,${btoa(binary)}`
  }
  const data = parseBackup(JSON.stringify({ _MARK_: APP_MARK, version: 2, data: { ...raw, wallpapers } }))
  const result = JSON.stringify({ _MARK_: APP_MARK, version: 2, data }, null, 2)
  if (new Blob([result]).size > MAX_BACKUP_SIZE) throw new BackupError("tooLarge")
  return result
}

export async function restoreBackup(data: BackupData, storage: Storage = localStorage) {
  // Validate everything before the first write, including callers that bypass parseBackup.
  const clean = parseBackup(JSON.stringify({ _MARK_: APP_MARK, version: data.wallpapers === undefined ? 1 : 2, data }))
  const decodedImages = new Map<string, Blob>()
  for (const [id, image] of Object.entries(clean.wallpapers || {})) {
    // A valid base64 string can still contain corrupt/non-image bytes.
    if (!await verifyImageUrl(image)) throw new BackupError("invalid")
    const comma = image.indexOf(",")
    const bytes = Uint8Array.from(atob(image.slice(comma + 1)), char => char.charCodeAt(0))
    decodedImages.set(id, new Blob([bytes], { type: image.slice(5, comma - 7) }))
  }
  const previous = BACKUP_KEYS.map(key => [key, storage.getItem(key)] as const)
  const oldImages = clean.wallpapers === undefined ? [] : await wallpaperStore.keys()
  const stagedImages: string[] = []
  let wroteStorage = false
  try {
    const imageIds = new Map<string, string>()
    for (const [oldId, image] of decodedImages) {
      const id = createSiteId()
      // New IDs leave all existing images intact until the settings commit succeeds.
      stagedImages.push(id)
      await wallpaperStore.setItem(id, image)
      imageIds.set(oldId, id)
    }
    if (clean["setting-data"]) {
      const setting = JSON.parse(clean["setting-data"])
      if (setting.background.id) setting.background.id = imageIds.get(setting.background.id)
      clean["setting-data"] = JSON.stringify(setting)
    }
    if (clean["top-site-data"]) {
      const sites = JSON.parse(clean["top-site-data"])
      // Imported browser links must not be replaced by first-run browser discovery.
      if (!sites.lastUpdateTime) sites.lastUpdateTime = Date.now()
      clean["top-site-data"] = JSON.stringify(sites)
    }
    wroteStorage = true
    for (const key of BACKUP_KEYS) {
      // Missing sections in legacy/partial backups leave the local section intact.
      if (clean[key] !== undefined) storage.setItem(key, clean[key]!)
    }
  } catch {
    let rollbackFailed = false
    try {
      if (wroteStorage) {
        for (const key of BACKUP_KEYS) storage.removeItem(key)
        for (const [key, value] of previous) {
          if (value !== null) storage.setItem(key, value)
        }
      }
    } catch { rollbackFailed = true }
    // If settings rollback failed, a live setting may still reference a new image.
    if (!rollbackFailed) for (const id of stagedImages) {
      try { await wallpaperStore.removeItem(id) } catch { rollbackFailed = true }
    }
    if (rollbackFailed) throw new BackupError("rollbackFailed")
    throw new BackupError("writeFailed")
  }
  // Cleanup failure must not turn a successfully restored backup into a failed restore.
  for (const id of oldImages) {
    try { await wallpaperStore.removeItem(id) } catch { /* The old, unreferenced image is safe to retain. */ }
  }
}
