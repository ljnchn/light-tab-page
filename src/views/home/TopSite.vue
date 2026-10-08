<template>
  <div class="top-site-warp" :class="{ 'drag-active': !!data.currentDragId }" :style="siteStyle">
    <div class="top-site-viewport" @wheel="onWheel">
      <div class="top-site-track" :style="trackStyle">
        <div v-for="(page, pageIdx) in pages" :key="pageIdx" class="top-site-page" :aria-hidden="pageIdx !== data.currentPage">
          <transition-group class="top-site-grid" name="flip-list" tag="ul" @before-leave="pinLeavingTile" @leave-cancelled="clearLeavingTile">
            <li v-for="item in page" :key="item.id" class="top-site-item" :class="dropClasses(item)"
              @dragenter="onDragOver(item, $event)" @dragover="onDragOver(item, $event)" @dragleave="onDragLeave(item, $event)" @drop="onDrop(item, $event)">
              <button
                type="button" class="top-site-icon" :class="{ 'folder-tile': item.kind === 'folder', 'folder-expanded': item.kind === 'folder' && item.id === data.folderId }" :title="`${item.title} · 右键管理`" :aria-label="item.kind === 'folder' ? `打开文件夹：${item.title}` : item.title"
                :tabindex="pageIdx === data.currentPage ? 0 : -1" draggable="true"
                @click="openItem(item, $event)" @contextmenu.prevent.stop="data.editStatus = true"
                @dragstart="onDragStart(item, $event)" @dragend="endDrag"
              >
                <folder-preview v-if="item.kind === 'folder'" :items="folderContents[item.id!] || []" :size="topSiteSetting.boardSize" />
                <icon v-else class="site-image" :text-icon="item.textIcon" :src="item.icon" :title="item.title" :size="topSiteSetting.iconSize" />
                <span v-if="item.kind !== 'folder'" class="icon-board"></span>
              </button>
              <transition name="control-reveal"><div v-if="data.editStatus" class="site-actions">
                <button type="button" :tabindex="pageIdx === data.currentPage ? 0 : -1" :aria-label="`编辑 ${item.title}`" title="编辑" @click="openEditModal(item)"><edit-outlined /></button>
                <button type="button" :tabindex="pageIdx === data.currentPage ? 0 : -1" :aria-label="`删除 ${item.title}`" title="删除" @click="deleteItem(item)"><delete-outlined /></button>
              </div></transition>
              <div class="icon-title" :title="item.title">{{ item.title }}</div>
              <transition name="control-reveal"><span v-if="data.dropTargetId === item.id && data.dropPlacement === 'inside'" class="drop-hint">松开移入文件夹</span></transition>
            </li>
            <li v-if="pageIdx === Math.floor(rootSites.length / pageSize)" key="__add_button__" class="top-site-item">
              <button type="button" class="top-site-icon" :tabindex="pageIdx === data.currentPage ? 0 : -1" :aria-label="t('topsite.add')" @click="openAddModal()">
                <plus-outlined class="folder-symbol" /><span class="icon-board"></span>
              </button>
              <div class="icon-title">{{ t("topsite.add") }}</div>
            </li>
            <li v-if="pageIdx === Math.floor((rootSites.length + 1) / pageSize)" key="__add_folder__" class="top-site-item">
              <button type="button" class="top-site-icon" :tabindex="pageIdx === data.currentPage ? 0 : -1" aria-label="添加文件夹" @click="openFolderEditor()">
                <folder-add-outlined class="folder-symbol" /><span class="icon-board"></span>
              </button>
              <div class="icon-title">添加文件夹</div>
            </li>
          </transition-group>
        </div>
      </div>
    </div>
    <div v-if="totalPages > 1" class="page-indicators" aria-label="链接分页">
      <button v-for="i in totalPages" :key="i" type="button" :aria-label="`第 ${i} 页`" :aria-current="data.currentPage === i - 1 ? 'page' : undefined" :class="['indicator-dot', { active: data.currentPage === i - 1 }]" @click="data.currentPage = i - 1" @dragover="onPageDragOver(i - 1, $event)" />
    </div>

    <a-modal :open="data.folderOpen" :title="folderView?.folder.title" :footer="null" :width="folderWidth" :style="folderMotion" centered
      :wrap-class-name="`folder-glass-dialog${data.currentDragId ? ' drag-active' : ''}`" transition-name="folder-panel" mask-transition-name="folder-shade"
      :mask-style="folderShadeStyle" @cancel="closeFolder" @after-close="clearFolderView">
      <div class="folder-toolbar">
        <span class="folder-count">{{ folderLinks.length }} 个链接</span>
        <a-button type="text" @click="openAddModal(data.folderId)"><plus-outlined /> 添加链接</a-button>
        <a-button v-if="data.editStatus" type="text" @click="openFolderEditor(activeFolder)">重命名</a-button>
        <a-button v-if="data.editStatus" type="text" danger @click="activeFolder && deleteItem(activeFolder)">删除文件夹</a-button>
      </div>
      <div ref="folderContent" class="folder-content" :style="siteStyle">
      <transition-group class="folder-links" name="folder-items" tag="ul" @before-leave="pinLeavingTile" @leave-cancelled="clearLeavingTile">
        <li v-for="item in folderLinks" :key="item.id" class="top-site-item" :class="dropClasses(item)"
          @dragenter="onDragOver(item, $event)" @dragover="onDragOver(item, $event)" @dragleave="onDragLeave(item, $event)" @drop="onDrop(item, $event)">
          <button type="button" class="top-site-icon folder-link" :title="item.url" :aria-label="item.title" draggable="true"
            @click="openItem(item)" @contextmenu.prevent.stop="data.editStatus = true" @dragstart="onDragStart(item, $event)" @dragend="endDrag">
            <icon class="site-image" :text-icon="item.textIcon" :src="item.icon" :title="item.title" :size="topSiteSetting.iconSize" />
            <span class="icon-board"></span>
          </button>
          <div class="icon-title" :title="item.title">{{ item.title }}</div>
          <transition name="control-reveal"><div v-if="data.editStatus" class="folder-link-actions">
            <button type="button" :aria-label="`编辑 ${item.title}`" title="编辑" @click="openEditModal(item)"><edit-outlined /></button>
            <button type="button" :aria-label="`移出 ${item.title}`" title="移回主页" @click="moveOut(item)"><export-outlined /></button>
            <button type="button" :aria-label="`删除 ${item.title}`" title="删除" @click="deleteItem(item)"><delete-outlined /></button>
          </div></transition>
        </li>
      </transition-group>
      <transition name="control-reveal"><div v-if="!folderLinks.length" class="folder-empty"><folder-open-outlined /><p>文件夹还是空的</p><span>把主页上的链接拖到文件夹图标，即可收纳到这里</span></div></transition>
      </div>
      <div class="folder-footer"><div v-if="draggedSite?.folderId === data.folderId" class="folder-drop-home" :class="{ active: data.dropHome }"
        @dragenter.prevent="data.dropHome = true" @dragover.prevent="data.dropHome = true" @dragleave="leaveHomeDrop($event)" @drop.prevent.stop="dropToHome">
        <export-outlined /> 松开移回主页
      </div>
      <p v-else class="folder-tip">{{ data.editStatus ? '点击空白处或按 Esc 退出管理' : '右键管理 · 拖动排序或移回主页' }}</p>
      </div>
    </a-modal>
    <span class="sr-only" role="status" aria-live="polite">{{ dragAnnouncement }}</span>

    <a-modal v-model:visible="data.showFolderEditor" :title="data.editingFolderId ? '重命名文件夹' : '新建文件夹'" ok-text="保存" cancel-text="取消" :width="420" @ok="onSaveFolder">
      <a-form layout="vertical">
        <a-form-item label="文件夹名称" :validate-status="data.folderError ? 'error' : undefined" :help="data.folderError || undefined">
          <a-input v-model:value="data.folderName" placeholder="例如：工作、学习" :maxlength="80" @pressEnter="onSaveFolder" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:visible="data.showModal" :title="data.editingId ? t('topsite.edit') : t('topsite.add')" :width="500" centered destroy-on-close ok-text="保存" cancel-text="取消" :confirm-loading="data.saving" @ok="onSaveTopSite" @cancel="titleRequest++">
      <a-form :model="topSite" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="网站URL" v-bind="validateInfos.url">
          <a-input v-model:value="topSite.url" placeholder="https://example.com" @blur="onUrlBlur" />
        </a-form-item>
        <a-form-item label="网站标题" v-bind="validateInfos.title">
          <a-input v-model:value="topSite.title" placeholder="标题">
            <template v-if="data.fetchingTitle" #suffix><loading-outlined /></template>
          </a-input>
        </a-form-item>
        <a-form-item label="所在文件夹">
          <a-select v-model:value="topSite.folderId">
            <a-select-option value="">主页</a-select-option>
            <a-select-option v-for="folder in topSiteStore.folders" :key="folder.id" :value="folder.id">{{ folder.title }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="自动获取图标"><a-switch v-model:checked="topSite.autoIcon" /></a-form-item>
        <a-form-item v-if="!topSite.autoIcon" label="文字图标"><a-switch v-model:checked="topSite.textIcon" /></a-form-item>
        <a-form-item v-if="!(topSite.autoIcon || topSite.textIcon)" label="图标URL" v-bind="validateInfos.icon">
          <a-input v-model:value="topSite.icon" placeholder="https://example.com/icon.png" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeMount, onBeforeUnmount, reactive, ref, shallowRef, watch } from "vue"
