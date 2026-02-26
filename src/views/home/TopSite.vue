<template>
  <div class="top-site-warp">
    <div class="top-site-viewport" @wheel="onWheel">
      <div class="top-site-track" :style="trackStyle">
        <div v-for="(page, pageIdx) in pages" :key="pageIdx" class="top-site-page">
          <transition-group class="top-site-grid" name="flip-list" tag="ul">
            <li
              v-for="(item, localIdx) in page"
              :key="item.url"
              :class="['top-site-item', { hide: data.currentDrag === toGlobalIndex(pageIdx, localIdx) }]"
              :title="item.title"
              @contextmenu.prevent.stop="openEditModal(toGlobalIndex(pageIdx, localIdx))"
            >
              <icon
                class="top-site-icon"
                :text-icon="item.textIcon"
                :src="item.icon"
                :title="item.title"
                :size="topSiteSetting.iconSize"
                draggable="true"
                @click="openPage(item.url)"
                @dragstart="onDragIcon(DragType.start, toGlobalIndex(pageIdx, localIdx))"
                @dragenter="onDragIcon(DragType.enter, toGlobalIndex(pageIdx, localIdx))"
                @dragover.prevent
                @dragend="onDragIcon(DragType.end, toGlobalIndex(pageIdx, localIdx))"
              >
                <div class="icon-board"></div>
              </icon>

              <div class="icon-title">
                <span>{{ item.title }}</span>
              </div>
            </li>

            <li
              v-if="pageIdx === pages.length - 1"
              key="__add_button__"
              class="top-site-item"
              :title="t('topsite.add')"
            >
              <icon
                class="top-site-icon"
                title="＋"
                :size="48"
                textIcon
                @click="openAddModal"
              >
                <div class="icon-board"></div>
              </icon>

              <div class="icon-title">
                <span>{{ t("topsite.add") }}</span>
              </div>
            </li>
          </transition-group>
        </div>
      </div>
    </div>

    <div v-if="totalPages > 1" class="page-indicators">
      <span
        v-for="i in totalPages"
        :key="i"
        :class="['indicator-dot', { active: data.currentPage === i - 1 }]"
        @click="data.currentPage = i - 1"
      />
    </div>

    <a-modal
      v-model:visible="data.showModal"
      :title="data.editingIndex >= 0 ? t('topsite.edit') : t('topsite.add')"
      :width="500"
      centered
      destroy-on-close
    >
      <a-form :model="topSite" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="网站URL" v-bind="validateInfos.url">
          <a-input v-model:value="topSite.url" placeholder="https://example.com" @blur="onUrlBlur" />
        </a-form-item>
        <a-form-item label="网站标题" v-bind="validateInfos.title">
          <a-input v-model:value="topSite.title" placeholder="标题">
            <template v-if="data.fetchingTitle" #suffix>
              <loading-outlined />
            </template>
          </a-input>
        </a-form-item>
        <a-form-item label="自动获取图标">
          <a-switch v-model:checked="topSite.autoIcon" />
        </a-form-item>
        <a-form-item v-if="!topSite.autoIcon" label="文字图标">
          <a-switch v-model:checked="topSite.textIcon" />
        </a-form-item>
        <a-form-item
          v-if="!(topSite.autoIcon || topSite.textIcon)"
          label="图标URL"
          v-bind="validateInfos.icon"
        >
          <a-input v-model:value="topSite.icon" placeholder="图标URL" />
        </a-form-item>
      </a-form>

      <template #footer>
        <div class="modal-footer">
          <div>
            <a-button v-if="data.editingIndex >= 0" danger @click="onDeleteTopSite">
              {{ t("topsite.delete") }}
            </a-button>
          </div>
          <div>
            <a-button @click="data.showModal = false">取消</a-button>
            <a-button type="primary" @click="onSaveTopSite">保存</a-button>
          </div>
        </div>
      </template>
    </a-modal>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeMount, reactive, watch } from "vue"
