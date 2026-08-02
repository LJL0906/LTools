import { useMemo, useState } from "react";
import { IconButton } from "../../components/ui/IconButton";
import type { GroupItem, GroupScope } from "./types";

interface GroupSelectorProps {
  groups: GroupItem[];
  label: string;
  onCreateGroup: () => void;
  onSelect: (groupId: string | null) => void;
  scope: GroupScope;
  selectedGroupId: string | null;
}

export function GroupSelector({
  groups,
  label,
  onCreateGroup,
  onSelect,
  scope,
  selectedGroupId,
}: GroupSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selectedName =
    groups.find((group) => group.id === selectedGroupId)?.name ?? label;
  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return groups;
    return groups.filter((group) =>
      group.name.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [groups, query]);

  return (
    <div className="group-selector" data-group-scope={scope}>
      <button
        aria-expanded={isOpen}
        aria-label={`选择分组，当前为${selectedName}`}
        className="group-selector__trigger"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        <span>{selectedName}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {isOpen ? (
        <div className="group-selector__popover">
          <div className="group-selector__search-row">
            <input
              aria-label="搜索分组"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索分组"
              type="search"
              value={query}
            />
            <IconButton aria-label="新建分组" onClick={onCreateGroup}>
              ＋
            </IconButton>
          </div>
          <div className="group-selector__options">
            {!query ? (
              <button
                className={!selectedGroupId ? "is-active" : ""}
                onClick={() => {
                  onSelect(null);
                  setIsOpen(false);
                }}
                type="button"
              >
                {label}
              </button>
            ) : null}
            {filteredGroups.map((group) => (
              <button
                className={selectedGroupId === group.id ? "is-active" : ""}
                key={group.id}
                onClick={() => {
                  onSelect(group.id);
                  setIsOpen(false);
                }}
                type="button"
              >
                {group.name}
              </button>
            ))}
            {!query ? (
              <button
                onClick={() => {
                  onSelect("ungrouped");
                  setIsOpen(false);
                }}
                type="button"
              >
                未分组
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
