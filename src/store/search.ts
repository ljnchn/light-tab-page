import { defineStore } from "pinia"
import {
  SearchEngineData,
  SearchEngineItem,
  SearchSuggestion,
  HistoryItem,
  SearchData
} from "@/types/search"
import { RuleDataMap, Rule, Rules, RuleData } from "@/types/rule"
import { AnalyzeUrl } from "@/types/analyze"
import { deepClone, isEmpty } from "@/utils/common"
import { getBaiduSuggestion, getBingSuggestion, getGoogleSuggestion } from "@/api/suggestion"
import useSettingStore from "./setting"

export interface SearchState {
  searchEngines: SearchEngineData
  history: Array<HistoryItem>
  rules: RuleDataMap
}

const SEARCH_ENGINES_STORAGE = "search-engines"
const SEARCH_HISTORY_STORAGE = "search-history"
const SEARCH_HISTORY_LENGTH = 100

const ruleModules = import.meta.glob<true, string, Rule>("/src/rules/*.json", { eager: true })
const rules: Rules = Object.values(ruleModules)
export const DEFAULT_SEARCH_ENGINES: SearchEngineData = Object.fromEntries(
  rules.map(item => [
    item.id,
    {
      id: item.id,
      name: item.name,
      icon: item.icon,
      description: item.description,
      baseUrl: item.search.url
    }
  ])
)

export default defineStore("search", {
  persist: false,
  state: (): SearchState => ({
    searchEngines: readSearchEngines(),
    history: readHistory(),
    rules: Object.fromEntries(rules.map(item => [item.id, new RuleData(item)]))
  }),
  getters: {
    /**
     * 获取当前使用的搜索引擎
     *
     * @returns SearchEngineItem
     */
    currentUseEngine(state): SearchEngineItem {
      const { search } = useSettingStore()
      return state.searchEngines[search.currentEngine] ?? DEFAULT_SEARCH_ENGINES.bing
    },

    /**
     * 获取需要使用的搜索引擎列表
     * @returns SearchEngineData
     */
    useSearchEngines(state): SearchEngineData {
      const { search } = useSettingStore()
      const useSearchEngines = search.useSearchEngines!,
        temp: SearchEngineData = {}

      for (let id of useSearchEngines) {
        const searchEngine = state.searchEngines[id]
        if (isEmpty(searchEngine)) continue

        temp[id] = searchEngine
      }
      return temp
    }
  },
  actions: {
    /**
     * 提交搜索
     * @param param0
     * @param searchText
     */
    async submitSearch(search: string) {
      const searchTrim = search.trim()
      if (isEmpty(searchTrim)) throw new Error("搜索内容不能为空")

      const settingStore = useSettingStore()
      const setting = settingStore.search
      const currentEngine = this.currentUseEngine.id
      const history: HistoryItem = {
        engineId: currentEngine,
        searchText: searchTrim,
        timestamp: Date.now()
      }

      this.putHistory(history)
      this.openSearchPage({
        engine: currentEngine,
        text: searchTrim,
        target: setting.openPageTarget!
      })
    },

    /**
     * 打开搜索页面
     * @param param0
     * @param search
     */
    openSearchPage(search: SearchData) {
      const { engine, text, target } = search
      const searchEngines = this.searchEngines

      // 构建搜索URL
      const url = AnalyzeUrl.defalut((searchEngines[engine] ?? DEFAULT_SEARCH_ENGINES.bing).baseUrl, {
        searchText: text
      }).getUrlString()

      window.open(url, target)
    },

    /**
     * 获取搜索建议
     * @param param0
     * @param searchText
     * @returns
     */
    getSuggestion(searchText: string) {
      const { search } = useSettingStore()

      switch (search.suggestion) {
        case SearchSuggestion.baidu:
          return getBaiduSuggestion(searchText)
        case SearchSuggestion.bing:
          return getBingSuggestion(searchText)
        case SearchSuggestion.google:
          return getGoogleSuggestion(searchText)
        default:
          return []
      }
    },

    /**
     * 添加搜索历史
     * @param param0
     * @param newHistory
     */
    putHistory(newHistory: HistoryItem) {
      let history = readHistory()

      // 去重并在头添加
      history = history.filter(item => item.searchText !== newHistory.searchText)
      history.unshift(newHistory)

      this.history = history
      saveSearchHistory(history)
    },

    /**
     * 删除搜索历史
     * @param param0
     * @param index
     */
    deleteHistory(index: number) {
      const history = readHistory()
      if (!Number.isInteger(index) || index < 0 || index >= history.length) return
      history.splice(index, 1)

      this.history = history
      saveSearchHistory(history)
    },

    /**
     * 加载搜索历史
     * @param state
     */
    loadHistory() {
      this.history = readHistory()
    },

    loadSearchEngines() {
      this.searchEngines = readSearchEngines()
    },

    /**
     * 清除所有搜索历史
     * @param state
     */
    cleanHistory() {
      this.history = []
      localStorage.removeItem(SEARCH_HISTORY_STORAGE)
    },

    /**
     * 添加自定义搜索引擎
     * @param state
     * @param data
     */
    addSearchEngine(data: SearchEngineItem) {
      const id = data.id.trim()
      const name = data.name.trim()
      if (!id || !name) throw new Error("请输入搜索引擎名称")
      if (Object.prototype.hasOwnProperty.call(DEFAULT_SEARCH_ENGINES, id) ||
        ["__proto__", "constructor", "prototype"].includes(id)) {
        throw new Error("此名称已被系统保留，请使用其他搜索引擎名称")
      }
      if (Object.prototype.hasOwnProperty.call(this.searchEngines, id)) {
        throw new Error("此搜索引擎名称已存在，请使用其他名称")
      }
      try {
        const url = new URL(data.baseUrl)
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error()
      } catch { throw new Error("请输入有效的 HTTP 或 HTTPS 搜索地址") }
      const searchEnginesNew = {
        ...this.searchEngines,
        [id]: { ...data, id, name }
      }

      saveSearchEngineData(searchEnginesNew)
      this.searchEngines = searchEnginesNew
    },

    /**
     * 删除自定义搜索引擎
     * @param state
     * @param searchKey
     */
    deleteSearchEngine(searchKey: string) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_SEARCH_ENGINES, searchKey)) return
      const searchEnginesNew = deepClone(this.searchEngines, searchKey)

      this.searchEngines = searchEnginesNew
      saveSearchEngineData(searchEnginesNew)
      const { search } = useSettingStore()
      search.useSearchEngines = search.useSearchEngines.filter(id => id !== searchKey)
      if (search.currentEngine === searchKey) search.currentEngine = "bing"
    }
  }
})

