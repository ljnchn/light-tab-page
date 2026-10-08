<template>
  <div class="home-top-site-layout">
    <div v-if="currentFolder" class="folder-header">
      <a-button type="text" size="small" @click="folderId = ''">← 返回</a-button>
      <strong>{{ currentFolder.title }}</strong>
    </div>
    <p v-if="!visibleSites.length" class="empty-folder">
      {{ currentFolder ? "此文件夹还没有链接" : "还没有链接，添加当前页面即可开始" }}
    </p>
    <ul class="home-top-site-grid">
      <li v-for="item of visibleSites" :key="item.id || item.url">
        <button
          class="home-top-site-item"
          type="button"
          :title="item.kind === 'folder' ? `打开文件夹：${item.title}` : item.url"
          @click="openItem(item)"
        >
          <folder-preview
            v-if="item.kind === 'folder'"
            :items="topSites.filter(link => link.folderId === item.id)"
            :size="40"
          />
          <icon
            v-else
            class="home-top-site-icon"
            :text-icon="item.textIcon"
            :src="item.icon"
            :title="item.title"
          />

          <div class="icon-title">
            <span>{{ item.title }}</span>
          </div>
        </button>
      </li>
    </ul>
  </div>
</template>

<script lang="ts" setup>
import { useTopSiteStore } from "@/store"
import { OpenPageTarget } from "@/types/search"
import { storeToRefs } from "pinia"
import { computed, ref, watchEffect } from "vue"
import FolderPreview from "@/components/FolderPreview.vue"
import type { TopSiteItem } from "@/types"
import { normalizeSiteUrl } from "@/utils/top-site"

const store = useTopSiteStore()
const { topSites } = storeToRefs(store)

const folderId = ref("")
const currentFolder = computed(() => store.folders.find(item => item.id === folderId.value))
const visibleSites = computed(() => topSites.value.filter(item =>
  folderId.value ? item.kind !== "folder" && item.folderId === folderId.value : !item.folderId
))
watchEffect(() => {
  if (folderId.value && !currentFolder.value) folderId.value = ""
})

function openItem(item: TopSiteItem) {
  if (item.kind === "folder") {
    folderId.value = item.id || ""
    return
  }
  try {
    window.open(normalizeSiteUrl(item.url), OpenPageTarget.Blank, "noopener,noreferrer")
  } catch {
    // Invalid legacy links are removed when the shared store normalizes its data.
  }
}
</script>

<style lang="less">
.home-top-site-layout {
  padding: 8px;

  .folder-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .folder-header strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty-folder { color: #888; font-size: 12px; padding: 16px 4px; text-align: center; }

  .home-top-site-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: 92px;
    gap: 8px;
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .home-top-site-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    row-gap: 8px;
    cursor: pointer;
    width: 100%;
    height: 100%;
    padding: 4px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    border-radius: 8px;

    &:hover {
      background-color: rgba(128, 128, 128, 0.15);
    }

    &:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }

    .home-top-site-icon {
      height: 32px;
      width: 32px;
    }

    .icon-title {
      display: inline-block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 72px;
      font-size: 12px;
      text-align: center;
      user-select: none;
    }
  }
}
</style>
