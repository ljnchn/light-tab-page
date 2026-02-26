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
- ⚡ 加载迅速 (< 50ms)

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


