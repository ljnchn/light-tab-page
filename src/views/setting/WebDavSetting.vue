<template>
  <setting-item :lable="t('webdav.title')">
    <a-form layout="vertical" class="webdav-setting" :model="config" :disabled="disabled || !!busy">
      <a-form-item :label="t('webdav.url')">
        <a-input v-model:value="config.url" placeholder="https://dav.example.com/backup/light-tab-page.json" autocomplete="off" />
      </a-form-item>
      <div class="webdav-credentials">
        <a-form-item :label="t('webdav.username')">
          <a-input v-model:value="config.username" autocomplete="off" />
        </a-form-item>
        <a-form-item :label="t('webdav.password')">
          <a-input-password v-model:value="config.password" autocomplete="new-password" />
        </a-form-item>
      </div>
      <p class="webdav-hint">{{ t('webdav.hint') }}</p>
      <p v-if="!isExtension" class="webdav-hint">{{ t('webdav.cors') }}</p>
      <a-space wrap>
        <a-button :loading="busy === 'test'" :disabled="disabled || !!busy" @click="run('test')">{{ t('webdav.test') }}</a-button>
        <a-button :loading="busy === 'upload'" :disabled="disabled || !!busy" @click="run('upload')">{{ t('webdav.upload') }}</a-button>
        <a-button :loading="busy === 'download'" :disabled="disabled || !!busy" @click="run('download')">{{ t('webdav.download') }}</a-button>
        <a-button :disabled="disabled || !!busy" @click="forget">{{ t('webdav.forget') }}</a-button>
      </a-space>
      <a-alert v-if="status" class="webdav-status" :type="statusType" :message="status" show-icon />
    </a-form>
  </setting-item>
</template>

<script setup lang="ts">
import { reactive, ref, nextTick } from "vue"
import { Modal } from "ant-design-vue"
import { useI18n } from "vue-i18n"
import SettingItem from "@/components/SettingItem.vue"
import { isExtension, requestPermissions } from "@/plugins/extension"
import { BackupError, createBackup, parseBackup, restoreBackup } from "@/utils/backup"
import {
  WEBDAV_CONFIG_KEY, WebDavError, loadWebDavConfig, validateWebDavConfig,
  webDavPermission, readWebDav, writeWebDav
} from "@/utils/webdav"

const { t } = useI18n()
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ (event: "busy-change", busy: boolean): void }>()
const config = reactive(loadWebDavConfig())
const busy = ref<"" | "test" | "upload" | "download">("")
const status = ref("")
const statusType = ref<"success" | "error" | "warning">("success")

function confirm(title: string, content: string) {
  return new Promise<boolean>(resolve => Modal.confirm({
    title, content, okText: t("common.confirm"), cancelText: t("common.cancel"),
    onOk: () => { resolve(true) }, onCancel: () => { resolve(false) }
  }))
}

async function run(action: "test" | "upload" | "download") {
  if (props.disabled || busy.value) return
  busy.value = action
  emit("busy-change", true)
  status.value = ""
  statusType.value = "success"
  try {
    const saved = validateWebDavConfig(config)
    // Request immediately while the click's user gesture is active (required by Firefox).
    if (isExtension && !await requestPermissions(webDavPermission(saved))) throw new WebDavError("permission")
    localStorage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(saved))
    const remote = await readWebDav(saved)
    if (action === "test") {
      if (remote.exists) parseBackup(remote.text)
      const safeEtag = remote.etag && /^"[^"\r\n]*"$/.test(remote.etag)
      statusType.value = remote.exists && !safeEtag ? "warning" : "success"
      status.value = t(remote.exists ? safeEtag ? "webdav.connected" : "webdav.readOnly" : "webdav.canCreate")
    } else if (action === "upload") {
      if (remote.exists) parseBackup(remote.text)
      if (remote.exists && (!remote.etag || !/^"[^"\r\n]*"$/.test(remote.etag))) throw new WebDavError("noEtag")
      if (!await confirm(t("webdav.uploadConfirm"), t(remote.exists ? "webdav.overwriteRemote" : "webdav.createRemote", { url: saved.url }))) return
      await nextTick()
      await writeWebDav(saved, await createBackup(), remote)
      status.value = t("webdav.uploaded")
    } else {
      if (!remote.exists) throw new WebDavError("missing")
      const data = parseBackup(remote.text)
      if (!await confirm(t("other.backup.restoreTitle"), t("other.backup.restoreConfirm"))) return
      await restoreBackup(data)
      location.reload()
    }
  } catch (error) {
    statusType.value = "error"
    status.value = error instanceof WebDavError
      ? t(`webdav.errors.${error.code}`, { status: error.status })
      : error instanceof BackupError
        ? t(`other.backup.errors.${error.code}`)
        : t("webdav.errors.local")
  } finally { busy.value = ""; emit("busy-change", false) }
}

function forget() {
  if (props.disabled || busy.value) return
  try {
    localStorage.removeItem(WEBDAV_CONFIG_KEY)
    Object.assign(config, { url: "", username: "", password: "" })
    statusType.value = "success"
    status.value = t("webdav.forgotten")
  } catch {
    statusType.value = "error"
    status.value = t("webdav.errors.local")
  }
}
</script>

<style scoped lang="less">
.webdav-setting { margin-top: 8px; }
.webdav-credentials { display: flex; gap: 12px; }
.webdav-credentials > * { flex: 1; min-width: 0; }
.webdav-hint { color: #888; font-size: 12px; line-height: 1.6; }
.webdav-status { margin-top: 12px; overflow-wrap: anywhere; }
</style>
