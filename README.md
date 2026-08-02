# LTools

本地优先的 Windows 桌面效率工具 —— 链接管理与笔记。

基于 **Tauri 2 + React 19 + TypeScript** 构建的轻量桌面应用，采用紧凑、统一的 UI 设计，目标是把常用效率功能集中在一个快速、安静的桌面窗口里。

> ⚠️ **当前状态：早期开发中（v0.1.0）**。链接、笔记、剪切板与设置模块（含系统级集成）已完成；业务数据存 SQLite（`app_data_dir/ltools.db`，可配置路径），设置存同库 `app_settings` 表，均**自动本地保存**（无保存按钮）；在线更新已接入 GitHub Releases（待首次发布验证）。

## ✨ 功能特性

### ✅ 已实现

**链接管理**

- 添加 / 编辑 / 删除链接（支持 `https` / `http` / `ws` / `wss` 协议）
- 搜索链接（标题、URL、备注）
- 分组筛选（全部 / 未分组 / 指定分组）
- 一键复制地址，带"已复制 / 复制失败"反馈
- 在系统浏览器中打开链接（Tauri opener 插件）
- 分组管理：新建、重命名、删除

**笔记**

- 新建 / 编辑 / 删除笔记
- 搜索笔记（标题、正文）
- 分组手风琴侧栏（全部 / 分组 / 未分组），与编辑器联动
- Tiptap 富文本编辑器（粗体 / 斜体 / 删除线 / 列表 / 待办 / 链接 / 代码块 / 引用 / 图片）

**剪切板**

- 系统剪贴板文本监听（Rust 后台轮询，600ms），新复制内容自动入库
- 手动添加文本条目（非 Tauri 环境兜底）
- 历史列表：内容预览、相对时间、点击或按钮复制回剪贴板（带"已复制 / 复制失败"反馈）
- 查看详情弹窗：完整内容展示（弹窗整体限高，长文本区内滚动）+ 一键复制
- 保留最新 30 条，超出自动裁剪最旧
- 搜索、删除单条、清空全部，localStorage 自动持久化

**设置**（2026-08-03 全部真实生效）

- 开机自启动（autostart 插件，带成功/失败反馈）
- 启动最小化到托盘 / 关闭窗口时最小化到托盘（Tauri 系统托盘 + close 拦截）
- 全局快捷键（Rust 侧注册，按下唤起主窗口）
- 快捷搜索快捷键：独立搜索窗口（560×440，快捷键显隐循环、失焦自动隐藏；搜索链接直接打开默认浏览器、点击笔记唤起主窗口选中该笔记）
- 自定义窗口宽高（Rust 启动时应用，含最小值校验）
- 数据库存储路径：真实控制 SQLite 文件位置（默认 `app_data_dir/ltools.db`，切换自动迁移数据）
- 数据备份：导出（链接/笔记/剪切板/设置打包 zip）、导入恢复（校验后写回并刷新）
- 重启应用
- **检查更新**：真实可用（GitHub Releases 端点 + 签名校验，有新版自动下载安装重启；发布流程见 `docs/RELEASE.md`）
- **所有设置存 SQLite** `app_settings` 表（与业务数据同库，旧版 settings.json 自动迁移；非 Tauri 环境降级 localStorage）

**公共 UI**

- 可拖拽调整宽度的侧栏（Pointer Events 拖拽 + 键盘微调，含可访问性语义）
- 统一的 Dialog / ConfirmDialog / 搜索框 / 按钮 / 图标按钮 / Switch 组件
- 统一的颜色、圆角、间距设计 Token
- **数据自动保存**：笔记、链接及分组变更后防抖写入 localStorage（200ms 合并 + 关窗/切后台强制落盘），刷新或重启自动恢复，无保存按钮
- 42 个前端交互测试通过（2026-08-02 基线）；快捷键绑定接入后为 72 个

### 🚧 规划中

- 快捷搜索窗口 → 笔记结果点击后的主窗口导航联动（当前打开/关闭窗口）
- 图片与附件管理
- Windows 安装包发布验证（首次 Release 冒烟）

## 🛠 技术栈

| 领域 | 技术 |
|---|---|
| 桌面框架 | Tauri 2（Rust 后端） |
| 前端 | React 19、TypeScript 5.8、Vite 7 |
| 路由 | React Router 7 |
| UI | Tailwind CSS 4、shadcn/ui、Radix UI、Lucide 图标 |
| 状态管理 | Zustand（依赖已装，暂未使用） |
| 本地存储 | localStorage（防抖自动保存） |
| 富文本 | Tiptap 3（笔记编辑器已接入） |
| 测试 | Vitest 4、Testing Library、jsdom |
| 包管理 | pnpm 11 |
| 数据库（规划） | SQLite（rusqlite） |

## 📦 环境要求

- Windows 10/11
- Node.js ≥ 22
- pnpm ≥ 11
- Rust stable（Tauri 2 开发要求，仅构建 `src-tauri` 时需要）

## 🚀 快速开始

```powershell
# 安装依赖
pnpm install

# 纯前端开发（浏览器）
pnpm dev

# Tauri 桌面开发（Windows 应用窗口）
pnpm tauri dev
```

## 🧪 测试

```powershell
pnpm test            # 运行全部测试（Vitest）
pnpm test:watch      # 监听模式
```

## 🏗 构建

```powershell
pnpm tauri build     # 产出安装包（MSI / NSIS）
```

## 📁 项目结构

```text
LTools/
├── src/                      # 前端（React + TypeScript）
│   ├── components/
│   │   ├── layout/           # AppShell / TopNavigation / ModuleLayout
│   │   ├── shadcn/ui/        # shadcn 生成的基础组件
│   │   └── ui/               # 业务包装组件（Button / Dialog / ConfirmDialog / SearchBox）
│   ├── features/
│   │   ├── groups/           # 分组管理（弹窗、菜单、侧栏树）
│   │   └── links/            # 链接模块（表单弹窗、类型定义）
│   ├── pages/                # LinksPage / NotesPage / 占位页
│   ├── styles/               # tokens.css / global.css / App.css
│   ├── lib/                  # 工具函数
│   └── test/                 # 测试 setup（Tauri mock 等）
├── src-tauri/                # Rust 后端（Tauri 2）
│   ├── src/                  # main.rs / lib.rs（插件注册与窗口初始化）
│   ├── capabilities/         # 前端权限配置
│   ├── icons/                # 应用图标
│   └── tauri.conf.json       # 应用配置（窗口、CSP、打包）
├── docs/                     # 项目文档（进度 / UI 设计）
├── public/                   # 静态资源
├── package.json
└── vite.config.ts            # Vite + Vitest 配置
```

## 📄 文档

- [开发进度与项目信息](docs/LTools-project-overview-and-progress.md) —— 模块状态、已完成事项、后续计划
- `docs/ui/` —— UI 视觉与交互设计规范（V9 原型基准）

## 📌 说明

- 数据自动保存在 SQLite 数据库（默认 `app_data_dir/ltools.db`，可在设置中更换存储目录并自动迁移）；业务数据存于 `links` / `notes` / `link_groups` / `note_groups` / `clipboard_items` 表，系统级设置存于 `app_settings` 表。浏览器 dev / 测试模式降级为 localStorage（`ltools.*` 键），旧版 settings.json 首次启动自动迁移。备份 zip 内为 `manifest.json`。
- 本项目文档与 UI 规范以中文维护。