import type { CSSProperties } from "vue"
import type { TopSiteItem, TopSites } from "@/types"
import { useSettingStore, useTopSiteStore } from "@/store"
import { useI18n } from "vue-i18n"
import { Form, Modal, message } from "ant-design-vue"
import { LoadingOutlined, EditOutlined, DeleteOutlined, FolderOpenOutlined, FolderAddOutlined, PlusOutlined, ExportOutlined } from "@ant-design/icons-vue"
import FolderPreview from "@/components/FolderPreview.vue"
import { getFavicon } from "@/plugins/extension"
import { normalizeSiteUrl } from "@/utils/top-site"
import { storeToRefs } from "pinia"

const { t } = useI18n()
const settingStore = useSettingStore()
const topSiteStore = useTopSiteStore()
const { topSite: topSiteSetting } = storeToRefs(settingStore)
const primaryColor = computed(() => settingStore.theme.primaryColor)
// Ant's portal lives outside the page root, so pass the same settings to both grids.
const siteStyle = computed(() => ({
  '--site-cols': topSiteSetting.value.col,
  '--site-rows': topSiteSetting.value.row,
  '--site-gap': `${topSiteSetting.value.gap}px`,
  '--site-board-size': `${topSiteSetting.value.boardSize}px`,
  '--site-board-color': topSiteSetting.value.boardColor,
  '--site-board-opacity': topSiteSetting.value.boardOpacity,
  '--site-board-radius': `${topSiteSetting.value.boardRadius}px`,
  '--site-primary-color': primaryColor.value
}))
const folderWidth = computed(() => topSiteSetting.value.col * 128 + (topSiteSetting.value.col - 1) * topSiteSetting.value.gap + 66)
const data = reactive({ currentPage: 0, currentDragId: "", dropTargetId: "", dropPlacement: "before" as "before" | "after" | "inside", dropHome: false, editStatus: false, showModal: false, editingId: "",
  fetchingTitle: false, saving: false, folderId: "", folderOpen: false, showFolderEditor: false, editingFolderId: "", folderName: "", folderError: "" })
