# Light Tab Page 轻标签页

> 一款轻量简洁的新标签页浏览器插件，专注新标签页基础功能<br/>
> 使用下一代前端开发与构建框架编写，更低 CPU、内存占用，加载更迅速<br/>

## 安装

- [Chrome 应用商店](https://chrome.google.com/webstore/detail/hijeghaehaammnoaaiabbbhggaoaamkp)
- [Edge 应用商店](https://microsoftedge.microsoft.com/addons/detail/ilebnicnppejmbmkaokpdljcanljdnic)
- [Firefox 应用商店](https://addons.mozilla.org/zh-CN/firefox/addon/light-tab-page/)
- [离线安装包](https://github.com/Devifish/light-tab-page/releases)

## 特性

- 🌙 跟随系统深色和浅色模式
- 📦 开箱即用的搜索引擎及建议 API
- 🔍 自定义搜索引擎
- 🪄 高度可定制化设置
- 🪟 Bing 每日壁纸
- 🎨 切换主题（主色调）
- ⏱️ 最近搜索/浏览导航
- 📁 链接文件夹、编辑与分组移动
- ☁️ WebDAV 手动同步与备份恢复
- 📌 从扩展工具栏快速收藏当前页面
- ⚡ 加载迅速 (< 50ms)

## 链接与同步

在设置的「布局设置」中开启导航栏，即可手动添加链接，无需授予浏览历史权限。
点击「添加导航」后面的「添加文件夹」建立单层分组；右键点击链接或文件夹进入管理，
可编辑标题、地址、图标和所在文件夹，点击空白处或按 Esc 退出管理。
文件夹以透明四宫格预览内部链接，点击后在透明模糊底板中展开图标网格。
把链接拖到文件夹图标中间即可移入，拖到边缘可调整顺序，悬停时会显示对应提示。
文件夹内也可拖动排序，拖到底部的「移回主页」区域可移出；管理模式保留按钮操作。
删除文件夹会将其中的链接移回主页。
已有标签页与工具栏弹窗会自动接收本机修改。

点击浏览器工具栏中的扩展图标，可收藏当前 HTTP/HTTPS 页面，选择文件夹并修改标题。
已收藏的地址会显示编辑入口。浏览器内部页面不支持收藏。

「其他设置 → WebDAV 同步」支持测试连接、上传本机数据、下载并恢复。
填写完整的 JSON 文件地址（例如 `https://dav.example.com/backups/light-tab-page.json`），
其父目录需预先存在；也可使用服务商提供的应用密码。
这是手动上传/下载同步，不会在后台自动合并设备上的修改。覆盖操作会先确认，
上传使用 ETag 条件请求防止同步过程中覆盖另一设备的新版本。
已有远程文件必须提供强 ETag 才能覆盖；首次上传可创建不存在的文件。

本地导出与 WebDAV 同步使用同一份完整备份，包含设置、链接和文件夹及其顺序、
自定义搜索引擎、搜索历史和本地壁纸（包括暂未启用的已上传图片），最大 50 MB。
恢复后壁纸无需重新上传；若原设备的壁纸文件已缺失，导出会提示重新上传。
兼容旧版导出文件，旧备份未包含的设置、链接等数据类别会保留当前内容；旧文件中未保存的壁纸无法从该文件恢复。
WebDAV 凭据仅存本机，不会写入导出文件或上传内容。
在普通网页预览中使用 WebDAV，需要服务器配置 CORS（GET/PUT，允许 Authorization、
Content-Type、If-Match、If-None-Match，并通过 Access-Control-Expose-Headers 暴露 ETag）。
扩展会在操作时请求指定服务器的访问权限。请使用最终文件地址，不支持 HTTP 重定向。

本版要求 Chrome/Edge 102+ 或 Firefox 128+，以支持可选 WebDAV 主机权限。

## 依赖

| 依赖           | 版本  |
| -------------- | ----- |
| Typescript     | 5.0.4 |
| Vue.js         | 3.3.4 |
| Pinia          | 2.1.4 |
| Vue Router     | 4.2.2 |
| Vite           | 4.3.9 |
| Ant Design Vue | 4.0.0 |

- 推荐使用 `PNPM` 及 `Node.js 18` 及以上版本运行/构建当前项目

## 开发

```
git clone https://github.com/Devifish/light-tab-page.git
cd light-tab-page
pnpm install
pnpm run dev
```

验证命令：`pnpm run check`、`pnpm test`、`pnpm run build`。
`pnpm test` 使用现有依赖运行数据迁移、文件夹操作、备份、WebDAV 条件请求、
跨页面持久化、搜索历史及扩展 API 的回归检查。构建后的 `dist/` 可作为未打包扩展加载。
真实工具栏收藏与服务商 WebDAV 登录还需在已加载的扩展中验证。

## 发布

项目使用 GitHub Actions 自动构建和发布，推送版本 tag 即可触发：

```bash
# 更新 package.json 中的 version 后
git add .
git commit -m "release: v1.6.0"
git tag v1.6.0
git push origin main --tags
```

工作流会自动完成：
1. 类型检查 + 构建
2. 将 `dist/` 打包为 zip
3. 上传到 GitHub Releases

如需自动发布到应用商店，在仓库 **Settings > Secrets** 中配置以下密钥后，取消 `.github/workflows/release.yml` 中对应步骤的注释：

| 商店 | 所需 Secrets |
|------|-------------|
| Chrome Web Store | `CHROME_EXTENSION_ID`, `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET`, `CHROME_REFRESH_TOKEN` |
| Firefox Add-ons | `FIREFOX_JWT_ISSUER`, `FIREFOX_JWT_SECRET` |

## 赞助
本项目的 CDN 加速及安全防护由腾讯 EdgeOne 赞助。

[![Best Asian CDN, Edge, and Secure Solutions - Tencent EdgeOne](https://edgeone.ai/media/34fe3a45-492d-4ea4-ae5d-ea1087ca7b4b.png)](https://edgeone.ai/?from=github)


