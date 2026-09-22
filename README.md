# QS 2025 世界大学TOP 100 交互展示平台

## 项目概述

本项目是一个基于 QS 2025 世界大学排名的交互式前端展示平台，现已收录完整的 TOP 100 数据集。页面沿袭 Apple 官网的极简设计风格，提供流畅、直观的探索体验。

## 核心功能

- 动态展示 TOP 100 高校的排名、地区、亮点等详细信息，并支持搜索与区域筛选

- 点击卡片查看完整信息：
  - 排名与基本信息
  - 历史背景
  - 学科优势
  - 参访攻略

- D3 + TopoJSON 驱动的真实地理投影地图，按照国家高校数量自动着色，支持鼠标/触控悬停查看详情
- 数据加载提供在线 `fetch` 与离线内置双通道，直接双击 `index.html` 亦可正常浏览

## 快速开始

1. 可直接访问 https://anonymous2333333.github.io/QS-2025-World-University-Rankings-Top-100-Guide
2. 克隆或下载本仓库后，直接打开 `index.html` 即可浏览全部内容；如需本地服务器，可在项目根目录运行任意静态服务（如 `npx serve .`）。
3. 数据位于 `data/universities.json`，可通过 `scripts/build-university-data.js` 从 Markdown 源文件自动生成。
4. 若需在离线场景使用，`data/universities.inline.js` 与 `data/world-110m.inline.js` 会为主脚本提供兜底数据，无需额外配置。

## 第一轮迭代目标与验收建议

- **加载速度**：首屏可交互时间稳定，数据加载失败时能自动兜底与提示。
- **交互流畅度**：搜索、筛选、滚动、地图缩放不卡顿，减少重复渲染。
- **安全与健壮性**：动态内容渲染默认转义，降低 XSS 风险；数据异常可被提前发现。
- **可访问性**：支持键盘触达核心功能（筛选、卡片、弹窗）。

## 数据更新流程（Markdown → JSON → 页面）

1. 更新源文件 `QS2025 top100.md`。
2. 在项目根目录执行：
   - `npm run build:data`：从 Markdown 重新构建 `data/universities.json`（含校验）。
   - `npm run check:data`：执行数据 smoke check。
3. 本地打开 `index.html` 或使用静态服务检查页面展示是否正常。

## 发布前最小化检查（Smoke Check）

- 推荐命令：`npm run smoke`
- 该命令会串行执行数据构建与结构校验，确保：
  - JSON 可解析
  - 条目非空
  - `rank/name/country` 核心字段完整
  - 排名无重复

## 回滚建议

- 若本次数据更新有误，可优先回滚以下文件到上一个稳定版本：
  - `data/universities.json`
  - `data/universities.inline.js`（如有同步更新）
  - `QS2025 top100.md`
- 回滚后重新执行 `npm run smoke`，确认数据与页面均恢复正常。

## 联系我
如有任何问题或建议，欢迎通过邮箱 `1480380934@qq.com` 联系我。
