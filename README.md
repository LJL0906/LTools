# LTools

本地优先的 Windows 桌面效率工具 —— 链接管理、笔记与剪切板。

基于 **Tauri 2 + React 19 + TypeScript** 构建的轻量桌面应用，采用紧凑、统一的 UI 设计，把常用效率功能集中在一个快速、安静的桌面窗口里。数据默认保存在本地 SQLite 数据库，**自动保存、无需手动操作**；系统级能力（托盘、全局快捷键、快捷搜索、自动更新）均已接入。

当前版本：**v0.1.1**

## ✨ 功能特性

### 链接管理

- 添加 / 编辑 / 删除链接（支持 `https` / `http` / `ws` / `wss` 协议）
- 搜索链接（标题、URL、备注）
- 分组筛选与分组管理（全部 / 未分组 / 指定分组；新建、重命名、删除）
- 一键复制地址，带"已复制 / 复制失败"反馈
- 在系统浏览器中打开链接

### 笔记

- 新建 / 编辑 / 删除笔记
- 搜索笔记（标题、正文）
- 分组手风琴侧栏（全部 / 分组 / 未分组），与编辑器联动
- Tiptap 富文本编辑器（粗体 / 斜体 / 删除线 / 列表 / 待办 / 链接 / 代码块 / 引用 / 图片）

### 剪切板

- 系统剪贴板文本自动监听（Rust 后台轮询，600ms），新复制内容自动入库
- 历史列表：内容预览、相对时间、一键复制回剪贴板
- 详情弹窗：完整内容展示 + 一键复制
- 保留最新 30 条，超出自动裁剪最旧
- 搜索、删除单条、清空全部

### 设置

- 开机自启动
- 启动 / 关闭窗口时最小化到托盘（系统托盘，左键单击或菜单显示主窗口）
- 全局快捷键：**切换**主窗口显示 / 隐藏（显示时隐藏到托盘、隐藏时唤出）
- 主窗口默认不占任务栏，仅主动最小化时出现在任务栏便于恢复
- 快捷搜索：独立小窗口，快捷键显隐、失焦自动隐藏；结果支持 ↑/↓ 选择 + 回车打开；点击笔记唤起主窗口选中；无本地结果时可用百度搜索兜底
- 自定义窗口宽高
- 数据库存储路径：自定义 SQLite 文件位置，切换时自动迁移数据
- 数据备份：导出为 zip / 导入恢复
- 检查更新：GitHub Releases 发布，有新版自动下载安装并重启

## 🛠 技术栈

| 领域 | 技术 |
|---|---|
| 桌面框架 | Tauri 2（Rust 后端） |
| 前端 | React 19、TypeScript 5.8、Vite 7 |
| 路由 | React Router 7 |
| UI | Tailwind CSS 4、shadcn/ui、Radix UI、Lucide 图标 |
| 本地存储 | SQLite（rusqlite），写入为逐条 CRUD 命令 |
| 富文本 | Tiptap 3 |
| 测试 | Vitest 4、Testing Library、jsdom |
| 包管理 | pnpm 11 |

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
pnpm tauri build     # 产出安装包（MSI / NSIS，含自动更新签名）
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
│   │   ├── groups/           # 分组管理
│   │   └── links/            # 链接模块
│   ├── pages/                # 各模块页面
│   ├── styles/               # tokens.css / global.css / App.css
│   ├── lib/                  # 数据层与工具函数
│   └── test/                 # 测试 setup（Tauri mock 等）
├── src-tauri/                # Rust 后端（Tauri 2）
│   ├── src/                  # main.rs / lib.rs（插件注册与窗口初始化）
│   ├── capabilities/         # 前端权限配置
│   ├── icons/                # 应用图标
│   └── tauri.conf.json       # 应用配置（窗口、CSP、打包、更新）
├── docs/                     # 项目文档
├── public/                   # 静态资源
├── package.json
└── vite.config.ts            # Vite + Vitest 配置
```

## 📄 文档

- [发布与自动更新](docs/RELEASE.md) —— 签名密钥、GitHub Secrets、发版流程
- [开发进度与项目信息](docs/LTools-project-overview-and-progress.md) —— 模块状态与后续计划
- `docs/ui/` —— UI 视觉与交互设计规范

## 📌 数据说明

- 数据自动保存在本地 SQLite 数据库（默认 `app_data_dir/ltools.db`，可在设置中更换存储目录，切换时自动迁移），业务数据存于 `links` / `notes` / `link_groups` / `note_groups` / `clipboard_items` 表，系统设置存于 `app_settings` 表
- 备份文件为 zip 格式（内含 `manifest.json`）
- 浏览器 dev / 测试模式降级为 localStorage（`ltools.*` 键），不影响桌面端使用
