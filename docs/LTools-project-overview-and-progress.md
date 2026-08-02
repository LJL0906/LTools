# LTools 项目基础信息与开发进度

- **项目名称：** LTools
- **当前版本：** 0.1.0
- **最后更新：** 2026-08-02
- **项目路径：** `D:\project\ljl\project\LTools`
- **文档定位：** 项目基础信息、当前进度和后续任务的唯一非 UI 文档

## 1. 项目定位

LTools 是面向 Windows 10/11 的本地优先桌面效率工具，计划提供链接管理、笔记、剪切板和设置能力。当前阶段先完成统一、紧凑的公共 UI 与模块静态交互，再逐步接入本地持久化和 Windows 系统能力。

## 2. 模块状态

| 模块 | 状态 | 当前能力 |
|---|---|---|
| 链接 | 静态交互已完成 | 搜索、分组筛选、新增、编辑、删除、复制反馈 |
| 笔记 | 静态交互已完成 | 搜索、分组筛选、新建、切换、标题与正文编辑、删除、Tiptap 富文本格式化 |
| 剪切板 | 未开发 | 当前仅有路由和空白占位页 |
| 设置 | 未开发 | 当前仅有路由和空白占位页 |
| 快捷搜索面板 | 未开发 | 尚未创建独立 Tauri 窗口和快捷键行为 |

## 3. 技术栈

### 桌面和前端

- Tauri 2
- React 19
- TypeScript 5.8
- Vite 7
- React Router 7
- Zustand 5（依赖已安装，尚未使用）
- pnpm 11
- Node.js 22+

### 编辑器和 UI

- Tiptap 3：已接入笔记富文本编辑器（StarterKit + 任务列表/图片/颜色扩展）
- Lucide React：依赖已安装，现有部分界面仍使用字符图标
- CSS Tokens：已建立颜色、圆角和 4px 间距阶梯

### 测试

- Vitest
- Testing Library
- jsdom

### Rust 和 Tauri

Rust 工程已经建立，依赖包含 `rusqlite`、`uuid`、`time`、`zip`、`image`、`sha2` 和 Windows API bindings。

已注册的 Tauri 插件：

- single instance
- global shortcut
- autostart
- dialog
- opener

当前只完成插件注册和基础窗口启动。SQLite 业务持久化、系统托盘、快捷键业务、剪切板监听、备份恢复等尚未实现。

## 4. 应用配置

| 项目 | 值 |
|---|---|
| 应用版本 | 0.1.0 |
| Tauri identifier | `com.ltools.app` |
| 默认窗口 | 960 × 680px |
| 最小窗口 | 720 × 520px |
| 开发地址 | `http://127.0.0.1:1420` |

## 5. 项目结构

```text
LTools/
├── docs/
│   ├── LTools-project-overview-and-progress.md
│   ├── ui/                # UI 设计规范与 V9 原型
│   └── superpowers/       # 历史实施计划与设计规格
├── public/
├── src/
│   ├── components/
│   │   ├── layout/        # AppShell / TopNavigation / ModuleLayout
│   │   ├── shadcn/ui/     # shadcn 生成组件
│   │   └── ui/            # 业务包装组件（Button / Dialog / SearchBox 等）
│   ├── features/
│   │   ├── groups/        # 分组管理
│   │   └── links/         # 链接模块
│   ├── pages/             # LinksPage / NotesPage / 占位页
│   ├── styles/            # tokens.css / global.css / App.css
│   ├── lib/
│   └── test/
├── src-tauri/
│   ├── src/               # main.rs / lib.rs（脚手架：插件注册 + 窗口初始化）
│   ├── capabilities/      # 前端权限配置
│   └── tauri.conf.json
├── package.json
└── vite.config.ts
```

## 6. 开发命令

```powershell
pnpm install
pnpm dev
pnpm tauri dev
pnpm exec vitest run
pnpm build
```

## 7. UI 基准

UI 文档统一保存在：

- `docs/ui/common-ui-foundation.md`
- `docs/ui/theme-layout-v9.html`

