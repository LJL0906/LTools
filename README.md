# LTools

本地优先的 Windows 桌面效率工具 —— 链接管理与笔记。

基于 **Tauri 2 + React 19 + TypeScript** 构建的轻量桌面应用，采用紧凑、统一的 UI 设计，目标是把常用效率功能集中在一个快速、安静的桌面窗口里。

> ⚠️ **当前状态：早期开发中（v0.1.0）**。链接和笔记模块已完成静态交互；数据目前保存在前端内存中（刷新即重置），本地持久化、剪切板、设置等模块仍在规划中。

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
- 工具栏按钮（当前为选中状态演示，真实富文本格式化规划中）

**公共 UI**

- 可拖拽调整宽度的侧栏（Pointer Events 拖拽 + 键盘微调，含可访问性语义）
- 统一的 Dialog / ConfirmDialog / 搜索框 / 按钮 / 图标按钮组件
- 统一的颜色、圆角、间距设计 Token
- 24 个前端交互测试全部通过

### 🚧 规划中

- 剪切板模块、设置模块
- Tiptap 富文本编辑器（依赖已就绪）
- SQLite 本地持久化（链接、笔记、分组、设置）
- 系统托盘、全局快捷键、快捷搜索独立窗口
- 数据导入 / 导出 / 备份恢复
- 开机自启动

## 🛠 技术栈

| 领域 | 技术 |
|---|---|
| 桌面框架 | Tauri 2（Rust 后端） |
| 前端 | React 19、TypeScript 5.8、Vite 7 |
| 路由 | React Router 7 |
| UI | Tailwind CSS 4、shadcn/ui、Radix UI、Lucide 图标 |
| 状态管理 | Zustand（依赖已装，暂未使用） |
| 富文本 | Tiptap 3（依赖已装，暂未接入） |
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

- 数据当前为前端内存态（示例数据 + 运行时增删改），刷新或重启后恢复示例数据；SQLite 持久化在规划中。
- 本项目文档与 UI 规范以中文维护。
