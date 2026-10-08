<template>
  <div class="folder-preview" :style="previewStyle" aria-hidden="true">
    <transition-group name="folder-tile" tag="div" class="folder-preview-grid">
      <icon
        v-for="(item, index) in links.slice(0, 4)"
        :key="item.id || item.url"
        class="folder-preview-icon"
        :class="{ 'has-image': !!item.icon && !item.textIcon }"
        :style="{ '--preview-x': `${(index % 2) * 56}%`, '--preview-y': `${Math.floor(index / 2) * 56}%` }"
        :src="item.icon"
        :text-icon="item.textIcon"
        :title="item.title"
        :size="iconSize"
      />
    </transition-group>
    <transition name="folder-badge">
      <folder-outlined v-if="!links.length" class="folder-preview-empty" />
    </transition>
    <transition name="folder-badge">
      <span v-if="links.length > 4" class="folder-preview-count">
        {{ links.length > 99 ? "99+" : links.length }}
      </span>
    </transition>
  </div>
</template>

<script lang="ts" setup>
import { computed } from "vue"
import { FolderOutlined } from "@ant-design/icons-vue"
import Icon from "./Icon.vue"
import type { TopSites } from "@/types"

const props = withDefaults(defineProps<{ items: TopSites; size?: number }>(), { size: 64 })
const links = computed(() => props.items.filter(item => item.kind !== "folder"))
const iconSize = computed(() => Math.max(4, Math.round(props.size * 0.26)))
const previewStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  borderRadius: `${Math.round(props.size * 0.24)}px`,
  padding: `${Math.round(props.size * 0.12)}px`,
  fontSize: `${Math.round(props.size * 0.52)}px`
}))
</script>

<style lang="less" scoped>
.folder-preview {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  pointer-events: none;
  user-select: none;
  color: inherit;
  background: rgba(255, 255, 255, 0.16);
  border: 1px solid rgba(128, 128, 128, 0.28);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 2px 8px rgba(0, 0, 0, 0.06);
  backdrop-filter: blur(8px);

  .folder-preview-grid {
    position: relative;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: 12%;
  }

  .folder-preview-icon { width: 100%; height: 100%; }
  .folder-preview-empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.65;
  }
  .folder-tile-move,
  .folder-tile-enter-active,
  .folder-tile-leave-active {
    transition: transform var(--motion-normal, 240ms) var(--motion-ease, cubic-bezier(.22, 1, .36, 1)),
      opacity var(--motion-fast, 160ms) var(--motion-ease, cubic-bezier(.22, 1, .36, 1));
  }
  .folder-tile-enter-from,
  .folder-tile-leave-to {
    opacity: 0;
    transform: scale(0.82);
  }
  .folder-tile-leave-active {
    // Keep the outgoing icon in its old cell while the remaining icons move.
    position: absolute;
    left: var(--preview-x);
    top: var(--preview-y);
    width: 44%;
    height: 44%;
  }
  .folder-badge-enter-active,
  .folder-badge-leave-active {
    transition: opacity var(--motion-fast, 160ms) var(--motion-ease, cubic-bezier(.22, 1, .36, 1));
  }
  .folder-badge-enter-from,
  .folder-badge-leave-to { opacity: 0; }
  .folder-preview-count {
    position: absolute;
    right: -4px;
    bottom: -4px;
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
    box-sizing: border-box;
    border-radius: 9px;
    background: rgba(255, 255, 255, 0.88);
    color: #525966;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
    font-size: 10px;
    font-weight: 600;
    line-height: 17px;
    text-align: center;
  }
}

:global([data-theme="dark"] .folder-preview) {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.2);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.09), 0 2px 8px rgba(0, 0, 0, 0.1);
}

:global([data-theme="dark"] .folder-preview .folder-preview-count) {
  background: rgba(38, 42, 49, 0.9);
  color: #e6e9ef;
}

:global([data-theme="dark"] .folder-preview .has-image) {
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.48);
}

@media (prefers-reduced-motion: reduce) {
  .folder-tile-move,
  .folder-tile-enter-active,
  .folder-tile-leave-active,
  .folder-badge-enter-active,
  .folder-badge-leave-active { transition: none !important; }

  .folder-preview .folder-tile-enter-from,
  .folder-preview .folder-tile-leave-to { transform: none; }
}
</style>