const pageSize = computed(() => Math.max(1, Math.floor(topSiteSetting.value.col * topSiteSetting.value.row) || 1))
const rootSites = computed(() => topSiteStore.topSites.filter(item => !item.folderId))
const pages = computed<TopSites[]>(() => {
  const all = rootSites.value
  const result: TopSites[] = []
  // Both creation shortcuts occupy a grid slot, including at a page boundary.
  for (let i = 0; i < all.length + 2; i += pageSize.value) result.push(all.slice(i, i + pageSize.value))
  return result
})
const totalPages = computed(() => pages.value.length)
watch(totalPages, count => { data.currentPage = Math.min(data.currentPage, count - 1) })
const trackStyle = computed(() => ({ transform: `translateX(-${data.currentPage * 100}%)` }))
const activeFolder = computed(() => topSiteStore.folders.find(item => item.id === data.folderId))
const folderContents = computed(() => {
  const contents: Record<string, TopSites> = Object.create(null)
  for (const item of topSiteStore.topSites) {
    if (item.folderId && item.kind !== "folder") (contents[item.folderId] ||= []).push(item)
  }
  return contents
})
// Preserve the last displayed content until the closing animation finishes.
const folderView = ref<{ folder: TopSiteItem; links: TopSites }>()
const folderLinks = computed(() => folderView.value?.links || [])
watch([activeFolder, folderContents], ([folder, contents]) => {
  if (folder) folderView.value = { folder, links: contents[folder.id!] || [] }
  else closeFolder()
})
const draggedSite = computed(() => topSiteStore.topSites.find(item => item.id === data.currentDragId))
const dragAnnouncement = ref("")
let suppressClickUntil = 0
const folderContent = ref<HTMLElement>()
let folderTrigger: HTMLElement | undefined
let folderOpeningFrame: CSSProperties = {}
const folderMotion = shallowRef<CSSProperties>({ transformOrigin: '0 0' })
const folderShadeStyle = reactive<CSSProperties>({ backgroundColor: 'rgba(8, 12, 20, 0.16)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' })
const folderDetails = '.ant-modal-header, .folder-toolbar, .folder-footer, .folder-empty, .ant-modal-close, .folder-links > li:nth-child(-n+24)'
watch([folderContent, () => data.folderOpen], async ([, open], _previous, onCleanup) => {
  if (!open) return
  let active = true
  onCleanup(() => { active = false })
  // Ant restores its previously hidden portal in its own post-render watcher.
  await nextTick()
  if (active && data.folderOpen) prepareFolderMotion()
}, { flush: 'post' })

function openItem(item: TopSiteItem, event?: MouseEvent) {
  if (Date.now() < suppressClickUntil) return
  if (data.editStatus) return exitEditStatus()
  if (item.kind === "folder") {
    const panel = folderContent.value?.closest<HTMLElement>('.ant-modal')
    const reversing = panel?.classList.contains('folder-panel-leave')
    folderOpeningFrame = reversing && panel ? {
      '--folder-open-transform': getComputedStyle(panel).transform,
      '--folder-open-opacity': getComputedStyle(panel).opacity,
      '--folder-open-radius': getComputedStyle(panel.querySelector('.ant-modal-content')!).borderRadius
    } : {}
    if (panel) captureFolderDetails(panel, 'open', !!reversing)
    const shade = panel?.closest('.ant-modal-root')?.querySelector('.ant-modal-mask')
    folderShadeStyle['--folder-shade-open-opacity'] = reversing && shade ? getComputedStyle(shade).opacity : '0'
    folderMotion.value = { transformOrigin: '0 0', ...folderOpeningFrame }
    folderTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : undefined
    data.folderId = item.id!
    data.folderOpen = true
  }
  else window.open(item.url, "_blank", "noopener,noreferrer")
}

