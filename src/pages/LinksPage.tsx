import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useOutletContext } from "react-router-dom";
import {
  Copy,
  ExternalLink,
  Folder,
  FolderPlus,
  Inbox,
  MoreHorizontal,
  SearchX,
} from "lucide-react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { AppOutletContext } from "../components/layout/AppShell";
import { ModuleLayout } from "../components/layout/ModuleLayout";
import { Badge } from "@/components/shadcn/ui/badge";
import { Button as ShadcnButton } from "@/components/shadcn/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/shadcn/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/shadcn/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/shadcn/ui/tooltip";
import { Button as CompatButton } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { DeleteGroupDialog } from "../features/groups/DeleteGroupDialog";
import { GroupDialog } from "../features/groups/GroupDialog";
import { GroupMenu } from "../features/groups/GroupMenu";
import type { GroupItem } from "../features/groups/types";
import { LinkDialog } from "../features/links/LinkDialog";
import {
  getLinkUrl,
  type LinkDraft,
  type LinkItem,
} from "../features/links/types";
import { loadState, STORAGE_KEYS } from "../lib/storage";
import {
  deleteLink,
  deleteLinkGroup,
  loadLinksData,
  isTauriRuntime,
  upsertLink,
  upsertLinkGroup,
} from "../lib/data";

const initialLinks: LinkItem[] = [
  {
    id: "api-docs",
    title: "API 文档",
    protocol: "https",
    address: "example.com/api",
    notes: "接口说明",
    groupId: "work",
  },
  {
    id: "admin",
    title: "测试后台",
    protocol: "https",
    address: "admin.example.com",
    notes: "",
    groupId: "project-a",
  },
];

const initialGroups: GroupItem[] = [
  { id: "work", name: "工作" },
  { id: "project-a", name: "项目 A" },
];

interface LinksSidebarProps {
  activeMenuGroupId: string | null;
  groups: GroupItem[];
  onCreateGroup: () => void;
  onDeleteGroup: (group: GroupItem) => void;
  onOpenGroupMenu: (groupId: string) => void;
  onCloseGroupMenu: () => void;
  onRenameGroup: (group: GroupItem) => void;
  onSelectGroup: (groupId: string | null) => void;
  selectedGroupId: string | null;
}

