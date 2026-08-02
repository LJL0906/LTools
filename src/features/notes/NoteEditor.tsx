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
  Image as ImageIcon,
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
  {
    label: "插入图片",
    isActive: () => false,
    run: (editor) => {
      const url = window.prompt("输入图片地址");
      if (url) editor.chain().focus().setImage({ src: url }).run();
    },
    render: () => <ImageIcon size={15} aria-hidden="true" />,
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
