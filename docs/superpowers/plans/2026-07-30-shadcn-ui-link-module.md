# shadcn/ui 链接管理模块实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 LTools 中接入 shadcn/ui，并将链接管理模块改造成紧凑、精致、可复用的桌面界面。

**Architecture:** 使用 Tailwind CSS 4 和 shadcn/ui Radix 组件作为基础控件层，保留现有 React 页面状态和链接业务规则。公共组件以兼容现有 props 的方式迁移，链接页面使用 Card、Badge、Dropdown Menu、Dialog、Alert Dialog、Tooltip、Empty 和 Toast 组合，避免影响笔记模块。

**Tech Stack:** React 19、TypeScript、Vite 7、Tailwind CSS 4、shadcn/ui、Radix UI、Lucide React、Vitest、Testing Library。

---

### Task 1: 初始化 shadcn/ui 基础设施

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `pnpm-workspace.yaml`
- Modify: `tsconfig.json`
- Modify: `tsconfig.node.json`
- Modify: `vite.config.ts`
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Modify: `src/styles/global.css`

- [ ] 安装 Tailwind CSS 4、Vite 插件和 shadcn/ui 所需依赖。
- [ ] 配置 `@/*` 指向 `src/*` 的 TypeScript 与 Vite 别名。
- [ ] 使用 `pnpm exec shadcn init --template vite --base radix --yes` 初始化项目。
- [ ] 使用 `pnpm exec shadcn add` 按需添加 Button、Card、Dialog、Alert Dialog、Input、Textarea、Select、Dropdown Menu、Tooltip、Badge、Empty、Sonner 和 Separator。
- [ ] 运行 `pnpm build`，预期 TypeScript 与 Vite 构建成功。

### Task 2: 先用测试定义链接页新增视觉语义

**Files:**
- Modify: `src/pages/LinksPage.interactions.test.tsx`

- [ ] 增加无搜索结果时显示空状态的测试。
- [ ] 增加链接卡片分组 Badge 和菜单操作的可访问性测试。
- [ ] 增加复制成功 Toast/可见反馈测试，保留剪贴板写入断言。
- [ ] 运行 `pnpm test -- src/pages/LinksPage.interactions.test.tsx`，预期新增断言因界面尚未实现而失败。

### Task 3: 改造公共 UI 适配层

**Files:**
- Modify: `src/components/ui/Button.tsx`
- Modify: `src/components/ui/IconButton.tsx`
- Modify: `src/components/ui/Dialog.tsx`
- Modify: `src/components/ui/ConfirmDialog.tsx`
- Modify: `src/components/ui/SearchBox.tsx`

- [ ] 使用 shadcn Button 重写现有 Button，维持 `variant="primary"`、原生按钮属性和现有测试查询方式。
- [ ] 使用 shadcn Button 的 icon 尺寸实现 IconButton，维持 `aria-label`。
- [ ] 使用 shadcn Dialog 重写现有 Dialog，维持 title、footer、onClose API 和 Escape 行为。
- [ ] 使用 Alert Dialog 重写 ConfirmDialog，维持确认与取消文案及可访问名称。
- [ ] 使用 shadcn Input 重写 SearchBox，维持 searchbox 语义。
- [ ] 运行公共布局、分组和笔记测试，预期全部通过。

### Task 4: 改造链接表单与分组操作

**Files:**
- Modify: `src/features/links/LinkDialog.tsx`
- Modify: `src/features/links/LinkDialog.css`
- Modify: `src/features/groups/GroupMenu.tsx`
- Modify: `src/features/groups/GroupDialog.tsx`
- Modify: `src/features/groups/DeleteGroupDialog.tsx`

- [ ] 使用 Input、Textarea、Select 和 Field 风格结构改造链接表单，维持标题和地址必填行为。
- [ ] 使用 Dropdown Menu 改造分组菜单，并保留“重命名”“删除分组”的 menuitem 语义。
- [ ] 使用 Lucide 图标替换字符图标。
- [ ] 运行链接和分组测试，预期全部通过。

### Task 5: 改造链接页面视觉与反馈

**Files:**
- Modify: `src/pages/LinksPage.tsx`
- Modify: `src/App.css`
- Modify: `src/App.tsx` 或 `src/main.tsx`

- [ ] 使用 Card 完整结构展示链接标题、URL、分组 Badge 和操作区。
- [ ] 使用 Dropdown Menu 收纳编辑、删除操作，保留现有可访问名称以兼容测试。
- [ ] 添加无结果 Empty 状态，并区分搜索无结果与分组为空。
- [ ] 使用 Sonner 展示复制成功或复制失败反馈。
- [ ] 在应用根部挂载 Toaster。
- [ ] 调整侧栏、卡片网格、悬停、焦点和窄窗口布局。
- [ ] 运行链接交互测试，预期全部通过。

### Task 6: 回归与视觉验证

**Files:**
- Modify as required by verified defects only.

- [ ] 运行 `pnpm test`，预期 7 个测试文件及全部测试通过。
- [ ] 运行 `pnpm build`，预期构建成功且无 TypeScript 错误。
- [ ] 启动 `pnpm dev`，在 960 × 680 和 720 × 520 视口检查链接页面。
- [ ] 验证添加、编辑、删除、复制、搜索、分组筛选、分组管理、Escape 和键盘焦点。
- [ ] 验证笔记模块没有因公共组件迁移出现功能或明显视觉回归。

说明：当前工作目录没有 `.git`，因此本计划不能执行逐任务 Git 提交；其余验证步骤不受影响。
