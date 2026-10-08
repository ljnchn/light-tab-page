import { AlignType, BackgroundType, LanguageType, ThemeMode } from "@/types/setting"
import { OpenPageTarget, SearchSuggestion } from "@/types/search"
import type { SettingState } from "@/store/setting"

export function createDefaultSetting(): SettingState {
  return {
    lang: LanguageType.Auto,
    theme: { mode: ThemeMode.Auto, primaryColor: "#1890ff", colorPalette: [] },
    background: {
      id: "", type: BackgroundType.None, url: "", blur: 0,
      maskColor: "#000", maskOpacity: 0, autoOpacity: true
    },
    search: {
      currentEngine: "bing", openPageTarget: OpenPageTarget.Blank,
      showEngineIcon: true, showEngineSelect: true, searchInputRadius: 4,
      useSearchEngines: ["bing", "google", "baidu"], suggestion: SearchSuggestion.none
    },
    topSite: {
      enable: false, col: 6, row: 2, gap: 16, iconSize: 32, boardSize: 64,
      boardRadius: 4, boardColor: "#fff", boardOpacity: 0.8
    },
    layout: { align: AlignType.searchCenter, offsetY: 0 },
    popup: { current: 0 }
  }
}
