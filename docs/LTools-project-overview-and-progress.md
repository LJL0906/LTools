# LTools 项目基础信息与开发进度

- **项目名称：** LTools
- **当前版本：** 0.1.1
- **最后更新：** 2026-08-03
- **项目路径：** `D:\project\ljl\project\LTools`
- **文档定位：** 项目基础信息、当前进度和后续任务的唯一非 UI 文档

## 1. 项目定位

LTools 是面向 Windows 10/11 的本地优先桌面效率工具，计划提供链接管理、笔记、剪切板和设置能力。当前阶段先完成统一、紧凑的公共 UI 与模块静态交互，再逐步接入本地持久化和 Windows 系统能力。

## 2. 模块状态

| 模块 | 状态 | 当前能力 |
|---|---|---|
| 链接 | 静态交互已完成 | 搜索、分组筛选、新增、编辑、删除、复制反馈、localStorage 持久化 |
| 笔记 | 静态交互已完成 | 搜索、分组筛选、新建、切换、标题与正文编辑、删除、Tiptap 富文本格式化、localStorage 持久化 |
| 剪切板 | 已完成 | 系统剪贴板文本监听（Rust 轮询）、历史列表、复制回剪贴板、详情弹窗、删除、清空、搜索、SQLite 持久化 |
| 设置 | 已完成（全部真实生效） | 开机自启、托盘×2、全局快捷键、快捷搜索窗口与快捷键、窗口宽高、数据库存储路径（真实控制 SQLite 位置）、备份导入导出、重启、检查更新（GitHub Releases）；设置存 SQLite `app_settings` 表 |
| 数据层 | 已完成（SQLite） | 业务数据五表 + `app_settings` 表；写入为逐条 CRUD 命令（upsert/delete 单条，删组事务内移出组内条目），全量快照命令保留用于迁移/备份/切换库；localStorage 仅作浏览器降级与一次性迁移来源；数据库路径可配置 |
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

Rust 工程已经建立，依赖包含 `rusqlite`、`uuid`、`time`、`zip`、`image`、`sha2`、Windows API bindings 和 `arboard`（剪切板监听，已启用）。

已注册的 Tauri 插件：

- single instance
- global shortcut
- autostart
- dialog
- opener

当前完成插件注册、基础窗口启动和系统剪贴板文本监听（`clipboard.rs` 轮询）。SQLite 业务持久化、系统托盘、快捷键业务、备份恢复等尚未实现。

## 4. 应用配置

| 项目 | 值 |
|---|---|
| 应用版本 | 0.1.1 |
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
- localStorage 本地持久化（`src/lib/storage.ts`）：笔记、链接及各自分组变更后 **200ms 防抖写入**，`beforeunload` / `visibilitychange(hidden)` / 组件卸载时强制 flush 兜底，刷新/重启后自动恢复，无保存按钮。

### 公共 UI

- React Router 四模块导航。
- `AppShell`、`TopNavigation` 和 `ModuleLayout`。
- `Button`、`IconButton`、`SearchBox`。
- `Dialog`（支持 `className` 定制容器样式）和 `ConfirmDialog`。
- 公共分组选择器、菜单、新建、重命名和删除弹窗。
- 公共颜色、圆角和间距 tokens。

### 链接模块

- 搜索标题、URL 和备注。
- 全部、指定分组和未分组筛选。
- 添加、编辑和删除链接。
- 复制地址及“已复制”反馈。
- 分组新建、重命名和删除基础交互。

### 剪切板模块

- 系统剪贴板文本监听：Rust 后台线程每 600ms 轮询剪贴板纯文本（`arboard`），与上次值不同时通过 `clipboard-changed` 事件推送给前端；首读仅作基线不推送，空白/非文本/锁定跳过。
- 历史列表：文本内容 3 行预览（`pre-wrap` 保留换行）、相对时间（刚刚 / N 分钟前 / N 小时前 / 日期）、点击条目或复制按钮写回系统剪贴板（`navigator.clipboard.writeText`），带"已复制 / 复制失败"反馈。
- 查看详情弹窗：展示完整文本（最长 10,000 字符）；弹窗整体限高 `min(78dvh, 520px)`，header/footer 固定、内容区弹性滚动（12.5px 字号、`pre-wrap` 保留换行），footer 一键复制并反馈状态。
- 保留最新 30 条，超出裁剪最旧。
- 去重：与最新一条相同则跳过（防监听循环）；同文本旧条目去重置顶。
- 手动添加文本条目（Dialog + textarea）作为非 Tauri 环境的兜底入口。
- 单条删除、清空全部均经 ConfirmDialog 确认；顶部搜索框复用公共搜索，内容匹配过滤；空状态复用公共 Empty 组件。
- 数据存入 `ltools.clipboardItems`（localStorage 防抖持久化），单条文本截断到 10,000 字符防容量溢出。

