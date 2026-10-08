<template>
  <div
    id="wallpaper-image"
    v-if="!isEmpty(displayUrl)"
    :style="{ backgroundImage: `url(${displayUrl})` }"
  >
    <div class="wallpaper-mask"></div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from "vue"
import { BackgroundType, ThemeMode } from "@/types/setting"
import { useSettingStore } from "@/store"
import { isEmpty } from "@/utils/common"
import { storeToRefs } from "pinia"

const settingStore = useSettingStore()
const { background, currentTheme } = storeToRefs(settingStore)
// A URL created by another tab becomes invalid when that tab closes.
const localWallpaperUrl = ref<string | null>(null)
const displayUrl = computed(() => background.value.type === BackgroundType.Local
  ? localWallpaperUrl.value : background.value.url)

// 遮罩不透明度
const maskOpacity = computed(() => {
  const defaultOpacity = 0.75
  const { maskOpacity, autoOpacity } = background.value

  return autoOpacity && currentTheme.value === ThemeMode.Dart
    ? (defaultOpacity + (1 - defaultOpacity) * maskOpacity!).toFixed(2)
    : maskOpacity
})

// Compare scalar values so another tab's URL write or store hydration cannot echo reloads.
watch([() => background.value.id, () => background.value.type], async ([, type], previous, onCleanup) => {
  let active = true
  onCleanup(() => { active = false })
  try {
    if (type === BackgroundType.Local) {
      const url = await settingStore.reloadBackgroundImage()
      if (active && url !== undefined) localWallpaperUrl.value = url
    } else if (type === BackgroundType.Bing && type !== previous[1]) {
      await settingStore.loadBingDailyWallpaper()
    }
  } catch (error) {
    if (!active) return
    if (type === BackgroundType.Local) localWallpaperUrl.value = null
    console.warn("Unable to load wallpaper:", error)
  }
}, { immediate: true })
</script>

<style lang="less">
@wallpaper-blur: v-bind("`${background.blur}px`");

#wallpaper-image {
  position: absolute;
  top: calc(@wallpaper-blur * -2);
  left: calc(@wallpaper-blur * -2);
  right: calc(@wallpaper-blur * -2);
  bottom: calc(@wallpaper-blur * -2);

  background-repeat: no-repeat;
  background-size: cover;
  background-position: center;
  filter: blur(@wallpaper-blur);

  .wallpaper-mask {
    width: 100%;
    height: 100%;

    background-color: v-bind("background.maskColor");
    opacity: v-bind("maskOpacity");
  }
}
</style>
