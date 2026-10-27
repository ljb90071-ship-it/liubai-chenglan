# 留白成蓝

面向文旅场景的开源非遗互动展陈平台。

让游客从一枚花版出发，亲手留下蓝白，再把自己的旅行作品带到手机。场馆通过可交换的展陈包编排故事、入场选择和完成条件；共享展屏负责连续接待，个人设备负责收藏与继续创作。

## 产品能力

- **游客创作**：五种参数纹样、16×16手刻花版、排布与留桥、四套蓝色配方、真实局部施浆、浸染及揭纹。相同作品数据用于平面成布、立体验布、生活应用、PNG和可编辑JSON。
- **场馆策展**：表单编辑故事、入场花版、路径、开放控件、完成条件与纪念卡；支持导入导出、游客预览、保存新版本及启用。
- **连续接待**：公共模式只保存当前页面内存状态；“下一位”和空闲倒计时复位清除前一位的作品身份、撤销、印记与未应用画稿。延迟导入／导出通过会话代数隔离。
- **手机带走**：展屏提交作品快照，生成24小时有效的领取二维码。手机连接同一网络，下载1440×1080纪念卡或花版，并在个人工坊接续编辑。

内置两份展陈：`flowers`“寻花成布”开放全部五种控制组；`night`“夜色成蓝”固定黛夜与深度5，以夜莲、麦枝组织另一条旅程。场馆更换故事与规则时复用同一软件内核。

## 快速启动

使用Node.js 24或更新的兼容版本，无需安装npm运行时依赖。

```powershell
node --version
node server.mjs --host 127.0.0.1 --port 8769 --data ./data
```

在展屏主机打开：

- 游客展厅：`http://localhost:8769/`
- 策展工作台：`http://localhost:8769/curator.html`
- 个人工坊：`http://localhost:8769/?mode=personal`

仅本机体验不生成手机领取二维码。需要扫码时，使用本机实际局域网地址替换示例：

```powershell
node server.mjs --host 0.0.0.0 --port 8769 --public-url http://192.168.1.20:8769 --data ./data
```

展屏继续通过localhost打开以取得本机运营权限；手机连接同一可互访网络。启动时`claimReady`校验地址、监听与端口，实际网络还须用手机访问一次。当前领取部署使用局域网HTTP，不将未验证的外部HTTPS代理地址视为已就绪。详细配置、备份和故障处理见[部署指南](docs/deployment.md)。

## 一次完整体验

1. 策展人编辑展陈、预览、保存新版本，再启用。
2. 游客选择意象，探索手艺，施浆、浸染并揭纹。
3. 命名作品，生成纪念卡，点击领取显示二维码。
4. 手机领取、下载或继续编辑；展屏点击“下一位”。

正在进行的会话使用入场展包版本，新游客读取当前启用版本。公共展屏刷新后重新开始；个人模式在同一设备、浏览器和站点地址内保留草稿与布册。个人JSON可用于手动备份转移。

## 结构与接口

```text
site/                 游客、策展、领取界面及创作内核
lib/exhibit-pack.js   展包与作品封装共享校验
packs/                两份可直接编辑的展陈包
server.mjs            Node内置HTTP与SQLite服务
tests/                展包、服务及策展测试
docs/                 产品、协议、部署及场景文档
UPSTREAM.json         复用来源、版本与逐文件SHA-256基准
.github/workflows/    Ubuntu／Windows上的Node 24测试
```

`GET /api/bootstrap`提供当前展包、领取配置及本机运营令牌；`GET /api/exhibit`读取当前展项。运营者通过`/api/packs`保存版本、`/api/activate`启用最近保存版本、`POST /api/artworks`创建作品快照；手机以`GET /api/artworks/{token}`读取。完整字段与权限见[部署指南](docs/deployment.md)及[展陈包规范](docs/exhibit-pack.md)。

`window.indigoWorkbench`公开同步`snapshot()`、`beginVisitor()`，以及`applyPreset()`、`loadDesign()`、`setAllowedControls()`。`indigo:change`传递规范化设计，`indigo:session-reset`通知附属模块复位。服务独立复算覆盖率和完成条件，固定字段以保存的展包为准。

## 验证与当前状态

```powershell
node --test tests/*.test.mjs site/*.test.mjs
```

测试覆盖掩膜与导入、作品身份和撤销、公共会话及异步隔离、展包规则、服务权限、不可变版本、有效期和策展草稿。部分WebGL与DOM测试使用状态桩，真实画面另行验收。局域网相关服务测试按运行环境决定是否执行，检查输出中的跳过项。

Node.js 24.19.0下196项测试通过，0失败、0跳过。浏览器已走通两展项、部分施浆至领取和独立页面接续、PNG/JSON真实下载、断网恢复重试、新游客隔离与空闲提示取消；服务快照、下载JSON和接续设计逐字段相等。公开源码保留全部自动化用例，现场运行数据库、领取凭据与操作截图不随源码分发。真实手机、实体触屏和跨GPU尚未实机验证。

GitHub Actions在Ubuntu和Windows上使用Node 24运行同一测试命令；项目没有npm依赖，无需执行`npm install`或`npm ci`。本地也可用`npm test`调用相同脚本。查看每次运行的通过、失败与跳过项，以该次CI输出为准。

数字防染以孔洞、施浆与留白的关系支持工艺理解；色深提供数字配方选择，网格连通检查帮助观察刻版留桥。两套场馆运营方案、接待排程模型和作品JSON载荷量测见[场景设计](docs/scenarios.md)，可用于安排展屏、体验时长与存储预算。

## 文档与协作

- [作品介绍](docs/project-introduction.md)、[技术报告](docs/technical-report.md)
- [展陈包规范](docs/exhibit-pack.md)、[部署指南](docs/deployment.md)、[场景设计](docs/scenarios.md)
- [贡献指南](CONTRIBUTING.md)、[安全说明](SECURITY.md)、[变更记录](CHANGELOG.md)
- [资源与第三方归属](THIRD_PARTY.md)

本工程复用并改造“留白成蓝”v0.6.1艺术工坊，基准见`UPSTREAM.json`。分发基准记录来源项目、版本与逐文件哈希。新增展陈包、策展、公共会话、服务和领取形成当前产品。项目自有软件采用[MIT许可](LICENSE)，第三方字体、二维码库及衍生资源分别保留原许可和归属；版本变化见[CHANGELOG](CHANGELOG.md)。