### 笔记模块

- 搜索标题和正文。
- 全部、指定分组和未分组筛选。
- 新建、切换和删除笔记。
- 标题和正文编辑。
- 工具栏真实富文本格式化：粗体、斜体、删除线、项目符号/编号/待办列表、链接、代码块、引用、图片（编辑器命令 + `isActive` 状态驱动）。
- 筛选结果和右侧编辑器同步。
- 删除所有笔记后保留侧栏和“暂无笔记”状态。

### 设置模块与 SQLite 数据层（2026-08-03）

- **SQLite 数据层**（`src-tauri/src/db.rs`）：五张业务表（links/link_groups/notes/note_groups/clipboard_items）+ `app_settings` 表；写入以**逐条 CRUD 命令**为主（`upsert_link/delete_link/upsert_link_group/delete_link_group/upsert_note/delete_note/upsert_note_group/delete_note_group/upsert_clipboard_item/delete_clipboard_item/clear_clipboard_items`，删组命令在事务内把组内条目移到未分组；`get_all_data`/`replace_all_data` 全量命令保留用于一次性迁移 / 备份导入导出 / 切换库）；默认库 `app_data_dir/ltools.db`。
- **所有设置存 SQLite** `app_settings` 表（单行 JSON，`#[serde(default)]` 向前兼容）；旧版 `settings.json` 首次启动自动迁移；写入同步到「当前库 + 默认引导库」两份，`db_path` 作为引导指针。
- **数据库存储路径真实生效**：设置目录 → `目录/ltools.db`；切换时自动迁移数据与设置；启动时从默认引导库读取 `db_path` 并切换到目标库。
- **localStorage → SQLite 迁移**：前端 data 层首次检测到库空且有残留数据时自动一次性导入；浏览器 dev / 测试模式仍降级 localStorage。
- 开机自启动：前端直接调 autostart 插件（`enable`/`disable`/`isEnabled`），失败回滚并提示。
- 启动/关闭最小化到托盘：`tray-icon` feature + `TrayIconBuilder`（菜单：显示主窗口 / 退出，左键单击显示）；`on_window_event` 拦截 `CloseRequested`。
- 全局快捷键 + 快捷搜索快捷键：Rust 侧 `on_shortcut` 注册，分别**切换**主窗口显示/隐藏（显示时按 → 隐藏到托盘，隐藏时按 → 唤出；托盘图标/菜单仍为"只显示"）、唤起快捷搜索窗口。
- 主窗口任务栏规则：显示期间不占任务栏（`skipTaskbar`），仅用户主动最小化时出现在任务栏（可恢复），恢复后再次隐藏。
- 快捷搜索窗口：独立 `search` 窗口（560×440），复用前端入口按 label 路由 `/search`；全局搜索链接与笔记，点击链接打开浏览器；结果支持 ↑/↓ 选择 + 回车打开（默认选中第一项），无本地结果时提供「在百度中搜索」兜底条目，回车/点击用默认浏览器打开百度搜索关键词。
- 窗口宽高：≥640×400 校验，Rust 保存并即时应用，启动优先于默认布局。
- 备份导入导出：zip 打包（`manifest.json`：format/version/exported_at/data）；导入校验后写回 SQLite（settings 走 set_settings）并刷新。
- 重启应用：`restart_app` command。
- **检查更新真实可用**：tauri-plugin-updater + GitHub Releases 端点 + 签名（密钥对 `.tauri/*.key`，私钥入 Secrets，发布流程见 `docs/RELEASE.md`）；有新版自动下载安装并重启。
- 浏览器 dev 模式降级：非 Tauri 环境设置存 localStorage（`ltools.settings`），系统级按钮禁用。

## 9. 当前验证基线

```text
Test Files  13 passed
Tests      72 passed
pnpm build passed
```

（2026-08-03 实测：`pnpm exec vitest run` 15 文件 / 94 用例全部通过，含侧栏拖拽、分组管理、链接与笔记 CRUD 交互、Tiptap 格式状态、localStorage/SQLite 数据层双路径读写与迁移、逐条 CRUD 命令（数据层 11 用例）、剪切板监听与 30 条裁剪、设置页全部开关/校验/快捷键绑定(点击录入组合键)/备份导入导出、快捷搜索页（键盘导航/百度兜底/失焦可用/路由隔离）。另 `cargo test`（db.rs 5 用例）、`cargo check`、`cargo build` 通过；真实应用冒烟启动正常，SQLite 落盘与 settings.json 迁移已验证。）

该结果代表当前前端交互、数据层与系统级集成的验证基线；在线更新与安装包需首个 Release 后验证。

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
- 笔记模块宽度：默认 240px、最小 240px、配置最大值 420px。
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
- 快捷搜索窗口的笔记结果点击后导航到主窗口对应笔记（当前为关闭搜索窗口）。