已确认的紧凑布局约束：

- 垂直 `margin/padding` 不超过 24px。
- 水平 `margin/padding` 不超过 16px。
- 间距使用 4/8/12/16/20/24px 阶梯。
- 20px 和 24px 只用于垂直方向。
- 搜索框、按钮、卡片、列表和工具栏使用满足内容与操作需要的最小合理尺寸。
- 链接和笔记可保留业务布局差异，但共享统一字号、控件和间距规格。
- 不通过拉高卡片、拉宽侧栏或添加虚假内容填充空白。

## 8. 已完成

### 工程基础

- Tauri 2、React、TypeScript、Vite 项目骨架。
- pnpm、Vitest、Testing Library 和 jsdom。
- 主窗口尺寸、CSP 和基础 Tauri 插件配置。
- 前端测试和生产构建流程。

### 公共 UI

- React Router 四模块导航。
- `AppShell`、`TopNavigation` 和 `ModuleLayout`。
- `Button`、`IconButton`、`SearchBox`。
- `Dialog` 和 `ConfirmDialog`。
- 公共分组选择器、菜单、新建、重命名和删除弹窗。
- 公共颜色、圆角和间距 tokens。

### 链接模块

- 搜索标题、URL 和备注。
- 全部、指定分组和未分组筛选。
- 添加、编辑和删除链接。
- 复制地址及“已复制”反馈。
- 分组新建、重命名和删除基础交互。

### 笔记模块

- 搜索标题和正文。
- 全部、指定分组和未分组筛选。
- 新建、切换和删除笔记。
- 标题和正文编辑。
- 工具栏真实富文本格式化：粗体、斜体、删除线、项目符号/编号/待办列表、链接、代码块、引用、图片（编辑器命令 + `isActive` 状态驱动）。
- 筛选结果和右侧编辑器同步。
- 删除所有笔记后保留侧栏和“暂无笔记”状态。

## 9. 当前验证基线

```text
Test Files  7 passed
Tests      26 passed
pnpm build passed
```

（2026-08-02 实测：`pnpm exec vitest run` 7 文件 / 26 用例全部通过，含侧栏拖拽、分组管理、链接与笔记 CRUD 交互、Tiptap 真实格式状态与切换同步、插入链接、可访问性语义。）

该结果只代表当前前端静态交互和构建基线，不代表数据库、正式富文本或完整 Tauri 系统集成已经完成。

## 10. 当前公共能力与后续调整

### UI 协调

- 笔记模块密度已调整（2026-08-02）：标题 28px → 18px（普通字号层级）、内容 16px → 14px、工具栏 48px → 38px（按钮 34 → 26px）、标题行内边距收紧。
- 已修复 Tailwind v4 preflight 抹掉列表标记的问题（`ol/ul { list-style: none }`），为编辑器内容恢复完整排版：列表符号与缩进、待办 checkbox 布局、引用左边框、代码块背景、链接颜色、标题字号、分隔线、图片。
- 统一两个模块的字号阶梯。
- 协调搜索框宽度。
- 统一 30/34/36px 控件高度规格。
- 收紧卡片、列表、弹窗和工具栏垂直空间。
- 将不稳定的字符图标替换为统一图标组件。

### 左侧栏拖拽

公共 `ModuleLayout` 的左侧栏拖拽能力已经完成：

- 使用 1px 可见分隔线和约 8px 透明命中区，扩大可操作范围但不增加可见留白。
- 使用 Pointer Events（`pointerdown`、`pointermove`、`pointerup`）及 pointer capture 完成连续拖拽。
- 分隔线使用 `cursor: col-resize`，拖动期间临时禁用文本选择。
- 可访问性语义为 `role="separator"`、`aria-orientation="vertical"`，并暴露当前值和允许范围。
- 左/右方向键每次调整 8px，Shift + 左/右方向键每次调整 16px。
- 链接模块宽度：默认 216px、最小 160px、配置最大值 320px。
- 笔记模块宽度：默认 304px、最小 240px、配置最大值 420px。
- 实际最大宽度取模块配置最大值与容器可用宽度约 40% 中的较小值，避免过度压缩右侧内容区。
- 链接与笔记模块分别维护独立宽度；宽度保存在前端运行期内存中，切换模块后可恢复，刷新或重启后回到默认值，不做持久化。
- 已补 Pointer 拖拽、键盘步进、最小/最大边界、40% 容器限制和模块独立状态测试。