import { DragType, SortData, TopSiteItem, TopSites } from "@/types"
import { OpenPageTarget } from "@/types/search"
import { useSettingStore, useTopSiteStore } from "@/store"
import { useI18n } from "vue-i18n"
import { Form } from "ant-design-vue"
import { LoadingOutlined } from "@ant-design/icons-vue"
import { getFavicon } from "@/plugins/extension"
import { storeToRefs } from "pinia"

const { t } = useI18n()
const settingStore = useSettingStore()
const topSiteStore = useTopSiteStore()
const { topSite: topSiteSetting } = storeToRefs(settingStore)

const pageSize = computed(() => topSiteSetting.value.col * topSiteSetting.value.row)

const pages = computed<TopSites[]>(() => {
  const all = topSiteStore.topSites
  const size = pageSize.value
  const result: TopSites[] = []
  for (let i = 0; i < all.length; i += size) {
    result.push(all.slice(i, i + size))
  }
  if (result.length === 0) {
    result.push([])
  } else if (result[result.length - 1].length >= size) {
    result.push([])
  }
  return result
})

const totalPages = computed(() => pages.value.length)

const data = reactive({
  currentPage: 0,
  currentDrag: -1,
  showModal: false,
  editingIndex: -1,
  fetchingTitle: false
})

watch(totalPages, newTotal => {
  if (data.currentPage >= newTotal) {
    data.currentPage = Math.max(0, newTotal - 1)
  }
})

const trackStyle = computed(() => ({
  transform: `translateX(-${data.currentPage * 100}%)`,
  transition: "transform 0.3s ease"
}))

const primaryColor = computed(() => settingStore.theme.primaryColor)

function toGlobalIndex(pageIdx: number, localIdx: number): number {
  return pageIdx * pageSize.value + localIdx
}

let lastWheelTime = 0
function onWheel(e: WheelEvent) {
  if (totalPages.value <= 1) return
  e.preventDefault()

  const now = Date.now()
  if (now - lastWheelTime < 300) return

  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
  if (delta > 0 && data.currentPage < totalPages.value - 1) {
    data.currentPage++
    lastWheelTime = now
  } else if (delta < 0 && data.currentPage > 0) {
    data.currentPage--
    lastWheelTime = now
  }
}

const topSite = reactive({
  title: "",
  url: "",
  icon: "",
  textIcon: false,
  autoIcon: true
})

const rules = reactive({
  title: [{ required: true, message: "请输入名称" }],
  url: [{ required: true, message: "请输入地址URL", type: "url" }],
  icon: [{ required: false, message: "请输入图标URL", type: "url" }]
})

const { validate, resetFields, validateInfos } = Form.useForm(topSite, rules)

function openPage(url: string) {
  window.open(url, OpenPageTarget.Blank)
}

function openAddModal() {
  resetFields()
  data.editingIndex = -1
  data.showModal = true
}

function openEditModal(globalIdx: number) {
  const item = topSiteStore.topSites[globalIdx]
  if (!item) return

  data.editingIndex = globalIdx
  topSite.title = item.title
  topSite.url = item.url
  topSite.textIcon = item.textIcon

  if (item.icon && !item.icon.startsWith("chrome-extension://")) {
    topSite.autoIcon = false
    topSite.icon = item.icon
  } else {
    topSite.autoIcon = !item.textIcon
    topSite.icon = ""
  }

  data.showModal = true
}

async function onSaveTopSite() {
  try {
    await validate()
    const icon = topSite.autoIcon
      ? getFavicon(topSite.url)
      : topSite.textIcon
        ? undefined
        : topSite.icon || undefined

    const itemData: TopSiteItem = {
      title: topSite.title,
      url: topSite.url,
      icon,
      textIcon: !topSite.autoIcon && topSite.textIcon,
      custom: true
    }

    if (data.editingIndex >= 0) {
      topSiteStore.updateTopSite({ ...itemData, index: data.editingIndex })
    } else {
      topSiteStore.addTopSite(itemData)
    }

    resetFields()
    data.showModal = false
  } catch {}
}