function captureFolderDetails(panel: HTMLElement, phase: 'open' | 'close', capture = true) {
  for (const detail of panel.querySelectorAll<HTMLElement>(folderDetails)) {
    const current = getComputedStyle(detail)
    if (capture) {
      detail.style.setProperty(`--folder-detail-${phase}-opacity`, current.opacity)
      detail.style.setProperty(`--folder-detail-${phase}-transform`, current.transform)
    } else {
      detail.style.removeProperty(`--folder-detail-${phase}-opacity`)
      detail.style.removeProperty(`--folder-detail-${phase}-transform`)
    }
  }
}

function prepareFolderMotion(closing = false) {
  const panel = folderContent.value?.closest<HTMLElement>('.ant-modal')
  if (!panel || !panel.offsetWidth || !panel.offsetHeight) return
  const surface = panel.querySelector<HTMLElement>('.ant-modal-content')!
  const motion: CSSProperties = { transformOrigin: '0 0', ...folderOpeningFrame }
  if (closing) {
    // Start closing at the current frame, even when opening has not finished yet.
    const current = getComputedStyle(panel)
    motion['--folder-close-transform'] = current.transform
    motion['--folder-close-opacity'] = current.opacity
    motion['--folder-close-radius'] = getComputedStyle(surface).borderRadius
    captureFolderDetails(panel, 'close')
    const shade = panel.closest('.ant-modal-root')?.querySelector('.ant-modal-mask')
    folderShadeStyle['--folder-shade-close-opacity'] = shade ? getComputedStyle(shade).opacity : '1'
  }
  const origin = folderTrigger?.isConnected ? folderTrigger.getBoundingClientRect() : undefined
  if (origin && origin.width > 0 && origin.height > 0 && origin.right > 0 && origin.left < window.innerWidth && origin.bottom > 0 && origin.top < window.innerHeight) {
    // Offset geometry is unaffected by the transform already running on the panel.
    const parent = panel.offsetParent as HTMLElement | null
    const parentRect = parent?.getBoundingClientRect()
    const left = panel.offsetLeft + (parentRect?.left || 0) + (parent?.clientLeft || 0) - (parent?.scrollLeft || 0)
    const top = panel.offsetTop + (parentRect?.top || 0) + (parent?.clientTop || 0) - (parent?.scrollTop || 0)
    const sx = origin.width / panel.offsetWidth
    const sy = origin.height / panel.offsetHeight
    const preview = folderTrigger!.querySelector<HTMLElement>('.folder-preview')
    const radius = parseFloat(getComputedStyle(preview || folderTrigger!).borderRadius) || 16
    motion['--folder-from-transform'] = `translate3d(${origin.left - left}px, ${origin.top - top}px, 0) scale(${sx}, ${sy})`
    motion['--folder-from-radius'] = `${radius / sx}px / ${radius / sy}px`
  }
  folderMotion.value = motion
}

function exitEditStatus() {
  data.editStatus = false
}

