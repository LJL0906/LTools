import { useEffect, type ReactNode } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Image from "@tiptap/extension-image";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import {
  Code,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Quote,
} from "lucide-react";

/**
 * 模块级常量：避免 useEditor 的 deps 比较触发编辑器销毁重建。
 * StarterKit 内置 Link / Underline；Underline 无工具栏入口故关闭，
 * Link 保留（工具栏"插入链接"依赖 setLink/unsetLink 命令）。
 */
const editorExtensions = [
  StarterKit.configure({ underline: false }),
  TaskList,
  TaskItem,
  Image,
  TextStyle,
  Color,
];

interface ToolbarAction {
  label: string;
  className?: string;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
  render: (editor: Editor) => ReactNode;
}

const toolbarActions: ToolbarAction[] = [
  {
    label: "粗体",
    className: "is-bold",
    isActive: (editor) => editor.isActive("bold"),
    run: (editor) => editor.chain().focus().toggleBold().run(),
    render: () => "B",
  },
  {
    label: "斜体",
    className: "is-italic",
    isActive: (editor) => editor.isActive("italic"),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
    render: () => "I",
  },
  {
    label: "删除线",
    className: "is-strike",
    isActive: (editor) => editor.isActive("strike"),
    run: (editor) => editor.chain().focus().toggleStrike().run(),
    render: () => "S",
  },
  {
    label: "项目符号列表",
    isActive: (editor) => editor.isActive("bulletList"),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
    render: () => <List size={15} aria-hidden="true" />,
  },
  {
    label: "编号列表",
    isActive: (editor) => editor.isActive("orderedList"),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
    render: () => <ListOrdered size={15} aria-hidden="true" />,
  },
  {
    label: "待办清单",
    isActive: (editor) => editor.isActive("taskList"),
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
    render: () => <ListTodo size={15} aria-hidden="true" />,
  },
  {
    label: "插入链接",
    isActive: (editor) => editor.isActive("link"),
    run: (editor) => {
      const previousUrl = editor.getAttributes("link").href as string | undefined;
      const url = window.prompt("输入链接地址", previousUrl ?? "https://");
      if (url === null) return;
      if (url === "") {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    },
    render: () => <Link size={15} aria-hidden="true" />,
  },
  {
    label: "代码块",
    isActive: (editor) => editor.isActive("codeBlock"),
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    render: () => <Code size={15} aria-hidden="true" />,
  },
  {
    label: "引用",
    isActive: (editor) => editor.isActive("blockquote"),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
    render: () => <Quote size={15} aria-hidden="true" />,
  },
];

interface NoteEditorProps {
  content: string;
  onChange: (html: string) => void;
}

export function NoteEditor({ content, onChange }: NoteEditorProps) {
  const editor = useEditor({
    extensions: editorExtensions,
    content,
    // Tiptap 3 默认不随 transaction 重渲染（undefined 走不渲染分支），
    // 工具栏按钮的 isActive 状态需要随每次事务更新
    shouldRerenderOnTransaction: true,
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getHTML()),
    editorProps: {
      // Ctrl/Cmd + ] / [：VSCode 式批量缩进 / 反缩进。
      // - 列表内（含任务列表）：sink / lift 层级缩进；
      // - 普通文本块：对选区覆盖的每个块，行首插入 / 删除两个空格（批量）。
      handleKeyDown: (view, event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          (event.key === "]" || event.key === "[")
        ) {
          event.preventDefault();
          const indent = event.key === "]";
          const { state } = view;
          const { selection } = state;
          // 列表内 → 层级缩进（sink）/ 反缩进（lift）
          let itemType: string | null = null;
          for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
            const nodeName = selection.$from.node(depth).type.name;
            if (nodeName === "listItem" || nodeName === "taskItem") {
              itemType = nodeName;
              break;
            }
          }
          if (itemType) {
            if (indent) {
              editor?.commands.sinkListItem(itemType);
            } else {
              editor?.commands.liftListItem(itemType);
            }
            return true;
          }
          // 普通文本块：收集选区覆盖的文本块，行首批量加 / 减两个空格
          const { from, to } = selection;
          const blocks: { start: number; text: string }[] = [];
          if (from === to) {
            const $pos = state.doc.resolve(from);
            for (let depth = $pos.depth; depth > 0; depth -= 1) {
              if ($pos.node(depth).isTextblock) {
                blocks.push({
                  start: $pos.before(depth),
                  text: $pos.node(depth).textContent,
                });
                break;
              }
            }
          } else {
            state.doc.nodesBetween(from, to, (node, pos) => {
              if (!node.isTextblock) return true;
              blocks.push({ start: pos, text: node.textContent });
              return false;
            });
          }
          if (blocks.length === 0) return true;
          const tr = state.tr;
          // 从后往前修改，避免位置偏移相互影响
          for (const block of blocks.reverse()) {
            const contentStart = block.start + 1;
            if (indent) {
              tr.insertText("  ", contentStart);
            } else {
              const leading = /^ +/.exec(block.text)?.[0].length ?? 0;
              if (leading > 0) {
                tr.delete(contentStart, contentStart + Math.min(2, leading));
              }
            }
          }
          view.dispatch(tr);
          return true;
        }
        // Tab 键：普通文本插入两个空格而不是把焦点跳到下一个控件；
        // 列表项内（含任务列表）交给 StarterKit 的缩进/反缩进（Tab / Shift+Tab）。
        if (event.key !== "Tab") return false;
        // 从选区位置向上找，判断是否处于列表（listItem 的内容节点是 paragraph）
        const $from = view.state.selection.$from;
        let inList = false;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          const nodeName = $from.node(depth).type.name;
          if (
            nodeName === "bulletList" ||
            nodeName === "orderedList" ||
            nodeName === "taskList"
          ) {
            inList = true;
            break;
          }
        }
        if (inList) return false;
        // 普通文本：阻止浏览器焦点跳转，插入两个空格（Shift+Tab 仅阻止，不修改内容）
        event.preventDefault();
        if (!event.shiftKey) {
          view.dispatch(view.state.tr.insertText("  "));
        }
        return true;
      },
    },
  });

  /** 外部值变化时同步编辑器；emitUpdate: false 避免回写触发 onUpdate 死循环 */
  useEffect(() => {
    if (!editor) return;
    if (content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [content, editor]);

  return (
    <>
      <div
        aria-label="富文本工具栏"
        className="editor-toolbar"
        role="toolbar"
      >
        {toolbarActions.map((action, index) => {
          const isActive = editor ? action.isActive(editor) : false;
          return (
            <span className="editor-toolbar__item-wrap" key={action.label}>
              {index === 3 || index === 6 ? (
                <span aria-hidden="true" className="editor-toolbar__separator" />
              ) : null}
              <button
                aria-label={action.label}
                aria-pressed={isActive}
                className={action.className}
                disabled={!editor}
                onClick={(event) => {
                  event.preventDefault();
                  action.run(editor!);
                }}
                onMouseDown={(event) => {
                  // 阻止 mousedown 抢焦点，保持编辑器选区
                  event.preventDefault();
                }}
                type="button"
              >
                {action.render(editor!)}
              </button>
            </span>
          );
        })}
      </div>
      <EditorContent
        aria-label="笔记内容"
        className="note-editor__content"
        editor={editor}
        role="textbox"
      />
    </>
  );
}