### 数据层

- 图片与附件管理。
- ~~逐条 CRUD 命令（当前为全量快照写，数据量大后可优化）~~（2026-08-03 已完成：业务数据写入改为逐条命令，全量快照命令保留用于迁移/备份/切换库）。

### Windows 集成

- ~~系统托盘~~（2026-08-03 已实现）。
- ~~全局快捷键业务~~（2026-08-03 已实现：唤起主窗口 + 快捷搜索窗口）。
- ~~快捷搜索独立窗口~~（2026-08-03 已实现）。
- ~~剪切板监听~~（2026-08-03 已实现文本轮询监听，图片/文件等非文本类型暂不支持）。
- ~~开机启动设置界面~~（2026-08-03 已实现）。
- ~~检查更新~~（2026-08-03 已接入 GitHub Releases updater）。
- 安装包和首次发布验证（首个 Release 冒烟）。

## 12. 已知问题和待确认事项

1. 链接分组删除当前会把组内链接移到未分组，该策略尚未最终确认。
2. 链接卡片是否展示备注摘要需要重新确认并同步 UI 原型。
3. 笔记搜索匹配的是 HTML 正文，跨标签文本（如加粗分词）和标签噪声可能影响命中；当前示例数据均为单段落，暂可接受。
4. 链接“打开”和笔记“管理分组”按钮仍缺少完整行为。
5. ~~当前数据均为 React 内存状态，刷新后恢复示例数据~~（2026-08-02 已接入 localStorage 防抖持久化 + 关闭兜底 flush）。
6. 搜索状态下编辑内容可能使当前条目不再匹配并离开结果。
7. 当前 UI 仍需继续复查字号、搜索框和控件密度；侧栏宽度已支持公共拖拽调整。
8. ~~capabilities 中 `global-shortcut:default` 实际授予 0 个命令~~（2026-08-03 全局快捷键已改为 Rust 侧注册，不经前端 IPC，无需前端权限；前端 `register`/`isRegistered` 调用仍会被拒绝，如未来改由前端注册需先补权限）。
9. Rust 侧预留依赖（rusqlite、zip、image 等）已随功能启用；`uuid`、`time`、`thiserror`、`windows` 仍有部分零引用，建议在真正接入时再启用。
10. `index.html` 的 `<title>` 与 `lang` 仍是脚手架默认（“Tauri + React + Typescript” / en），未随产品改名。
11. 前端存在少量备用资产/死代码：`GroupSelector` 组件、shadcn 的 `dropdown-menu`/`field`/`separator`、sonner Toaster（已挂载但无调用点），接入后续功能时可复用或清理。
12. Tiptap 已接入但有两项已知限制：jsdom 环境无法模拟 contenteditable 输入（格式化测试只验证状态与切换同步，真实输入需在 tauri dev 中冒烟）；链接/图片当前用 `window.prompt` 输入地址（原型方案，后续可换 Dialog）。
13. 剪切板监听采用 600ms 轮询（`arboard`）：复制相同文本不会重复入库（去重置顶）；图片/文件等非文本类型暂不入库；浏览器 dev 模式无系统监听，依赖手动添加入口。
14. 业务数据写入为逐条 CRUD 命令；`get_all_data`/`replace_all_data` 全量命令保留用于一次性迁移 / 备份导入导出 / 切换库（数据量增长后可再评估是否移除）。浏览器 dev 降级路径下，逐条写基于 localStorage 已有数据做增量，示例数据不再隐式落盘（属预期行为）。
15. 更新机制已配置（GitHub Releases + 签名密钥），但尚未经过真实发布验证；首个 Release 需在仓库配置 `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` Secrets（见 `docs/RELEASE.md`）。

## 13. 推荐开发顺序

1. ~~接入 Tiptap~~（2026-08-02 已完成）。
2. ~~设置模块（系统级）~~（2026-08-03 已完成：自启/托盘/快捷键/窗口/重启/备份导入导出/更新）。
3. ~~SQLite 数据层 + 设置入库 + 数据库路径生效~~（2026-08-03 已完成）。
4. ~~快捷搜索独立窗口~~（2026-08-03 已完成）。
5. 执行首个 Windows 发布（配置 Secrets → 打 tag → 验证自动更新）。
6. ~~数据层逐条 CRUD 优化~~（2026-08-03 已完成）。
7. 快捷搜索笔记结果联动主窗口导航。
8. 图片与附件管理。

## 14. 文档维护规则

- 本文件只维护项目基础信息、当前进度、已知问题和后续顺序。
- UI 视觉与交互规范只维护在 `docs/ui/`。
- 不再保留已失效的历史需求、技术方案和实施计划。
- 功能完成后同步更新状态和最近验证结果。
- 不将“依赖已安装”写成“功能已完成”。

