<template>
  <section class="quick-add" aria-label="添加当前页面">
    <strong>添加当前页面</strong>
    <p v-if="loading" role="status">正在读取当前页面…</p>
    <p v-else-if="unavailable" class="hint" role="status">{{ unavailable }}</p>
    <form v-else @submit.prevent="save">
      <label for="quick-add-title">名称</label>
      <a-input id="quick-add-title" v-model:value="title" :maxlength="100" />
      <p class="page-url" :title="url">{{ url }}</p>
      <div class="save-row">
        <a-select v-model:value="folderId" aria-label="保存位置" class="folder-select">
          <a-select-option value="">根目录</a-select-option>
          <a-select-option v-for="folder in store.folders" :key="folder.id" :value="folder.id">
            {{ folder.title }}
          </a-select-option>
        </a-select>
        <a-button type="primary" html-type="submit" :disabled="!title.trim()">
          {{ existing ? "保存修改" : "添加当前页面" }}
        </a-button>
      </div>
      <p v-if="result" class="save-result" :class="{ error: failed }" role="status">{{ result }}</p>
      <p v-else-if="existing" class="hint">已添加此链接，可修改名称和保存位置。</p>
    </form>
  </section>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from "vue"
import { useSettingStore, useTopSiteStore } from "@/store"
import { getActiveTab, getFavicon, isExtension } from "@/plugins/extension"
import { normalizeSiteUrl } from "@/utils/top-site"

const store = useTopSiteStore()
store.normalize()
const setting = useSettingStore()
const title = ref("")
const url = ref("")
const folderId = ref("")
const loading = ref(true)
const unavailable = ref("")
const result = ref("")
const failed = ref(false)
const existing = computed(() => store.topSites.find(item => item.kind !== "folder" && item.url === url.value))
watch([title, folderId], () => { result.value = "" })

onMounted(async () => {
  try {
    if (!isExtension) {
      unavailable.value = "请在浏览器工具栏中打开扩展，即可添加当前页面。"
      return
    }
    const tab = await getActiveTab()
    if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
      unavailable.value = "此页面无法添加。请打开一个 HTTP 或 HTTPS 网页，浏览器内部页面不支持添加。"
      return
    }
    url.value = normalizeSiteUrl(tab.url)
    title.value = existing.value?.title || tab.title?.trim() || new URL(url.value).hostname
    folderId.value = existing.value?.folderId || ""
  } catch {
    unavailable.value = "无法读取当前页面，请关闭弹窗后重试。"
  } finally {
    loading.value = false
  }
})

function save() {
  try {
    result.value = ""
    failed.value = false
    const name = title.value.trim()
    if (!name) throw new Error("请输入名称")
    const target = folderId.value || undefined
    if (target && !store.folders.some(folder => folder.id === target)) {
      throw new Error("此文件夹已被删除，请重新选择保存位置")
    }
    const item = existing.value
    const data = {
      ...item,
      title: name,
      url: normalizeSiteUrl(url.value),
      folderId: target,
      icon: item ? item.icon : getFavicon(url.value),
      autoIcon: item?.autoIcon ?? true,
      textIcon: item?.textIcon ?? false,
      custom: true
    }
    if (item) {
      const index = store.topSites.findIndex(site => site.id === item.id)
      if (index < 0) throw new Error("此链接已被删除，请重新打开弹窗")
      store.updateTopSite({ ...data, index })
    } else {
      store.addTopSite(data)
    }
    const enabled = !setting.topSite.enable
    setting.topSite.enable = true
    const destination = store.folders.find(folder => folder.id === target)?.title || "根目录"
    result.value = `已保存到「${destination}」${enabled ? "，已开启新标签页导航" : ""}`
  } catch (error) {
    failed.value = true
    result.value = error instanceof Error ? error.message : "保存失败，请重试"
  }
}
</script>

<style lang="less" scoped>
.quick-add {
  padding: 12px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.22);

  strong { display: block; margin-bottom: 8px; }
  label { display: block; margin-bottom: 4px; font-size: 12px; }
  p { margin: 6px 0 0; font-size: 12px; }
  .page-url { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; }
  .save-row { display: flex; gap: 8px; margin-top: 10px; }
  .folder-select { flex: 1; min-width: 0; }
  .hint { color: #888; }
  .save-result { color: #389e0d; }
  .error { color: #cf1322; }
}
</style>
