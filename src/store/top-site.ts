import { defineStore } from "pinia"
import useSettingStore from "./setting"
import { hasPermissions, getBrowserTopSites, getFavicon, isExtension, Permis } from "@/plugins/extension"
import { SortData, TopSiteItem, TopSites } from "@/types"
import { createSiteId, normalizeSiteUrl, normalizeTopSites } from "@/utils/top-site"

function prepareTopSites(value: unknown): TopSites {
  const sites = normalizeTopSites(value)
  for (const item of sites) {
    if (item.autoIcon) item.icon = getFavicon(item.url)
  }
  return sites
}

export interface TopSiteState {
  topSites: TopSites
  lastUpdateTime?: number
}

export interface TopSiteItemVo extends TopSiteItem {
  index: number
}

export default defineStore("top-site", {
  state: (): TopSiteState => ({ topSites: [], lastUpdateTime: undefined }),
  getters: {
    folders: state => state.topSites.filter(item => item.kind === "folder"),
    getCurrentTopSites(): TopSites {
      const { topSite: setting } = useSettingStore()
      return this.topSites.filter(item => !item.folderId).slice(0, setting.col * setting.row)
    }
  },
  actions: {
    normalize() {
      const normalized = prepareTopSites(this.topSites)
      if (JSON.stringify(normalized) !== JSON.stringify(this.topSites)) this.topSites = normalized
    },

    async syncBrowserTopSites() {
      if (!isExtension || !(await hasPermissions(Permis.topSite))) return
      const list = await getBrowserTopSites()
      const topSites = list.map(item => {
        try {
          const url = normalizeSiteUrl(item.url)
          return prepareTopSites([{ id: createSiteId(), title: item.title?.trim() || new URL(url).hostname,
            url, icon: item.favicon, autoIcon: item.favicon ? undefined : true, textIcon: false, custom: false }])[0]
        } catch { return undefined }
      })
      // Read after the request so links edited or added while syncing are retained.
      this.normalize()
      const retained = this.topSites.filter(item => item.custom || item.kind === "folder" || item.folderId)
      const seen = new Set(retained.filter(item => item.kind !== "folder").map(item => item.url))
      const fresh = topSites.filter((item): item is TopSiteItem => {
        if (!item || seen.has(item.url)) return false
        seen.add(item.url)
        return true
      })
      this.topSites = retained.concat(fresh)
      this.lastUpdateTime = Date.now()
    },

    addTopSite(data: TopSiteItem) {
      this.normalize()
      const item = prepareTopSites([{ ...data, id: createSiteId(), url: normalizeSiteUrl(data.url), custom: true }])[0]
      if (!item || item.kind === "folder") throw new Error("请输入链接名称和有效网站地址")
      if (data.folderId && this.folders.some(folder => folder.id === data.folderId)) item.folderId = data.folderId
      this.topSites.push(item)
      return item
    },

    updateTopSite(data: TopSiteItemVo) {
      this.normalize()
      const index = data.id ? this.topSites.findIndex(item => item.id === data.id) : data.index
      const current = this.topSites[index]
      if (!Number.isInteger(index) || !current) throw new Error("此链接已被删除，请重新打开")
      if (current.kind === "folder") {
        this.renameFolder(current.id!, data.title)
        return this.topSites[index]
      }
      const item = prepareTopSites([{ ...data, id: current.id, url: normalizeSiteUrl(data.url), custom: true }])[0]
      if (!item || item.kind === "folder") throw new Error("请输入链接名称和有效网站地址")
      if (data.folderId && this.folders.some(folder => folder.id === data.folderId)) item.folderId = data.folderId
      this.topSites[index] = item
      return item
    },

    addFolder(title: string) {
      if (!title.trim()) throw new Error("请输入文件夹名称")
      const id = createSiteId()
      this.topSites.push({ id, kind: "folder", title: title.trim(), url: "", textIcon: true, custom: true })
      return id
    },

    renameFolder(id: string, title: string) {
      const folder = this.topSites.find(item => item.id === id && item.kind === "folder")
      if (!folder) throw new Error("此文件夹已被删除")
      if (!title.trim()) throw new Error("请输入文件夹名称")
      folder.title = title.trim()
    },

    moveToFolder(id: string, folderId?: string) {
      const item = this.topSites.find(item => item.id === id && item.kind !== "folder")
      if (!item) return
      if (folderId && !this.folders.some(folder => folder.id === folderId)) throw new Error("文件夹不存在")
      if (folderId) item.folderId = folderId
      else delete item.folderId
      item.custom = true
    },

    deleteTopSite(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= this.topSites.length) return
      const [deleted] = this.topSites.splice(index, 1)
      if (deleted.kind === "folder") {
        for (const item of this.topSites) {
          if (item.folderId === deleted.id) {
            delete item.folderId
            item.custom = true
          }
        }
      }
    },

    sortTopSites({ from, to }: SortData) {
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 ||
        from >= this.topSites.length || to >= this.topSites.length || from === to) return
      if (this.topSites[from].folderId !== this.topSites[to].folderId) return
      const [item] = this.topSites.splice(from, 1)
      item.custom = true
      this.topSites.splice(to, 0, item)
    },

    dropTopSite(draggedId: string, targetId: string, placement: "before" | "after" | "inside" = "before"): boolean {
      if (!draggedId || !targetId || draggedId === targetId) return false
      const from = this.topSites.findIndex(item => item.id === draggedId)
      const target = this.topSites.find(item => item.id === targetId)
      const dragged = this.topSites[from]
      if (!dragged || !target) return false

      if (placement === "inside") {
        if (dragged.kind === "folder" || target.kind !== "folder" || dragged.folderId === targetId) return false
        this.$patch(() => this.moveToFolder(draggedId, targetId))
        return true
      }
      if ((placement !== "before" && placement !== "after") || dragged.folderId !== target.folderId) return false
      const siblings = this.topSites.filter(item => item.folderId === dragged.folderId)
      const sourcePosition = siblings.findIndex(item => item.id === draggedId)
      const targetPosition = siblings.findIndex(item => item.id === targetId)
      if (sourcePosition === targetPosition + (placement === "before" ? -1 : 1)) return false

      const reordered = [...this.topSites]
      reordered.splice(from, 1)
      const to = reordered.findIndex(item => item.id === targetId) + (placement === "after" ? 1 : 0)
      reordered.splice(to, 0, { ...dragged, custom: true })
      this.topSites = reordered
      return true
    },

    refreshIconUrls() {
      this.normalize()
    }
  }
})