function saveSearchEngineData(data: SearchEngineData) {
  const saveData = deepClone(data, ...Object.keys(DEFAULT_SEARCH_ENGINES))
  const dataJson = JSON.stringify(saveData)
  localStorage.setItem(SEARCH_ENGINES_STORAGE, dataJson)
}

function saveSearchHistory(data: Array<HistoryItem>) {
  if (data.length > SEARCH_HISTORY_LENGTH) data.splice(SEARCH_HISTORY_LENGTH)

  const dataJson = JSON.stringify(data)
  localStorage.setItem(SEARCH_HISTORY_STORAGE, dataJson)
}

function readHistory(): HistoryItem[] {
  try {
    const value = JSON.parse(localStorage.getItem(SEARCH_HISTORY_STORAGE) ?? "[]")
    if (!Array.isArray(value)) return []
    return value.filter(item => item && typeof item.searchText === "string" &&
      typeof item.engineId === "string" && Number.isFinite(item.timestamp)).slice(0, SEARCH_HISTORY_LENGTH)
  } catch {
    return []
  }
}

function readSearchEngines(): SearchEngineData {
  const result = { ...DEFAULT_SEARCH_ENGINES }
  try {
    const value = JSON.parse(localStorage.getItem(SEARCH_ENGINES_STORAGE) ?? "{}")
    if (!value || typeof value !== "object" || Array.isArray(value)) return result
    for (const [key, item] of Object.entries(value) as [string, SearchEngineItem][]) {
      if (Object.prototype.hasOwnProperty.call(DEFAULT_SEARCH_ENGINES, key) ||
        ["__proto__", "constructor", "prototype"].includes(key)) continue
      if (!item || item.id !== key || typeof item.name !== "string" || typeof item.baseUrl !== "string") continue
      try {
        const url = new URL(item.baseUrl)
        if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) result[key] = item
      } catch { /* One damaged engine must not hide the remaining valid engines. */ }
    }
  } catch {
    // Keep built-in engines available even if local custom data is damaged.
  }
  return result
}