function onDeleteTopSite() {
  if (data.editingIndex >= 0) {
    topSiteStore.deleteTopSite(data.editingIndex)
    data.showModal = false
  }
}

async function fetchPageTitle(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: "text/html" }
    })
    const html = await resp.text()
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    if (match) return match[1].trim()
  } catch {
    // CORS / network / timeout
  }
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

async function onUrlBlur() {
  const url = topSite.url?.trim()
  if (!url || topSite.title) return

  data.fetchingTitle = true
  try {
    const title = await fetchPageTitle(url)
    if (title && !topSite.title) {
      topSite.title = title
    }
  } finally {
    data.fetchingTitle = false
  }
}

function onDragIcon(type: DragType, globalIdx: number) {
  switch (type) {
    case DragType.start:
      data.currentDrag = globalIdx
      return
    case DragType.enter:
      if (data.currentDrag === globalIdx) return
      const sortData: SortData = {
        from: data.currentDrag,
        to: globalIdx
      }

      topSiteStore.sortTopSites(sortData)
      data.currentDrag = globalIdx
      return
    case DragType.end:
      data.currentDrag = -1
      return
  }
}

async function init() {
  topSiteStore.refreshIconUrls()
  if (!topSiteStore.lastUpdateTime) {
    await topSiteStore.syncBrowserTopSites()
  }
}

onBeforeMount(init)
</script>

<style lang="less">
@item-size-max: 128px;
@col: v-bind("topSiteSetting.col");
@row: v-bind("topSiteSetting.row");
@gap: v-bind("`${topSiteSetting.gap}px`");
@board-size: v-bind("`${topSiteSetting.boardSize}px`");
@board-color: v-bind("topSiteSetting.boardColor");
@board-opacity: v-bind("topSiteSetting.boardOpacity");
@board-radius: v-bind("`${topSiteSetting.boardRadius}px`");
@primary-color: v-bind("primaryColor");

.top-site-warp {
  width: calc(@col * @item-size-max + (@col - 1) * @gap);

  .top-site-viewport {
    height: calc(@row * @item-size-max + (@row - 1) * @gap);
    overflow: hidden;
  }

  .top-site-track {
    display: flex;
    height: 100%;
  }

  .top-site-page {
    flex: 0 0 100%;
    width: 100%;
  }

  .top-site-grid {
    display: grid;
    grid-template-columns: repeat(@col, @item-size-max);
    grid-template-rows: repeat(@row, @item-size-max);
    gap: @gap;
  }

  .top-site-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    row-gap: 8px;

    &.hide {
      opacity: 0;
    }

    &.flip-list-enter-from,
    &.flip-list-leave-to {
      transform: translateY(@board-size);
    }

    .top-site-icon {
      width: @board-size;
      height: @board-size;
      cursor: pointer;

      .icon-board {
        height: 100%;
        background-color: @board-color;
        opacity: @board-opacity;
        border-radius: @board-radius;
      }
    }

    .icon-title {
      display: inline-block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: @item-size-max;
      text-align: center;
      user-select: none;
    }
  }

  .page-indicators {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 6px;
    padding-top: 12px;

    .indicator-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background-color: rgba(128, 128, 128, 0.3);
      cursor: pointer;
      transition: all 0.3s ease;

      &.active {
        background-color: @primary-color;
        width: 20px;
        border-radius: 4px;
      }
    }
  }
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

[data-theme="dark"] {
  .top-site-warp {
    .top-site-item {
      .icon-board {
        background-color: #1f1f1f !important;
        transition: background-color 0.3s ease;
      }
    }

    .page-indicators .indicator-dot {
      background-color: rgba(255, 255, 255, 0.2);
    }
  }
}
</style>