function LinksSidebar({
  activeMenuGroupId,
  groups,
  onCloseGroupMenu,
  onCreateGroup,
  onDeleteGroup,
  onOpenGroupMenu,
  onRenameGroup,
  onSelectGroup,
  selectedGroupId,
}: LinksSidebarProps) {
  return (
    <div className="links-sidebar">
      <div className="links-sidebar__heading">
        <div className="links-sidebar__title">
          <Folder size={14} aria-hidden="true" />
          <span>分组</span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button aria-label="新建分组" className="icon-button" type="button" onClick={onCreateGroup}>
              <FolderPlus size={16} aria-hidden="true" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">新建分组</TooltipContent>
        </Tooltip>
      </div>
      <div className="links-sidebar__groups">
        <button
          className={`group-row${selectedGroupId === null ? " is-active" : ""}`}
          onClick={() => onSelectGroup(null)}
          type="button"
        >
          <Folder size={15} aria-hidden="true" />
          <span>全部</span>
        </button>
        <button
          className={`group-row${selectedGroupId === "ungrouped" ? " is-active" : ""}`}
          onClick={() => onSelectGroup("ungrouped")}
          type="button"
        >
          <Inbox size={15} aria-hidden="true" />
          <span>未分组</span>
        </button>
        {groups.map((group) => (
          <div className="group-row-shell" key={group.id}>
            <button
              aria-label={group.name}
              className={`group-row${selectedGroupId === group.id ? " is-active" : ""}`}
              onClick={() => onSelectGroup(group.id)}
              type="button"
            >
              <Folder size={15} aria-hidden="true" />
              <span>{group.name}</span>
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  aria-label={`管理分组 ${group.name}`}
                  className="group-row__menu-button icon-button"
                  type="button"
                  onClick={() => onOpenGroupMenu(group.id)}
                >
                  <MoreHorizontal size={16} aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">管理分组</TooltipContent>
            </Tooltip>
            {activeMenuGroupId === group.id ? (
              <GroupMenu
                group={group}
                onClose={onCloseGroupMenu}
                onDelete={() => onDeleteGroup(group)}
                onRename={() => onRenameGroup(group)}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function LinksRoutePage() {
  const { searchQuery } = useOutletContext<AppOutletContext>();
  return <LinksPage searchQuery={searchQuery} />;
}

interface LinksPageProps {
  searchQuery?: string;
}

export function LinksPage({ searchQuery = "" }: LinksPageProps) {
  // 首屏 loading 态：仅 Tauri 环境启用（SQLite 数据异步到达前不渲染示例数据，
  // 避免内容闪现跳变）；浏览器 dev/测试环境同步有数据，保持原有行为。
  const [loading, setLoading] = useState(() => isTauriRuntime());
  const [groups, setGroups] = useState(() =>
    loadState(STORAGE_KEYS.linkGroups, initialGroups),
  );
  const [links, setLinks] = useState(() => loadState(STORAGE_KEYS.links, initialLinks));
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [activeMenuGroupId, setActiveMenuGroupId] = useState<string | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupItem | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<GroupItem | null>(null);
  const [isAddingLink, setIsAddingLink] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [deletingLink, setDeletingLink] = useState<LinkItem | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [copyErrorLinkId, setCopyErrorLinkId] = useState<string | null>(null);
  const [activeMenuLinkId, setActiveMenuLinkId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);

  /** 首次加载：Tauri 用 SQLite 数据覆盖初始值（含一次性迁移）；浏览器初始值即最终值 */
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    void loadLinksData().then(({ links: dbLinks, linkGroups: dbGroups }) => {
      if (disposed) return;
      setLinks(dbLinks);
      setGroups(dbGroups);
      setLoading(false);
    });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!copiedLinkId) return;

    const timeoutId = window.setTimeout(() => setCopiedLinkId(null), 1500);
    return () => window.clearTimeout(timeoutId);
  }, [copiedLinkId]);

  useEffect(() => {
    if (!copyErrorLinkId) return;

    const timeoutId = window.setTimeout(() => setCopyErrorLinkId(null), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [copyErrorLinkId]);

  const filteredLinks = useMemo(() => {
    const groupedLinks =
      selectedGroupId === null
        ? links
        : selectedGroupId === "ungrouped"
          ? links.filter((link) => link.groupId === null)
          : links.filter((link) => link.groupId === selectedGroupId);
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return groupedLinks;
    return groupedLinks.filter((link) =>
      `${link.title} ${getLinkUrl(link)} ${link.notes}`
        .toLocaleLowerCase()
        .includes(query),
    );
  }, [links, searchQuery, selectedGroupId]);

  const selectedGroupName =
    selectedGroupId === null
      ? "全部链接"
      : selectedGroupId === "ungrouped"
        ? "未分组"
        : groups.find((group) => group.id === selectedGroupId)?.name ?? "全部链接";
  const hasSearchQuery = searchQuery.trim().length > 0;

  const saveNewLink = (draft: LinkDraft) => {
    const link: LinkItem = { ...draft, id: crypto.randomUUID() };
    setLinks((currentLinks) => [...currentLinks, link]);
    upsertLink(link);
    setIsAddingLink(false);
  };

  const saveEditedLink = (draft: LinkDraft) => {
    if (!editingLink) return;
    const link: LinkItem = { ...draft, id: editingLink.id };
    setLinks((currentLinks) =>
      currentLinks.map((item) =>
        item.id === editingLink.id ? link : item,
      ),
    );
    upsertLink(link);
    setEditingLink(null);
  };

  const copyLink = async (link: LinkItem) => {
    try {
      await navigator.clipboard.writeText(getLinkUrl(link));
      setCopyErrorLinkId(null);
      setCopiedLinkId(link.id);
    } catch {
      setCopiedLinkId(null);
      setCopyErrorLinkId(link.id);
    }
  };

  return (
    <TooltipProvider>
      <>
        <ModuleLayout
          sidebar={
            <LinksSidebar
              activeMenuGroupId={activeMenuGroupId}
              groups={groups}
              onCreateGroup={() => setIsCreatingGroup(true)}
              onDeleteGroup={(group) => {
                setActiveMenuGroupId(null);
                setDeletingGroup(group);
              }}
              onOpenGroupMenu={(groupId) =>
                setActiveMenuGroupId((currentId) =>
                  currentId === groupId ? null : groupId,
                )
              }
              onCloseGroupMenu={() => setActiveMenuGroupId(null)}
              onRenameGroup={(group) => {
                setActiveMenuGroupId(null);
                setEditingGroup(group);
              }}
              onSelectGroup={(groupId) => {
                setActiveMenuGroupId(null);
                setSelectedGroupId(groupId);
              }}
              selectedGroupId={selectedGroupId}
            />
          }
          maxSidebarWidth={320}
          minSidebarWidth={160}
          resizeHandleLabel="调整链接侧栏宽度"
          sidebarStateKey="links"
          sidebarWidth={216}
        >
          <section className="links-content">
            {loading ? (
              <div className="links-page__loading" role="status">
                <span className="links-page__spinner" aria-hidden="true" />
                <span>加载中…</span>
              </div>
            ) : (
              <>
                <CompatButton
                  className="button button--primary links-primary-button"
                  onClick={() => setIsAddingLink(true)}
                >
                  <FolderPlus size={15} aria-hidden="true" />
                  添加链接
                </CompatButton>
                {filteredLinks.length > 0 ? (
              <div className="link-grid">
                {filteredLinks.map((link) => {
                  const groupName =
                    groups.find((group) => group.id === link.groupId)?.name ??
                    "未分组";
                  const copyLabel =
                    copyErrorLinkId === link.id
                      ? "复制失败"
                      : copiedLinkId === link.id
                        ? "已复制"
                        : "复制";

                  return (
                    <Card className="link-card" key={link.id}>
                      <CardHeader className="link-card__header">
                        <div className="link-card__top-row">
                          <div className="link-card__title-block">
                            <CardTitle>
                              <h2>{link.title}</h2>
                            </CardTitle>
                            <CardDescription className="link-card__url">
                              {getLinkUrl(link)}
                            </CardDescription>
                          </div>
                          <div className="link-card__menu-shell">
                            <button
                              aria-label={`管理链接 ${link.title}`}
                              className="link-card__menu-trigger"
                              type="button"
                              onClick={(e) => {
                                if (activeMenuLinkId === link.id) {
                                  setActiveMenuLinkId(null);
                                  setMenuPosition(null);
                                } else {
                                  const rect =
                                    e.currentTarget.getBoundingClientRect();
                                  setMenuPosition({
                                    top: rect.bottom + 4,
                                    right: window.innerWidth - rect.right,
                                  });
                                  setActiveMenuLinkId(link.id);
                                }
                              }}
                            >
                              <MoreHorizontal size={15} aria-hidden="true" />
                            </button>
                            {activeMenuLinkId === link.id && menuPosition
                              ? createPortal(
                                  <>
                                    <div
                                      className="popover-backdrop"
                                      onClick={() => {
                                        setActiveMenuLinkId(null);
                                        setMenuPosition(null);
                                      }}
                                    />
                                    <div
                                      className="group-menu"
                                      style={{
                                        position: "fixed",
                                        top: menuPosition.top,
                                        right: menuPosition.right,
                                      }}
                                    >
                                      <div className="group-menu__title">
                                        {link.title}
                                      </div>
                                      <button
                                        className="group-menu__action"
                                        onClick={() => {
                                          setEditingLink(link);
                                          setActiveMenuLinkId(null);
                                          setMenuPosition(null);
                                        }}
                                        type="button"
                                      >
                                        编辑
                                      </button>
                                      <button
                                        className="group-menu__action group-menu__action--danger"
                                        onClick={() => {
                                          setDeletingLink(link);
                                          setActiveMenuLinkId(null);
                                          setMenuPosition(null);
                                        }}
                                        type="button"
                                      >
                                        删除
                                      </button>
                                    </div>
                                  </>,
                                  document.body,
                                )
                              : null}
                          </div>
                        </div>
                      </CardHeader>
                      <CardFooter className="link-card__footer">
                        <Badge className="link-card__group-badge" variant="secondary">
                          {groupName}
                        </Badge>
                        <div className="link-card__actions">
                          {copyErrorLinkId === link.id ? (
                            <span className="sr-only" role="alert">
                              复制失败
                            </span>
                          ) : null}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <ShadcnButton
                                aria-label={`复制 ${link.title}`}
                                className={copyErrorLinkId === link.id ? "is-error" : ""}
                                onClick={() => void copyLink(link)}
                                size="icon-sm"
                                variant="outline"
                              >
                                <Copy size={14} aria-hidden="true" />
                              </ShadcnButton>
                            </TooltipTrigger>
                            <TooltipContent>{copyLabel}</TooltipContent>
                          </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <ShadcnButton
                            aria-label={`打开 ${link.title}`}
                            size="icon-sm"
                            variant="default"
                            onClick={() => {
                              // 打开系统浏览器后主动隐藏主窗口（打开失败则留在原地可重试）
                              void openUrl(getLinkUrl(link))
                                .then(() => {
                                  try {
                                    // 打开成功后隐藏主窗口（需 core:window:allow-hide 权限）
                                    void getCurrentWebviewWindow()
                                      .hide()
                                      .catch(() => undefined);
                                  } catch {
                                    // 非 Tauri 环境（浏览器 dev / 测试）静默降级
                                  }
                                })
                                .catch(() => undefined); // 打开失败静默（留在窗口内可重试）
                            }}
                          >
                            <ExternalLink size={14} aria-hidden="true" />
                          </ShadcnButton>
                        </TooltipTrigger>
                        <TooltipContent>打开</TooltipContent>
                      </Tooltip>
                        </div>
                      </CardFooter>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Empty className="links-empty-state" role="status">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    {hasSearchQuery ? (
                      <SearchX size={20} aria-hidden="true" />
                    ) : (
                      <Inbox size={20} aria-hidden="true" />
                    )}
                  </EmptyMedia>
                  <EmptyTitle>
                    {hasSearchQuery ? "没有找到匹配的链接" : `${selectedGroupName}为空`}
                  </EmptyTitle>
                  <EmptyDescription>
                    {hasSearchQuery
                      ? "尝试调整搜索关键词，或清空搜索后浏览全部链接。"
                      : "添加一个链接，方便之后快速访问。"}
                  </EmptyDescription>
                </EmptyHeader>
                </Empty>
              )}
              </>
            )}
          </section>
        </ModuleLayout>
        {isAddingLink ? (
          <LinkDialog
            groups={groups}
            defaultGroupId={
              selectedGroupId && selectedGroupId !== "ungrouped"
                ? selectedGroupId
                : null
            }
            onCancel={() => setIsAddingLink(false)}
            onSave={saveNewLink}
          />
        ) : null}
        {editingLink ? (
          <LinkDialog
            groups={groups}
            link={editingLink}
            onCancel={() => setEditingLink(null)}
            onSave={saveEditedLink}
          />
        ) : null}
        {deletingLink ? (
          <ConfirmDialog
            message={`确定删除“${deletingLink.title}”？`}
            onCancel={() => setDeletingLink(null)}
            onConfirm={() => {
              deleteLink(deletingLink.id);
              setLinks((currentLinks) =>
                currentLinks.filter((link) => link.id !== deletingLink.id),
              );
              setDeletingLink(null);
            }}
            title="删除链接"
          />
        ) : null}
        {isCreatingGroup ? (
          <GroupDialog
            mode="create"
            onCancel={() => setIsCreatingGroup(false)}
            onSave={(name) => {
              const group: GroupItem = { id: crypto.randomUUID(), name };
              setGroups((currentGroups) => [...currentGroups, group]);
              upsertLinkGroup(group);
              setIsCreatingGroup(false);
            }}
            scope="links"
          />
        ) : null}
        {editingGroup ? (
          <GroupDialog
            initialName={editingGroup.name}
            mode="rename"
            onCancel={() => setEditingGroup(null)}
            onSave={(name) => {
              const group: GroupItem = { ...editingGroup, name };
              setGroups((currentGroups) =>
                currentGroups.map((item) =>
                  item.id === editingGroup.id ? group : item,
                ),
              );
              upsertLinkGroup(group);
              setEditingGroup(null);
            }}
            scope="links"
          />
        ) : null}
        {deletingGroup ? (
          <DeleteGroupDialog
            group={deletingGroup}
            onCancel={() => setDeletingGroup(null)}
            onConfirm={() => {
              deleteLinkGroup(deletingGroup.id);
              setGroups((currentGroups) =>
                currentGroups.filter((group) => group.id !== deletingGroup.id),
              );
              setLinks((currentLinks) =>
                currentLinks.map((link) =>
                  link.groupId === deletingGroup.id
                    ? { ...link, groupId: null }
                    : link,
                ),
              );
              if (selectedGroupId === deletingGroup.id) {
                setSelectedGroupId(null);
              }
              setDeletingGroup(null);
            }}
            scope="links"
          />
        ) : null}
      </>
    </TooltipProvider>
  );
}









