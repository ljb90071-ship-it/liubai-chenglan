# 留白成蓝：前端目录

当前产品为“面向文旅场景的开源非遗互动展陈平台”。完整启动、状态与文档见[项目README](../README.md)。本目录包含游客展厅、策展工作台、领取页、蓝印花布创作内核和本地资源。

## 正式运行

在上一级项目目录使用Node.js 24启动：

```powershell
node server.mjs --host 127.0.0.1 --port 8769 --data ./data
```

游客入口为`http://localhost:8769/`，策展入口为`http://localhost:8769/curator.html`。扫码领取需配置实际LAN地址，通过localhost操作展屏，见[部署指南](../docs/deployment.md)。新产品依赖`/api/`与共享展包模块，单独用静态服务器打开本目录无法完成策展或领取。

## 模块入口

| 模块 | 职责 |
|---|---|
| `index.html`、`exhibit-runtime.js` | 游客故事、意象选择、流程、纪念卡与领取 |
| `curator.html/js/css` | 策展表单、版本、预览与启用 |
| `claim.html/js`、`artwork.js` | 手机领取、同源成布、纪念卡与JSON下载 |
| `engine.js`、`app.js` | 二值花版与施浆、状态、撤销、导入导出 |
| `visitor-session.js` | 公共展屏内存会话与个人持久存储边界 |
| `scene-router.js`、艺术样式 | 可中断布幕、两级导航、历史位置与减少动态 |
| `creative-tools.js`、`exploration.js` | 自刻、配方、实验和原有创作委托 |
| `cloth-scene.js`、`experience.js` | 参数布面、立体观察、提布与无WebGL退路 |
| `living-gallery.js` | 个人成布的生活应用与场景PNG |

工作台通过`window.indigoWorkbench`提供`snapshot()`、`applyPreset(partial)`、`beginVisitor({sessionId,design?})`、`loadDesign(serializedDoc)`和`setAllowedControls(array)`。作品变化发送`indigo:change`，新游客发送`indigo:session-reset`。共享展屏默认不恢复旧草稿，手机接续通过`?mode=personal`使用个人存储。

## 检查与资源

项目根目录执行`npm test`；仅前端回归可在本目录执行`node --test *.test.mjs`。模拟DOM／WebGL状态测试与浏览器任务分别记录，真实手机尚未实机验证，统一验收入口见项目README。

字体为本地OFL子集，版权与许可位于`assets/type-v5/`及`assets/`；二维码库`vendor/qrcodegen.js`保留MIT头。入口雕塑、染坊、手作近景和生活环境为生成艺术意象，实际作品由当前游客数据绘制。完整归属、固定哈希、文化来源和素材性质见[THIRD_PARTY.md](../THIRD_PARTY.md)。

数字防染、连通检查、参数布面与配方服务于互动创作和工艺解释，不承担真实染料、纸版强度或布料动力学标定。单一实际作品状态让游客局部施浆贯穿成布、验布、纪念卡与手机接续。
