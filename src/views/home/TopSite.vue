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
            >
              <icon
                :class="['top-site-icon', { 'shake-active': data.shake }]"
                :text-icon="item.textIcon"
                :src="item.icon"
                :title="item.title"
                :size="topSiteSetting.iconSize"
                draggable="true"
                @click="openPage(item.url)"
                @contextmenu.prevent.stop="openEditStatus"
                @dragstart="onDragIcon(DragType.start, toGlobalIndex(pageIdx, localIdx))"
                @dragenter="onDragIcon(DragType.enter, toGlobalIndex(pageIdx, localIdx))"
                @dragover.prevent
                @dragend="onDragIcon(DragType.end, toGlobalIndex(pageIdx, localIdx))"
              >
                <div class="icon-board"></div>

                <transition name="scale">
                  <sup
                    v-show="data.editStatus"
                    class="bubble-delete"
                    @click.stop="topSiteStore.deleteTopSite(toGlobalIndex(pageIdx, localIdx))"
                  ></sup>
                </transition>
              </icon>

              <div class="icon-title">
                <span>{{ item.title }}</span>
              </div>
            </li>

            <li
              v-if="pageIdx === pages.length - 1"
              v-show="!data.shake"
              key="__add_button__"
              class="top-site-item"
              :title="t('topsite.add')"
            >
              <icon
                class="top-site-icon"
                title="＋"
                :size="48"
                textIcon
                @click="data.showAddModal = true"
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
      v-model:visible="data.showAddModal"
      :title="t('topsite.add')"
      :width="500"
      centered
      destroy-on-close
      ok-text="保存"
      cancel-text="取消"
      @ok="onSaveCustomTopSite"
    >
      <a-form :model="topSite" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }" ref="formRef">
        <a-form-item label="网站标题" v-bind="validateInfos.title">
          <a-input v-model:value="topSite.title" placeholder="标题" />
        </a-form-item>
        <a-form-item label="网站URL" v-bind="validateInfos.url">
          <a-input v-model:value="topSite.url" placeholder="URL" />
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
  shake: false,
  editStatus: false,
  showAddModal: false
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

function openEditStatus() {
  data.shake = true
  data.editStatus = true

  document.body.addEventListener("click", closeEditStatus)
}

function closeEditStatus(e: Event) {
  if (data.editStatus) {
    e.stopPropagation()

    data.shake = false
    data.editStatus = false
    document.body.removeEventListener("click", closeEditStatus)
  }
}

function onDragIcon(type: DragType, globalIdx: number) {
  switch (type) {
    case DragType.start:
      data.currentDrag = globalIdx
      openEditStatus()
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

async function onSaveCustomTopSite() {
  try {
    await validate()
    const icon = topSite.autoIcon ? getFavicon(topSite.url) : undefined
    const customData: TopSiteItem = {
      ...topSite,
      custom: true,
      icon
    }
    topSiteStore.addTopSite(customData)

    resetFields()
    data.showAddModal = false
  } catch {}
}

async function init() {
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

      &.shake-active {
        animation: shake 0.3s infinite;
      }

      .icon-board {
        height: 100%;
        background-color: @board-color;
        opacity: @board-opacity;
        border-radius: @board-radius;
      }

      .bubble-delete {
        width: 18px;
        height: 18px;

        position: absolute;
        top: -9px;
        right: -9px;
        color: #f5f5f5;
        background-color: #f5222d;
        text-align: center;
        line-height: 18px;
        font-size: 12px;
        border-radius: 50%;

        &::before {
          content: "X";
        }
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
