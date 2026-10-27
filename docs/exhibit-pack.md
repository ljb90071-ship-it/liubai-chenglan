# 展陈包规范

展陈包将场馆故事、入场花版、游客路径、完成条件和纪念卡组织为可校验JSON。协议版本为`schemaVersion: 1`，校验入口为`lib/exhibit-pack.js`的`validateExhibitPack()`。可以直接以`packs/flowers.json`或`packs/night.json`为起点编辑；完整运行机制由平台提供，内容包无须携带JavaScript。

## 内容与范围

| 字段 | 类型与约束 | 用途 |
|---|---|---|
| `schemaVersion` | 固定为1 | 数据结构版本 |
| `id` | 1–48位小写字母、数字、`_`、`-`，首位为字母或数字 | 展包稳定标识 |
| `version` | 1–40位字母、数字、`.`、`_`、`-`，首位为字母或数字 | 不可覆盖的保存版本 |
| `title` / `venue` | 最多80／100字符 | 展项名称与展出地点 |
| `intro` / `ending` | 各最多1200字符 | 入场故事与结束寄语 |
| `steps` | 4–5个不同步骤 | 游客故事路径 |
| `choices` | 1–8项 | 入场意象及初始花版 |
| `allowedControls` | 五种控制组的无重复子集 | 允许游客修改的参数 |
| `conditions` | 0–12项，全部满足 | 完成与领取判定 |
| `card` | `headline`最多80、`caption`最多400字符 | 纪念卡标题与说明 |
| `sources` | 0–12个`{title,url}` | HTTP(S)来源与延伸阅读 |
| `idleSeconds` | 30–3600整数秒 | 无操作提示时间 |
| `countdownSeconds` | 5–120整数秒 | 返回入场页前倒计时 |

对象拒绝未知字段，数组拒绝空项，文字拒绝不支持的控制字符。来源网址必须为无账号密码的HTTP(S)地址。展包保存不下载链接中的网页或图片；外部资源的分发仍需记录独立来源和许可。

## 路径、入场选择与控件

`steps`须以`choose`开始、`takeaway`结束，包含`create`与`reveal`，且创作先于揭纹。`explore`可省略，也可在创作前后安排。

```json
["choose", "explore", "create", "reveal", "takeaway"]
```

每个`choice`包含唯一`id`、最多48字符的`title`、最多300字符的`description`及`preset`。预设需提供下列所有字段，`customPattern`除外：

| 预设字段 | 允许值 |
|---|---|
| `motif` | `flower`、`wave`、`seed`、`lotus`、`sprig`、`custom` |
| `repeat` / `frame` | `straight`、`staggered`、`mirror`；`open`、`bordered` |
| `spacing` / `rotation` / `motifScale` | 60–150、0–180、70–125的整数 |
| `bridge` | 布尔值 |
| `dyePalette` / `dyeDepth` | `indigo`、`teal`、`midnight`、`slate`；1–5整数 |
| `customPattern` | 可选，256个0或1，按行排列的16×16花版 |

`createPreset(pack, choiceId)`由预设生成标准设计文档，初始施浆为空，制作阶段为`coat`。预览可以显式生成满浆样布；游客制作台仍从实际施浆开始。

控制组与参数映射为：`motif`对应纹样；`layout`对应排布、边式、间距、转角及尺度；`custom`对应个人花版；`palette`对应色系与深度；`bridge`对应留桥。自刻应用同时将纹样改为`custom`，因此内容包应同时开放`motif`与`custom`。未开放的字段保持对应入场选择的值，前端操作和服务端作品提交分别检查；工序限制继续生效。

## 完成条件

每项条件为`{field, operator, value}`。`stage`、`motif`、`repeat`、`dyePalette`仅支持`eq`；`coverage`、`dyeDepth`、`customCells`支持`eq`、`gte`、`lte`。覆盖率范围0–100，色深1–5，自刻孔格0–256。所有条件按逻辑与组合，即使空条件也必须完成揭纹。

```json
[
  {"field":"coverage","operator":"gte","value":1},
  {"field":"dyePalette","operator":"eq","value":"midnight"},
  {"field":"dyeDepth","operator":"eq","value":5},
  {"field":"stage","operator":"eq","value":"reveal"}
]
```

覆盖率由真实掩膜中的已施浆孔洞数除以全部孔洞数计算，不采用控件滑动距离。`customCells`只计个人花版中的孔格；若完成目标要求使用该花版，应同时加`motif=custom`。避免将浮点覆盖率设为难以恰好到达的`eq`值；通常采用上下界。

## 版本与运营

策展工作台修改已保存内容时自动提出下一补丁版本；保存和启用是两个动作。服务以`id+version`保存不可变内容，相同版本的不同内容返回409。当前启用接口按`id`选取该展包最后保存版本；它不按语义版本排序，也不提供任意历史版本回滚入口。

“寻花成布”开放全部控制组，以轻量施浆和揭纹形成入门旅程；“夜色成蓝”固定`midnight`及深度5，开放纹样、排布、自刻和留桥。两包均为120秒无操作提示、20秒倒计时。数字色深用于视觉创作，不能作为实际植物染色次数与实测色卡之间的标定关系。

## 作品封装与校验

领取提交体为`{"envelope": ...}`，封装含`schemaVersion`、`design`、`exhibit`、`choice`、`card`、`sessionId`。`design`是引擎完整序列化文档；服务端依据已保存展包版本确认选择、锁定参数及完成条件，并使用服务器端标题、场馆、选择与卡片文字生成规范化快照。

设计JSON用于个人继续编辑，展包JSON用于运营内容交换，两者不可混用。策展预览中的修改尚未启用，预览作品不会提交领取服务。
