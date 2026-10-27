# 复用、资源与许可

项目自有软件与文档采用根目录[MIT许可](LICENSE)。独立第三方资源按原许可分发，原版权与许可文本继续保留；项目根许可不替代字体OFL。以下区分直接分发、项目资源复用与概念参考。

## 第三方代码

| 项目 | 位置与用途 | 固定来源与许可 |
|---|---|---|
| Project Nayuki QR Code generator，JavaScript实现 | `site/vendor/qrcodegen.js`，把服务返回的短领取URL编码为二维码 | [官方下载](https://www.nayuki.io/res/qr-code-generator-library/qrcodegen.js)、[项目说明](https://www.nayuki.io/page/qr-code-generator-library)；MIT，文件头保留Project Nayuki版权及全文 |

固定内容SHA-256：

```text
2511bc17f40a3c41d4a0578995db956b38997334d3d20113a5d4dc5c49c69480
```

本地文件已核对。这里以内容哈希标识版本，不以可变化的下载URL代替版本；平台调用该库编码，不将二维码标准或算法视为项目原创。

## 字体与衍生字形

字体来自Google Fonts官方CSS及`fonts.gstatic.com`端点，使用本地文件，无运行时CDN依赖。下表均为SIL Open Font License 1.1，版权、子集、转换与哈希见相应notice及`SOURCE.json`。

| 字体 | 分发文件 | 版权／许可入口 |
|---|---|---|
| Ma Shan Zheng 400 | `site/assets/type-v5/mashan.woff2`及题字`title-ma-outline.svg` | MaShanZheng Project Authors；[OFL](site/assets/type-v5/OFL-mashanzheng.txt) |
| Zhi Mang Xing 400 | `site/assets/type-v5/zhimang.woff2` | ZhiMangXing Project Authors；[OFL](site/assets/type-v5/OFL-zhimangxing.txt) |
| ZCOOL XiaoWei 400 | `site/assets/type-v5/xiaowei.woff2` | ZCOOL XiaoWei Project Authors；[OFL](site/assets/type-v5/OFL-zcoolxiaowei.txt) |
| Noto Sans SC 400／500 | `site/assets/type-v5/reading.woff2`、`reading-medium.woff2` | Adobe字体内版权保留；[OFL](site/assets/type-v5/OFL-notosanssc.txt) |
| Cormorant Garamond 400 | `site/assets/type-v5/latin.woff2` | Cormorant Project Authors；[OFL](site/assets/type-v5/OFL-cormorantgaramond.txt) |
| Noto Serif SC 500／700，早期子集 | `site/assets/indigo-serif-0.ttf`、`indigo-serif-1.ttf` | Adobe字体内版权及原许可头保留；[OFL](site/assets/OFL-NotoSerifSC.txt) |

当前六个WOFF2主要承担读写与题字，任意游客输入可能使用系统CJK回退。题字SVG采用原字体轮廓重新排版，不是新设计字体，分发时继续携带相应OFL与版权。详见[当前字体说明](site/assets/type-v5/FONT-NOTICE.txt)、[当前来源记录](site/assets/type-v5/SOURCE.json)及[早期Noto说明](site/assets/FONT-NOTICE.txt)。

## 既有项目与本机资源复用

| 资源 | 实际采用 | 归属与改动 |
|---|---|---|
| “留白成蓝”艺术工坊v0.6.1 | 花版、防染、WebGL布面、艺术展厅、字体、美术和既有测试 | 项目自有维护源，基准与SHA-256见`UPSTREAM.json`；本工程改造展项、策展、会话、服务及领取，原目录保留 |
| 本机`frontend-spectacle`的`assets/react/flow-field/FlowField.tsx` | `site/dye-field.js`局部采用`silk()`域扰动与层叠配色，改为原生WebGL单遍 | 来源`SOURCES.md`记为原工作区自写shader与交互提取；按项目自有改编代码采用MIT，源码头保留来源。未携入其React、Three.js、半浮点反馈系统或OGL代码 |

FlowField来源记录把OGL Flowmap列为双缓冲与衰减方法研究，注明无复制上游shader；它不是当前运行时依赖。Filament cloth model仅用于光照概念参考，WebGL Fundamentals用于API与方法研究，未分发完整渲染器。

## 项目美术

| 文件 | 性质与用途 |
|---|---|
| `site/assets/indigo-workshop.png` | 生成染坊意象，用于工艺文化画面 |
| `site/assets/art-v5/indigo-tide.png` | 生成透明蓝染布面雕塑，用于入口前景 |
| `site/assets/art-v5/resist-study-final.png` | 修订后的生成手作近景，用于工艺入口 |
| `site/assets/art-v5/resist-study.png` | 保留的生成过程稿，当前界面未采用 |
| `site/assets/art-v6/living-studio.png` | 生成工作室环境，游客布面由程序另行合成，来源见同目录`SOURCE.json` |

这些图片为项目生成的艺术资源，随软件分发，不是文物摄影、纪实工艺、真实工坊或真人采访证据。原创SVG标记、参数花版、织纹和Canvas物件由代码形成；入口美术与用户实际成布各有职责，不能互相替代。

## 内容来源与研究参照

蓝印内容采用[中国非遗网相关报道](https://www.ihchina.cn/project_details/11020/)、[浙江桐乡项目介绍](https://www.ihchina.cn/art/detail/id/14299.html)和[南通大学工艺介绍](https://fzfz.ntu.edu.cn/2019/1106/c2224a63310/page.htm)。地域事实按来源保留，不将桐乡构图写为南通统一规则。五种数字纹样名称为项目原创，未作为馆藏名称；未分发上述网站的馆藏照片或花版扫描。

[H5P规范](https://h5p.org/documentation/developers/h5p-specification)和[Lumi](https://lumi.education/en/)用于研究可交换互动内容及编辑流程，未复制代码、模板或素材；当前展包不是H5P文件。知识外链不授予内容或图片转载许可。

## 运行时

服务调用用户安装的Node.js 24标准库，包括HTTP、Crypto和SQLite，不捆绑Node二进制。`package.json`无npm运行时依赖。未来若随安装器捆绑运行时，应保留该具体发行版附带的许可证和第三方声明。
