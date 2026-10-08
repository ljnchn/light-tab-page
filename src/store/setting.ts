import { defineStore } from "pinia"
import { isEmpty, uuid } from "@/utils/common"
import { wallpaperStore } from "@/plugins/localforage"
import { isImageFile } from "@/utils/img"
import { usePreferredDark } from "@/utils/use"
import { getDailyWallpaperUrl } from "@/api/bing"
import { saveAs } from "file-saver"
import { fromUrl } from "@/utils/palette"
import { createBackup, parseBackup, restoreBackup } from "@/utils/backup"
import { createDefaultSetting } from "@/utils/setting-defaults"
import {
  BackgroundSetting,
  BackgroundType,
  ThemeMode,
  TopSiteSetting,
  LayoutSetting,
  PopupSettting,
  LanguageType,
  ThemeSetting
} from "@/types/setting"
import { SearchSetting } from "@/types/search"

export interface SettingState {
  lang: LanguageType
  theme: ThemeSetting
  search: SearchSetting
  background: BackgroundSetting
  topSite: TopSiteSetting
  layout: LayoutSetting
  popup: PopupSettting
}

const DEFAULT_COLOR = ["#1890ff", "#7FBA00", "#F25022", "#FFB900", "#00A4EF", "#1F1F1F"]
let ownedBackgroundUrl: string | null = null
let pendingBackgroundLoad: { owner: object; id: string | null; task: Promise<string | null | undefined> } | undefined

function ownBackgroundUrl(url: string | null) {
  // A synchronized setting may contain another tab's URL; only revoke this page's URLs.
  if (ownedBackgroundUrl && ownedBackgroundUrl !== url) URL.revokeObjectURL(ownedBackgroundUrl)
  ownedBackgroundUrl = url
}

export default defineStore("setting", {
  state: createDefaultSetting,
  getters: {
    /**
     * 获取当前语言
     * 自动时使用浏览器语言
     *
     * @returns currentLang
     */
    currentLang: ({ lang }) => (lang === LanguageType.Auto ? navigator.language : lang),

    /**
     * 获取当前主题
     * 自动时使用系统主题颜色
     *
     * @returns ThemeMode.Dart | ThemeMode.Light
     */
    currentTheme(): ThemeMode.Dart | ThemeMode.Light {
      const mode = this.theme.mode

      if (mode === ThemeMode.Auto) {
        const isDark = usePreferredDark()
        return isDark.value ? ThemeMode.Dart : ThemeMode.Light
      } else {
        return mode
      }
    },

    /**
     * 获取基础颜色
     *
     * @returns Array<string>
     */
    primaryColors(): Array<string> {
      const { colorPalette } = this.theme
      if (isEmpty(colorPalette)) {
        return DEFAULT_COLOR
      } else {
        return colorPalette
      }
    }
  },
  actions: {
    /**
     * 上传壁纸
     * @param param0
     * @param imageFile
     */
    async uploadBackgroundImage(imageFile: File) {
      if (!isImageFile(imageFile)) throw new Error("invalidImage")
      const id = uuid()
      const url = URL.createObjectURL(imageFile)
      try {
        // Keep the old file and setting intact until the new Blob is durable.
        await wallpaperStore.setItem<Blob>(id, imageFile)
      } catch (error) {
        URL.revokeObjectURL(url)
        throw error
      }
      const previousId = this.background.id
      const active = this.background.type === BackgroundType.Local
      this.$patch(state => { state.background.id = id; if (active) state.background.url = url })
      if (!active) URL.revokeObjectURL(url)
      ownBackgroundUrl(active ? url : null)
      if (previousId && previousId !== id) {
        try { await wallpaperStore.removeItem(previousId) }
        catch { /* Cleanup failure must not undo a successfully saved wallpaper. */ }
      }
    },

    /**
     * 重新加载壁纸
     * 壁纸使用BlobUrl实现，数据生命周期为session
     * @param param0
     */
    async reloadBackgroundImage() {
      if (this.background.type !== BackgroundType.Local) return
      const id = this.background.id
      if (pendingBackgroundLoad?.owner === this && pendingBackgroundLoad.id === id) return pendingBackgroundLoad.task
      const task = (async () => {
        const file = id ? await wallpaperStore.getItem<Blob>(id) : null
        if (this.background.id !== id || this.background.type !== BackgroundType.Local) return
        const url = file && isImageFile(file) ? URL.createObjectURL(file) : null
        this.background.url = url
        ownBackgroundUrl(url)
        // Retain a missing file's ID so exporting reports it instead of silently omitting it.
        return url
      })()
      pendingBackgroundLoad = { owner: this, id, task }
      try { return await task }
      finally { if (pendingBackgroundLoad?.task === task) pendingBackgroundLoad = undefined }
    },

    /**
     * 加载Bing每日壁纸
     * @param param0
     * @param imageFile
     */
    async loadBingDailyWallpaper() {
      const url = await getDailyWallpaperUrl()

      if (isEmpty(url) || this.background.type !== BackgroundType.Bing) return
      this.background.url = url
      ownBackgroundUrl(null)
    },

    async loadWallpaperPalette() {
      const { url } = this.background
      this.theme.colorPalette = await fromUrl(url!)
    },

    /**
     * 导出设置数据
     * 使用JSON格式保存
     */
    async exportSetting() {
      const { npm_package_name, npm_package_version } = import.meta.env
      const dataJson = await createBackup()

      // 保存文件
      const blob = new Blob([dataJson], { type: "application/json;charset=utf-8" })
      saveAs(blob, `${npm_package_name}_${npm_package_version}.json`)
    },

    /**
     * 导入设置数据
     * 使用JSON格式保存
     */
    async importSetting(file: File) {
      await restoreBackup(parseBackup(await file.text()))
    }
  }
})