function pinLeavingTile(element: Element) {
  const tile = element as HTMLElement
  // Keep the departing tile in place while its siblings start moving immediately.
  const { offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height } = tile
  Object.assign(tile.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` })
}

function clearLeavingTile(element: Element) {
  for (const property of ["left", "top", "width", "height"]) (element as HTMLElement).style.removeProperty(property)
}

function onManagementKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return
  exitEditStatus()
  // Ant focuses the portal after entering; Escape should work during entry too.
  if (data.folderOpen && !data.showModal && !data.showFolderEditor) closeFolder()
}

function closeFolder() {
  if (data.folderOpen) prepareFolderMotion(true)
  data.folderOpen = false
  endDrag()
}

function clearFolderView() {
  if (data.folderOpen) return
  data.folderId = ""
  folderView.value = undefined
  folderTrigger = undefined
  folderOpeningFrame = {}
  folderMotion.value = { transformOrigin: '0 0' }
}

function deleteItem(item: TopSiteItem) {
  Modal.confirm({ title: `删除“${item.title}”？`, content: item.kind === "folder" ? "文件夹中的链接将保留并移回主页。" : "删除后可以重新添加此链接。",
    okText: "删除", okType: "danger", cancelText: "取消", onOk() {
      topSiteStore.deleteTopSite(topSiteStore.topSites.findIndex(current => current.id === item.id))
    } })
}

function openFolderEditor(folder?: TopSiteItem) {
  data.editingFolderId = folder?.id || ""
  data.folderName = folder?.title || ""
  data.folderError = ""
  data.showFolderEditor = true
}

function onSaveFolder() {
  try {
    if (data.editingFolderId) topSiteStore.renameFolder(data.editingFolderId, data.folderName)
    else {
      folderTrigger = undefined
      folderOpeningFrame = {}
      folderShadeStyle['--folder-shade-open-opacity'] = '0'
      folderMotion.value = { transformOrigin: '0 0' }
      data.folderId = topSiteStore.addFolder(data.folderName)
      data.folderOpen = true
    }
    data.showFolderEditor = false
  } catch (error) { data.folderError = error instanceof Error ? error.message : "无法保存文件夹" }
}

let lastWheelTime = 0
function onWheel(event: WheelEvent) {
  if (event.ctrlKey || totalPages.value <= 1) return
  const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  const next = data.currentPage + Math.sign(delta)
  if (next < 0 || next >= totalPages.value) return
  event.preventDefault()
  if (Date.now() - lastWheelTime < 300) return
  data.currentPage = next
  lastWheelTime = Date.now()
}

const topSite = reactive({ title: "", url: "", icon: "", textIcon: false, autoIcon: true, folderId: "" })
const validateUrl = async (_rule: unknown, value: string) => {
  try { normalizeSiteUrl(value) } catch { throw new Error("请输入有效的 HTTP 或 HTTPS 网站地址") }
}
function normalizeCustomIcon(value: string) {
  // Preserve an imported image (including data URLs) when editing only its link.
  const existingIcon = topSiteStore.topSites.find(item => item.id === data.editingId)?.icon
  return value && value === existingIcon ? value : normalizeSiteUrl(value)
}
const rules = reactive({
  title: [{ required: true, whitespace: true, message: "请输入名称" }],
  url: [{ required: true, validator: validateUrl }],
  icon: [{ validator: async (_rule: unknown, value: string) => {
    if (!topSite.autoIcon && !topSite.textIcon) {
      try { normalizeCustomIcon(value) } catch { throw new Error("请输入有效的 HTTP 或 HTTPS 图标地址") }
    }
  } }]
})
const { validate, resetFields, validateInfos } = Form.useForm(topSite, rules)
let titleRequest = 0

function openAddModal(folderId = "") {
  titleRequest++
  resetFields()
  topSite.folderId = folderId
  data.editingId = ""
  data.fetchingTitle = false
  data.showModal = true
}

function openEditModal(item: TopSiteItem) {
  if (item.kind === "folder") return openFolderEditor(item)
  titleRequest++
  resetFields()
  data.editingId = item.id!
  topSite.title = item.title
  topSite.url = item.url
  topSite.folderId = item.folderId || ""
  topSite.textIcon = item.textIcon
  topSite.autoIcon = item.autoIcon === true
  topSite.icon = topSite.autoIcon ? "" : item.icon || ""
  data.fetchingTitle = false
  data.showModal = true
}

async function onSaveTopSite() {
  if (data.saving) return
  data.saving = true
  try {
    await validate()
    const url = normalizeSiteUrl(topSite.url)
    const item: TopSiteItem = { title: topSite.title.trim(), url,
      icon: topSite.autoIcon ? getFavicon(url) : topSite.textIcon ? undefined : normalizeCustomIcon(topSite.icon),
      autoIcon: topSite.autoIcon, textIcon: !topSite.autoIcon && topSite.textIcon, custom: true, folderId: topSite.folderId || undefined }
    if (topSite.folderId && !topSiteStore.folders.some(folder => folder.id === topSite.folderId)) throw new Error("文件夹已被删除，请重新选择所在文件夹")
    if (data.editingId) topSiteStore.updateTopSite({ ...item, id: data.editingId, index: topSiteStore.topSites.findIndex(item => item.id === data.editingId) })
    else topSiteStore.addTopSite(item)
    titleRequest++
    data.showModal = false
  } catch (error) { if (error instanceof Error) message.error(error.message) }
  finally { data.saving = false }
}

async function onUrlBlur() {
  let url: string
  try { url = normalizeSiteUrl(topSite.url) } catch { return }
  topSite.url = url
  if (topSite.title.trim()) return
  const request = ++titleRequest
  data.fetchingTitle = true
  let title = new URL(url).hostname.replace(/^www\./, "")
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { Accept: "text/html" } })
    if (response.ok) title = new DOMParser().parseFromString(await response.text(), "text/html").title.trim() || title
  } catch { /* Hostname is a useful fallback when CORS or the network blocks the title. */ }
  finally {
    if (request === titleRequest) {
      if (data.showModal && topSite.url === url && !topSite.title.trim()) topSite.title = title
      data.fetchingTitle = false
    }
  }
}

function onDragStart(item: TopSiteItem, event: DragEvent) {
  event.stopPropagation()
  data.currentDragId = item.id || ""
  data.dropTargetId = ""
  data.dropHome = false
  dragAnnouncement.value = `正在移动 ${item.title}`
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", item.id || "")
  }
}

function endDrag() {
  if (data.currentDragId) suppressClickUntil = Date.now() + 250
  if (dragAnnouncement.value.startsWith("正在移动")) dragAnnouncement.value = "已取消移动"
  data.currentDragId = ""
  data.dropTargetId = ""
  data.dropHome = false
}

function dropPlacement(item: TopSiteItem, event: DragEvent) {
  const source = draggedSite.value
  if (!source || source.id === item.id) return
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const x = (event.clientX - rect.left) / rect.width
  if (source.kind !== "folder" && item.kind === "folder" && x > 0.2 && x < 0.8) return "inside"
  if (source.folderId === item.folderId) return x < 0.5 ? "before" : "after"
}

function onDragOver(item: TopSiteItem, event: DragEvent) {
  const placement = dropPlacement(item, event)
  if (!placement) {
    data.dropTargetId = ""
    return
  }
  event.preventDefault()
  event.stopPropagation()
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move"
  data.dropTargetId = item.id!
  data.dropPlacement = placement
  data.dropHome = false
}

function onDragLeave(item: TopSiteItem, event: DragEvent) {
  if ((event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) return
  if (data.dropTargetId === item.id) data.dropTargetId = ""
}

function dropClasses(item: TopSiteItem) {
  return {
    'is-dragging': data.currentDragId === item.id,
    'drop-inside': data.dropTargetId === item.id && data.dropPlacement === 'inside',
    'drop-before': data.dropTargetId === item.id && data.dropPlacement === 'before',
    'drop-after': data.dropTargetId === item.id && data.dropPlacement === 'after'
  }
}

function onDrop(item: TopSiteItem, event: DragEvent) {
  const placement = dropPlacement(item, event)
  if (!placement) return endDrag()
  event.preventDefault()
  event.stopPropagation()
  const title = draggedSite.value?.title
  if (topSiteStore.dropTopSite(data.currentDragId, item.id!, placement)) {
    dragAnnouncement.value = placement === 'inside' ? `已将 ${title} 移入 ${item.title}` : `已调整 ${title} 的位置`
  }
  endDrag()
}

function moveOut(item: TopSiteItem) {
  topSiteStore.moveToFolder(item.id!)
  dragAnnouncement.value = `已将 ${item.title} 移回主页`
}

function dropToHome() {
  if (draggedSite.value?.folderId === data.folderId) moveOut(draggedSite.value)
  endDrag()
}

function leaveHomeDrop(event: DragEvent) {
  if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) data.dropHome = false
}

function onPageDragOver(page: number, event: DragEvent) {
  if (!draggedSite.value) return
  event.preventDefault()
  data.currentPage = page
  data.dropTargetId = ""
}

onBeforeMount(async () => {
  document.addEventListener("click", exitEditStatus)
  document.addEventListener("keydown", onManagementKeydown)
  topSiteStore.refreshIconUrls()
  if (!topSiteStore.lastUpdateTime) {
    try { await topSiteStore.syncBrowserTopSites() }
    catch { /* Manual browser refresh can request permission and report failures. */ }
  }
})
onBeforeUnmount(() => {
  document.removeEventListener("click", exitEditStatus)
  document.removeEventListener("keydown", onManagementKeydown)
})
</script>

<style lang="less">
@item-size-max: 128px;
@col: var(--site-cols);
@row: var(--site-rows);
@gap: var(--site-gap);
@board-size: var(--site-board-size);
@board-color: var(--site-board-color);
@board-opacity: var(--site-board-opacity);
@board-radius: var(--site-board-radius);
@primary-color: var(--site-primary-color);

.top-site-warp {
  width: calc(@col * @item-size-max + (@col - 1) * @gap);
  .top-site-viewport { height: calc(@row * @item-size-max + (@row - 1) * @gap); overflow: hidden; }
  .top-site-track { display: flex; height: 100%; transition: transform var(--motion-slow) var(--motion-ease); }
  .top-site-page { flex: 0 0 100%; width: 100%; }
  .top-site-grid { position: relative; display: grid; grid-template-columns: repeat(@col, @item-size-max); grid-template-rows: repeat(@row, @item-size-max); gap: @gap; padding: 0; margin: 0; list-style: none; }
  .page-indicators {
    display: flex; justify-content: center; align-items: center; gap: 6px; padding-top: 12px;
    .indicator-dot { width: 10px; height: 10px; padding: 0; border: 0; border-radius: 50%; background-color: rgba(128, 128, 128, 0.4); cursor: pointer;
      transition: width var(--motion-normal) var(--motion-ease), background-color var(--motion-fast) ease;
      &.active { background-color: @primary-color; width: 22px; border-radius: 5px; }
    }
  }
}
.top-site-warp, .folder-glass-dialog {
  .top-site-item {
    position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; row-gap: 8px;
    .top-site-icon {
      width: @board-size; height: @board-size; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; position: relative; border-radius: @board-radius;
      transition: transform var(--motion-fast) var(--motion-ease), box-shadow var(--motion-normal) ease, opacity var(--motion-normal) ease;
      &:focus-visible { outline: 2px solid @primary-color; outline-offset: 4px; }
      .site-image { width: 100%; height: 100%; }
      .icon-board { position: absolute; inset: 0; background-color: @board-color; opacity: @board-opacity; border-radius: @board-radius; }
      .folder-symbol { position: relative; z-index: 1; font-size: v-bind("`${topSiteSetting.iconSize}px`"); }
      &.folder-tile { border-radius: 16px; }
      &.folder-expanded { opacity: 0.25; }
    }
    &.drop-inside .folder-tile { transform: scale(1.12); box-shadow: 0 0 0 2px @primary-color, 0 10px 28px rgba(0, 0, 0, 0.14); }
    &.drop-inside .icon-title { color: @primary-color; }
    .drop-hint { position: absolute; bottom: 0; left: -10px; right: -10px; text-align: center; color: @primary-color; font-size: 11px; pointer-events: none; }
    .site-actions {
      position: absolute; top: 2px; right: 3px; display: flex; gap: 4px; z-index: 3;
      button { width: 26px; height: 26px; border: 1px solid #d9d9d9; border-radius: 50%; background: #fff; color: #333; cursor: pointer; transition: transform var(--motion-fast) var(--motion-ease);
        &:active { transform: scale(0.88); }
      }
    }
    .icon-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: @item-size-max; text-align: center; font-size: 16px; line-height: normal; user-select: none; }
  }
}
@media (hover: hover) {
  .top-site-warp:not(.drag-active) .top-site-icon:hover,
  .folder-glass-dialog:not(.drag-active) .top-site-icon:hover { transform: translateY(-3px) scale(1.025); }
}
.top-site-warp:not(.drag-active) .top-site-icon:active,
.folder-glass-dialog:not(.drag-active) .top-site-icon:active { transform: scale(0.94); }
.top-site-item, .folder-links > li {
  &.is-dragging { opacity: 0.35; transition: opacity var(--motion-fast) ease; }
  &.drop-before::before, &.drop-after::after { content: ""; position: absolute; top: 20%; bottom: 20%; width: 3px; border-radius: 3px; background: var(--primary-color); pointer-events: none; animation: drop-guide-in var(--motion-fast) var(--motion-ease); }
  &.drop-before::before { left: 0; }
  &.drop-after::after { right: 0; }
}
.folder-glass-dialog {
  .ant-modal { padding-bottom: 0; }
  .ant-modal-content {
    padding: 28px; border-radius: 28px; background: rgba(255, 255, 255, 0.28);
    border: 1px solid rgba(255, 255, 255, 0.42); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.14);
    backdrop-filter: blur(24px) saturate(135%); -webkit-backdrop-filter: blur(24px) saturate(135%);
  }
  .ant-modal-header { background: transparent; margin-bottom: 8px; padding-right: 24px; }
  .ant-modal-title { font-size: 24px; font-weight: 600; overflow-wrap: anywhere; }
  .ant-modal-body { color: inherit; }
  .folder-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-bottom: 20px; }
  .folder-count { opacity: 0.55; font-size: 12px; margin-right: auto; }
  .folder-content { display: grid; min-height: 136px; }
  .folder-links, .folder-empty { grid-area: 1 / 1; }
  .folder-links { display: grid; grid-template-columns: repeat(auto-fill, @item-size-max); grid-auto-rows: @item-size-max; align-content: start; justify-content: center; gap: @gap; list-style: none; padding: 4px; margin: 0;
    max-height: min(52vh, calc(@row * @item-size-max + (@row - 1) * @gap + 8px)); overflow-y: auto;
    position: relative;
    > li { position: relative; min-width: 0; border-radius: 14px;
      &.folder-items-leave-active { position: absolute; pointer-events: none; }
    }
  }
  .folder-link .site-image { pointer-events: none; }
  .folder-link-actions { position: absolute; top: -2px; right: 0; display: flex; justify-content: center; gap: 4px;
    button { border: 0; border-radius: 6px; background: rgba(128, 128, 128, 0.12); color: inherit; width: 26px; height: 26px; cursor: pointer;
      &:hover { background: rgba(128, 128, 128, 0.2); }
    }
  }
  .folder-footer { display: flex; align-items: center; justify-content: center; min-height: 52px; margin-top: 12px; }
  .folder-tip { margin: 0; text-align: center; font-size: 12px; opacity: 0.5; }
  .folder-empty { padding: 12px; text-align: center; opacity: 0.65; pointer-events: none;
    --folder-detail-opacity: 0.65;
    &.control-reveal-enter-from, &.control-reveal-leave-to { opacity: 0; }
    > .anticon { font-size: 42px; }
    p { margin: 14px 0 8px; }
    > span:not(.anticon) { font-size: 12px; }
  }
  .folder-drop-home { width: 100%; padding: 14px; border: 1px dashed currentColor; border-radius: 12px; opacity: 0.65; text-align: center; font-size: 13px;
    animation: drop-guide-in var(--motion-fast) var(--motion-ease);
    transition: background-color var(--motion-fast) ease, color var(--motion-fast) ease, opacity var(--motion-fast) ease;
    &.active { color: var(--primary-color); background: rgba(128, 128, 128, 0.15); opacity: 1; }
  }
}
.control-reveal-enter-active, .control-reveal-leave-active {
  transition: transform var(--motion-fast) var(--motion-ease), opacity var(--motion-fast) ease;
}
.control-reveal-enter-from, .control-reveal-leave-to { opacity: 0; transform: translateY(4px) scale(0.92); }
.control-reveal-leave-active { pointer-events: none; }
.top-site-grid > .flip-list-leave-active { position: absolute; pointer-events: none; }
.top-site-grid > .flip-list-move, .folder-links > .folder-items-move { transition: transform var(--motion-normal) var(--motion-ease); }
.folder-links > .folder-items-enter-active, .folder-links > .folder-items-leave-active { transition: transform var(--motion-normal) var(--motion-ease), opacity var(--motion-fast) ease; }
.folder-items-enter-from, .folder-items-leave-to { opacity: 0; transform: scale(0.94); }
.folder-panel-enter { animation: folder-panel-in 460ms cubic-bezier(.16, 1, .3, 1) both; will-change: transform, opacity; }
.folder-panel-leave { animation: folder-panel-out 280ms cubic-bezier(.4, 0, .8, .2) both; pointer-events: none; will-change: transform, opacity; }
.folder-panel-enter .ant-modal-content { animation: folder-surface-in 460ms cubic-bezier(.16, 1, .3, 1) both; }
.folder-panel-leave .ant-modal-content { animation: folder-surface-out 280ms cubic-bezier(.4, 0, .8, .2) both; }
.folder-shade-enter { animation: folder-shade-in 360ms ease both; }
.folder-shade-leave { animation: folder-shade-out 280ms ease both; }
.folder-panel-enter :is(.ant-modal-header, .folder-toolbar, .folder-footer, .folder-empty, .ant-modal-close) { animation: folder-detail-in 240ms 100ms var(--motion-ease) both; }
.folder-panel-enter .folder-links > li:nth-child(-n+24) { animation: folder-detail-in 260ms 110ms var(--motion-ease) both; }
.folder-panel-enter .folder-links > li:nth-child(2) { animation-delay: 130ms; }
.folder-panel-enter .folder-links > li:nth-child(3) { animation-delay: 150ms; }
.folder-panel-enter .folder-links > li:nth-child(n+4) { animation-delay: 170ms; }
.folder-panel-leave :is(.ant-modal-header, .folder-toolbar, .folder-footer, .folder-empty, .ant-modal-close),
.folder-panel-leave .folder-links > li:nth-child(-n+24) { animation: folder-detail-out 100ms ease both; }
@keyframes folder-panel-in {
  from { opacity: var(--folder-open-opacity, 0); transform: var(--folder-open-transform, var(--folder-from-transform, translate3d(0, 12px, 0) scale(.96))); }
  18% { opacity: 1; }
  to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
}
@keyframes folder-panel-out {
  from { opacity: var(--folder-close-opacity, 1); transform: var(--folder-close-transform, none); }
  to { opacity: 0; transform: var(--folder-from-transform, translate3d(0, 12px, 0) scale(.96)); }
}
@keyframes folder-surface-in { from { border-radius: var(--folder-open-radius, var(--folder-from-radius, 28px)); } to { border-radius: 28px; } }
@keyframes folder-surface-out { from { border-radius: var(--folder-close-radius, 28px); } to { border-radius: var(--folder-from-radius, 28px); } }
@keyframes folder-shade-in { from { opacity: var(--folder-shade-open-opacity, 0); } to { opacity: 1; } }
@keyframes folder-shade-out { from { opacity: var(--folder-shade-close-opacity, 1); } to { opacity: 0; } }
@keyframes folder-detail-in {
  from { opacity: var(--folder-detail-open-opacity, 0); transform: var(--folder-detail-open-transform, translateY(10px)); }
  to { opacity: var(--folder-detail-opacity, 1); transform: translateY(0); }
}
@keyframes folder-detail-out {
  from { opacity: var(--folder-detail-close-opacity, 1); transform: var(--folder-detail-close-transform, none); }
  to { opacity: 0; transform: var(--folder-detail-close-transform, none); }
}
@keyframes drop-guide-in { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
@media (prefers-reduced-motion: reduce) {
  .top-site-warp .top-site-icon, .folder-glass-dialog .top-site-icon { transform: none !important; }
  .folder-panel-enter, .folder-panel-leave { transform: none !important; }
}
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
[data-theme="dark"] .folder-glass-dialog {
  .ant-modal-content { background: rgba(24, 28, 36, 0.34); border-color: rgba(255, 255, 255, 0.16); box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28); }
}
@media (max-width: 540px) {
  .folder-glass-dialog .ant-modal-content { padding: 22px 16px; }
}
[data-theme="dark"] .top-site-warp, [data-theme="dark"] .folder-glass-dialog {
  .icon-board { background-color: #1f1f1f !important; }
  .top-site-item .site-actions button { background: #303030; border-color: #555; color: #fff; }
}
</style>
