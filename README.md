# QS 2025 世界大学探索指南

可离线使用的大学探索与校园参访指南。使用原生 HTML、CSS、JavaScript 和仓库自带的 D3 / TopoJSON，无运行时 CDN、无框架、无第三方 npm 依赖。

## 这次增加了什么

- 蓝白页面、深浅色切换、手机布局、卡片和紧凑两种视图。
- 中英文关键词搜索，支持组合区域、国家或地区、名次段、学科方向；结果计数、可移除筛选标签、分页和排序。
- 全球地图随筛选更新；点击国家或地区筛选整组学校，香港和新加坡有独立标记，全部地区也能通过按钮选择。
- 本地收藏、最多 4 校并排对比、可展开的完整历史与参访资料。
- URL 保存筛选、页码、详情和对比名单；浏览器返回/前进恢复相应状态。
- 导出当前所有筛选结果为带 UTF-8 BOM 的 CSV（包含其他分页），对公式注入做转义。
- 请求超时或数据异常时回退到内置完整数据；地图异常不阻止阅读；数据完全缺失时提供重试。
- 原生 `dialog` 的键盘焦点约束与 Escape 关闭、焦点恢复、屏幕阅读器标签、搜索快捷键 `/`、减少动态效果支持。

## 运行

解压后直接双击根目录的 `index.html`。此时通过内置脚本读取数据，不需要联网、Node 或安装依赖。分享本地 `file://` 路径只对本机有效。

也可以在项目根目录运行：

```bash
python3 -m http.server 3000
```

然后访问 `http://localhost:3000`。此时可以通过链接恢复学校、筛选条件和对比名单。收藏和主题存放在本机浏览器；禁用存储时仍可使用当前页面。

## 数据与名次

收录 100 所院校、25 个国家与地区、5 个地理区域。数字由数据计算。

原 Markdown 表格的 1–100 是行序号，原程序将其作为名次，遗漏了并列。现通过 [`data/rank-corrections.json`](data/rank-corrections.json) 修正 14 条名次，保留其他记录；`sourceIndex` 保留原始序号，`id`（如 `qs2025-048`）是独立且稳定的身份标识，不能用名次替代。

核对依据：[QS 2025 官方页面](https://www.topuniversities.com/world-university-rankings/2025)、[QS 发布表格（马来西亚理工大学保存）](https://sps.utm.my/wp-content/uploads/2024/09/2025-QS-World-University-Rankings-2.2-For-qs.com_.pdf)。表格同时提供 `INDEX` 和 `2025 RANK`，本项目使用后者。

历史、学科亮点与参访攻略沿用 [`QS2025 top100.md`](QS2025%20top100.md)，未逐项独立核验；原资料中的院校现名、描述和开放政策可能过时。**2025 年资料不代表最新排名。** 学科筛选只对亮点字段进行关键词匹配，不是 QS 学科排名，也不代表学校完整的专业目录。

生成器同时修复了加粗章节标题无法识别、两个第 94 章相互覆盖、中文冒号和 Windows 换行等问题。生成前验证全部 100 所院校的唯一编号与完整章节，再同步输出两个数据通道：

```bash
npm run data
```

不要只手动修改 `universities.json` 而遗漏离线脚本；优先修改 Markdown 或修正表后重新生成。

## 开发与验证

需要 Node.js 18 或以上，无需执行 `npm install`：

```bash
npm run check
npm run build
```

`check` 运行语法检查和 Node 内置测试。`build` 可选，将站点资源复制到 `dist/`，便于部署到 GitHub Pages 等静态托管；根目录仍可直接打开。GitHub Actions 在 Node 22 / 24 上执行同样的检查和静态导出。实际浏览器验证和限制见 [`docs/VALIDATION.md`](docs/VALIDATION.md)。

## 文件结构

| 文件 | 用途 |
| --- | --- |
| `index.html` / `styles.css` | 页面结构、响应式布局与主题 |
| `script.js` | 页面交互、地图、弹窗、下载 |
| `js/core.js` | 纯函数：规范化、筛选、URL、存储、容错加载与 CSV |
| `scripts/build-university-data.js` | 从 Markdown 同步生成 JSON 和离线数据 |
| `data/rank-corrections.json` | 并列名次与院校英文名的可追溯修正 |
| `tests/core.test.js` | 数据与关键行为回归测试 |
| `docs/IMPLEMENTATION.md` | 设计和实现说明 |

原项目：[anonymous2333333/QS-2025-World-University-Rankings-Top-100-Guide](https://github.com/anonymous2333333/QS-2025-World-University-Rankings-Top-100-Guide)。
