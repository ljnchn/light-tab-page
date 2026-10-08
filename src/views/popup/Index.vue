<template>
  <main id="popup-layout">
    <quick-add />
    <div class="title">
      <a-select v-model:value="popup.current" aria-label="切换列表" :bordered="false" size="small">
        <a-select-option v-for="(item, index) of popupMenu" :value="index" :key="item.title">
          <span>
            <component :is="item.icon" />
            {{ item.title }}
          </span>
        </a-select-option>
      </a-select>

      <div class="action-menu" v-if="currentMenu">
        <a-tooltip v-for="item of currentMenu.actions" :key="item.title" :title="item.title">
          <a-button type="text" size="small" :aria-label="item.title" @click="item.click">
            <component :is="item.icon" />
          </a-button>
        </a-tooltip>
      </div>
    </div>

    <div v-if="currentMenu" class="content-warp">
      <transition name="fade" mode="out-in">
        <keep-alive>
          <component :is="currentMenu.component" />
        </keep-alive>
      </transition>
    </div>
  </main>
</template>

<script lang="ts" setup>
import { computed, DefineComponent, FunctionalComponent, watchEffect } from "vue"
import { useSearchStore, useSettingStore } from "@/store"
import { HistoryOutlined, RestOutlined, AppstoreOutlined } from "@ant-design/icons-vue"
import HomeTopSite from "./HomeTopSite.vue"
import SearchHistory from "./SearchHistory.vue"
import QuickAdd from "./QuickAdd.vue"
import { useI18n } from "vue-i18n"
import { storeToRefs } from "pinia"

interface ActionItem {
  title: string
  icon: FunctionalComponent
  click?: () => void
}

interface PopupMenuItem {
  title: string
  icon: FunctionalComponent
  component: DefineComponent<{}, {}, any>
  actions?: Array<ActionItem>
}

const { t } = useI18n()
const store = useSettingStore()
const { popup } = storeToRefs(store)

const popupMenu = computed<PopupMenuItem[]>(() =>
  [
    {
      title: t("popup.topsite"),
      icon: AppstoreOutlined,
      component: HomeTopSite
    },
    {
      title: t("popup.searchHistory"),
      icon: HistoryOutlined,
      component: SearchHistory,
      actions: [
        {
          title: t("common.clean"),
          icon: RestOutlined,
          click: cleanHistory
        }
      ]
    }
  ]
)

// 当前菜单
const currentMenu = computed(() => popupMenu.value[popup.value.current] || popupMenu.value[0])
watchEffect(() => {
  if (!popupMenu.value[popup.value.current]) popup.value.current = 0
})

function cleanHistory() {
  const searchStore = useSearchStore()
  searchStore.cleanHistory()
}
</script>

<style lang="less">
@title-h: 38px;

#popup-layout {
  width: 360px;
  height: 580px;
  max-height: 580px;
  display: flex;
  flex-direction: column;

  .title {
    display: flex;
    justify-content: space-between;
    align-items: center;

    height: @title-h;
    flex-shrink: 0;
    line-height: @title-h;
    padding: 0 8px;
    border-bottom: 1px solid rgba(128, 128, 128, 0.22);

    .ant-select-selector {
      padding: 0 4px;
    }

    span {
      font-size: 14px;
      font-weight: bold;
      margin-bottom: 0;
    }
  }

  .content-warp {
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
    flex: 1;
  }
}
</style>
