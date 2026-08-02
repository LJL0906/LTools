/** 笔记模块类型定义。 */
export interface NoteItem {
  content: string;
  groupId: string | null;
  id: string;
  time: string;
  title: string;
}
