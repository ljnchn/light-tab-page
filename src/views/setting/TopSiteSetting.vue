<template>
  <div class="top-site-setting">
    <setting-item horizontal>
      <template #lable>
        {{ t("topsite.topSiteData") }}
        <span style="font-size: 10px; color: #a0a0a0">
          ({{ t("topsite.topSiteDataTip", [lastUpdateTime]) }})
        </span>
      </template>

      <a-button :loading="state.syncing" :disabled="!isExtension" @click="syncBrowserTopSites">
        {{ t("topsite.sync") }}
      </a-button>
    </setting-item>

    <setting-item :lable="t('topsite.iconSize')" horizontal>
      <a-slider
        class="horizontal-item"
        v-model:value="topSite.iconSize"
        :min="16"
        :max="topSite.boardSize"
        :step="8"
        :tipFormatter="toPixel"
      />
    </setting-item>

    <setting-item :lable="t('topsite.boardSize')" horizontal>
      <a-slider
        class="horizontal-item"
        v-model:value="topSite.boardSize"
        :min="16"
        :max="96"
        :step="8"
        :tipFormatter="toPixel"
      />
    </setting-item>
    <setting-item :lable="t('topsite.boardOpacity')" horizontal>
      <a-slider
        class="horizontal-item"
        v-model:value="topSite.boardOpacity"
        :step="0.01"
        :max="1"
        :tipFormatter="toPercent"
      />
    </setting-item>
    <setting-item :lable="t('topsite.boardRound')" horizontal>
      <a-slider
        class="horizontal-item"
        v-model:value="topSite.boardRadius"
        :max="(topSite.boardSize ?? 0) / 2"
        :tipFormatter="toPixel"
      />
    </setting-item>
  </div>
</template>

<script lang="ts" setup>
import { toPixel, toPercent } from "@/utils/format"
import { useSettingStore, useTopSiteStore } from "@/store"
import { computed, reactive } from "vue"
import { message } from "ant-design-vue"
import { isExtension, Permis, requestPermissions } from "@/plugins/extension"
import dayjs from "@/plugins/dayjs"
import { useI18n } from "vue-i18n"
import { storeToRefs } from "pinia"

const { t } = useI18n()
const settingStore = useSettingStore()
const topSiteStore = useTopSiteStore()
const { topSite } = storeToRefs(settingStore)

const state = reactive({ syncing: false })
const lastUpdateTime = computed(() => topSiteStore.lastUpdateTime ? dayjs(topSiteStore.lastUpdateTime).fromNow() : "尚未同步")

/**
 * 同步浏览器最近浏览
 */
async function syncBrowserTopSites() {
  if (state.syncing || !isExtension) return
  state.syncing = true
  try {
    // Request directly inside the click handler to retain the browser user gesture.
    if (!(await requestPermissions(Permis.topSite))) {
      message.info("需要允许读取常用网站，才能同步浏览器导航")
      return
    }
    await topSiteStore.syncBrowserTopSites()
    message.success("浏览器导航已同步，已添加的链接和文件夹已保留")
  } catch (error) {
    message.error(error instanceof Error ? error.message : "同步失败，请重试")
  } finally { state.syncing = false }
}
</script>

<style lang="less">
.top-site-setting {
  .horizontal-item {
    width: 210px;
  }
}
</style>
