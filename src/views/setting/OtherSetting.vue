<template>
  <div class="other-setting">
    <setting-item :lable="t('other.lang')" horizontal>
      <a-select v-model:value="lang" style="width: 100px">
        <a-select-option v-for="(value, key) in languages" :value="key" :key="key">
          {{ value }}
        </a-select-option>
      </a-select>
    </setting-item>

    <setting-item :lable="t('other.backup.text')">
      <div class="backup-btn-warp">
        <a-button :loading="backupAction === 'export'" :disabled="busy" @click="exportBackupFile">
          <template #icon>
            <DownloadOutlined />
          </template>

          {{ t("other.backup.export") }}
        </a-button>
        <a-upload
          accept=".json,application/json"
          :show-upload-list="false"
          :before-upload="importBackupFile"
          :disabled="busy"
        >
          <a-button :loading="backupAction === 'import'" :disabled="busy">
            <template #icon>
              <UploadOutlined />
            </template>

            {{ t("other.backup.import") }}
          </a-button>
        </a-upload>
      </div>
      <p class="backup-hint">{{ t("other.backup.hint") }}</p>
    </setting-item>
    <web-dav-setting :disabled="!!backupAction" @busy-change="webDavBusy = $event" />
  </div>
</template>

<script lang="ts" setup>
import SettingItem from "@/components/SettingItem.vue"
import { useSettingStore } from "@/store"
import { computed, ref } from "vue"
import { useI18n } from "vue-i18n"
import { UploadOutlined, DownloadOutlined } from "@ant-design/icons-vue"
import { storeToRefs } from "pinia"
import { Modal, message } from "ant-design-vue"
import WebDavSetting from "./WebDavSetting.vue"
import { BackupError, MAX_BACKUP_SIZE, parseBackup, restoreBackup } from "@/utils/backup"

const { t, availableLocales } = useI18n()
const settingStore = useSettingStore()
const { lang } = storeToRefs(settingStore)
const backupAction = ref<"" | "import" | "export">("")
const webDavBusy = ref(false)
const busy = computed(() => !!backupAction.value || webDavBusy.value)
const languages = ref<Record<string, any>>({
  auto: computed(() => t("common.auto")),
  ...Object.fromEntries(availableLocales.map(item => [item, t("lang", item, { locale: item })]))
})

async function importBackupFile(file: File) {
  if (busy.value) return false
  backupAction.value = "import"
  try {
    if (file.size > MAX_BACKUP_SIZE) throw new BackupError("tooLarge")
    const data = parseBackup(await file.text())
    const confirmed = await new Promise<boolean>(resolve => Modal.confirm({
      title: t("other.backup.restoreTitle"), content: t("other.backup.restoreConfirm"),
      okText: t("common.confirm"), cancelText: t("common.cancel"),
      onOk: () => { resolve(true) }, onCancel: () => { resolve(false) }
    }))
    if (confirmed) {
      await restoreBackup(data)
      location.reload()
    }
  } catch (error) {
    message.error(error instanceof BackupError ? t(`other.backup.errors.${error.code}`) : t("other.backup.errors.readFailed"))
  } finally { backupAction.value = "" }
  return false
}

async function exportBackupFile() {
  if (busy.value) return
  backupAction.value = "export"
  try { await settingStore.exportSetting() }
  catch (error) { message.error(error instanceof BackupError ? t(`other.backup.errors.${error.code}`) : t("other.backup.errors.readFailed")) }
  finally { backupAction.value = "" }
}
</script>

<style lang="less">
.other-setting {
  .backup-btn-warp {
    display: flex;
    justify-content: space-around;

    button {
      width: 156px;
    }
  }
  .backup-hint { color: #888; font-size: 12px; line-height: 1.6; }
}
</style>
