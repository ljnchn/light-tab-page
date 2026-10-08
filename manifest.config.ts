import { defineManifestV3 } from "./script/build-manifest"

export default defineManifestV3({
  manifest_version: 3,
  name: "__MSG_name__",
  description: "__MSG_description__",
  version: process.env.npm_package_version!,
  default_locale: "zh_CN",
  minimum_chrome_version: "102.0.0",
  permissions: ["favicon", "activeTab"],
  optional_permissions: ["topSites"],
  optional_host_permissions: ["http://*/*", "https://*/*"],
  host_permissions: [
    "https://cn.bing.com/",
    "https://suggestion.baidu.com/",
    "https://api.bing.com/",
    "https://suggestqueries.google.com/"
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self';"
  },
  chrome_url_overrides: {
    newtab: "index.html#/"
  },
  action: {
    default_icon: "icons/logo128.png",
    default_title: "__MSG_name__",
    default_popup: "index.html#/popup"
  },
  icons: {
    "32": "icons/logo32.png",
    "64": "icons/logo64.png",
    "128": "icons/logo128.png"
  },

  /** 兼容Firefox */
  browser_specific_settings: {
    gecko: {
      id: "{c29037b9-7c63-4064-be30-cf42d599ca39}",
      strict_min_version: "128.0"
    }
  }
})
