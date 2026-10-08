import type { TopSiteItem, TopSites } from "@/types"

export function normalizeSiteUrl(value: string): string {
  const input = value.trim()
  if (!input) throw new Error("请输入网站地址")
  const hasScheme = /^[a-z][a-z\d+.-]*:/i.test(input)
  const hostWithPort = /^(?:localhost|[\w-]+(?:\.[\w-]+)+):\d+(?:[/?#]|$)/i.test(input)
  if (hasScheme && !hostWithPort && !/^https?:\/\//i.test(input)) {
    throw new Error("请输入有效的 HTTP 或 HTTPS 网站地址")
  }
  const url = new URL(hasScheme && !hostWithPort ? input : `https://${input}`)
  if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error("请输入有效的 HTTP 或 HTTPS 网站地址")
  }
  return url.href
}

export function createSiteId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `site-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// Legacy IDs are deterministic so two tabs migrating the same saved data agree.
export function normalizeTopSites(value: unknown): TopSites {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  const result: TopSites = []
  value.forEach((entry, index) => {
    if (!entry || typeof entry !== "object" || typeof entry.title !== "string") return
    const title = entry.title.trim()
    if (!title) return
    const folder = entry.kind === "folder"
    let url = ""
    if (!folder) {
      if (typeof entry.url !== "string") return
      try { url = normalizeSiteUrl(entry.url) } catch { return }
    }
    let id = typeof entry.id === "string" && entry.id.trim() ? entry.id : ""
    if (!id || ids.has(id)) {
      let hash = 0
      for (const char of `${title}\n${url}`) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) | 0
      id = `legacy-${index}-${(hash >>> 0).toString(36)}`
      while (ids.has(id)) id += "-1"
    }
    ids.add(id)
    const item: TopSiteItem = {
      id, title, url,
      textIcon: folder || entry.textIcon === true,
      custom: folder || entry.custom !== false
    }
    if (folder) item.kind = "folder"
    else {
      if (typeof entry.folderId === "string") item.folderId = entry.folderId
      const icon = typeof entry.icon === "string" && entry.icon ? entry.icon : undefined
      // Old browser sync stored transient image failures as text icons. Explicit
      // modes take precedence so user-selected text and custom images stay intact.
      item.autoIcon = typeof entry.autoIcon === "boolean" ? entry.autoIcon
        : item.textIcon ? entry.custom === false && !icon
        : !icon || /^(?:chrome|moz)-extension:\/\//i.test(icon)
          || /^(?:chrome|edge):\/\/favicon(?:2)?(?:[/?]|$)/i.test(icon)
          || icon === `${new URL(url).origin}/favicon.ico`
      if (item.autoIcon) item.textIcon = false
      item.icon = icon
    }
    if (typeof entry.color === "string") item.color = entry.color
    result.push(item)
  })
  const folders = new Set(result.filter(item => item.kind === "folder").map(item => item.id))
  for (const item of result) {
    if (item.folderId && !folders.has(item.folderId)) delete item.folderId
    if (item.folderId) item.custom = true
  }
  return result
}