### 公共交互

- Dialog 初始焦点、焦点陷阱和关闭后焦点恢复。
- 分组菜单键盘操作和点击外部关闭。
- `textarea`、`select` 的统一 `focus-visible`。
- 搜索零结果状态和辅助技术播报。

## 11. 尚未完成

### 前端业务

- 链接“打开”按钮的最终行为。
- 笔记分组管理完整交互（拖拽排序等）。
- 剪切板模块和设置模块。
- 数据导入、导出和备份界面。

### 数据层

- SQLite 初始化和迁移。
- 链接、笔记、分组和设置持久化。
- 图片与附件管理。
- 备份和恢复。

### Windows 集成

- 系统托盘。
- 全局快捷键业务。
- 快捷搜索独立窗口。
- 剪切板监听。
- 开机启动设置界面。
- 安装包和发布验证。

## 12. 已知问题和待确认事项

1. 链接分组删除当前会把组内链接移到未分组，该策略尚未最终确认。
2. 链接卡片是否展示备注摘要需要重新确认并同步 UI 原型。
3. 笔记搜索匹配的是 HTML 正文，跨标签文本（如加粗分词）和标签噪声可能影响命中；当前示例数据均为单段落，暂可接受。
4. 链接“打开”和笔记“管理分组”按钮仍缺少完整行为。
5. 当前数据均为 React 内存状态，刷新后恢复示例数据。
6. 搜索状态下编辑内容可能使当前条目不再匹配并离开结果。
7. 当前 UI 仍需继续复查字号、搜索框和控件密度；侧栏宽度已支持公共拖拽调整。
8. capabilities 中 `global-shortcut:default` 实际授予 0 个命令（Tauri 默认策略：快捷键默认不开放），前端调用快捷键 `register`/`isRegistered` 会被拒绝；接入快捷键业务前需显式授予权限。
9. Rust 侧 8 个预留依赖（rusqlite、uuid、time、thiserror、zip、image、sha2、windows）当前源码零引用，属“死依赖”，会拖慢编译与增大二进制；建议在真正接入对应功能时再启用。
10. `index.html` 的 `<title>` 与 `lang` 仍是脚手架默认（“Tauri + React + Typescript” / en），未随产品改名。
11. 前端存在少量备用资产/死代码：`GroupSelector` 组件、shadcn 的 `dropdown-menu`/`field`/`separator`、sonner Toaster（已挂载但无调用点），接入后续功能时可复用或清理。
12. Tiptap 已接入但有两项已知限制：jsdom 环境无法模拟 contenteditable 输入（格式化测试只验证状态与切换同步，真实输入需在 tauri dev 中冒烟）；链接/图片当前用 `window.prompt` 输入地址（原型方案，后续可换 Dialog）。

## 13. 推荐开发顺序

1. 完成公共 UI 尺寸和间距统一。
2. 补齐 Dialog、分组菜单和无行为按钮。
3. ~~接入 Tiptap~~（2026-08-02 已完成）。
4. 实现 SQLite 数据层和前后端命令边界。
5. 完成链接和笔记持久化。
6. 开发剪切板和设置模块。
7. 完成托盘、快捷键和快捷搜索窗口。
8. 执行 Windows 安装和发布验证。

## 14. 文档维护规则

- 本文件只维护项目基础信息、当前进度、已知问题和后续顺序。
- UI 视觉与交互规范只维护在 `docs/ui/`。
- 不再保留已失效的历史需求、技术方案和实施计划。
- 功能完成后同步更新状态和最近验证结果。
- 不将“依赖已安装”写成“功能已完成”。

