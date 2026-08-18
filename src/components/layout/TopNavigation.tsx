import { NavLink } from "react-router-dom";
import { SearchBox } from "../ui/SearchBox";

const modules = [
  { label: "笔记", to: "/notes" },
  { label: "工具", to: "/tools" },
  { label: "链接", to: "/links" },
  { label: "剪切板", to: "/clipboard" },
  { label: "设置", to: "/settings" },
];

interface TopNavigationProps {
  compactSearch?: boolean;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  searchValue: string;
}

export function TopNavigation({
  compactSearch = false,
  onSearchChange,
  searchPlaceholder,
  searchValue,
}: TopNavigationProps) {
  return (
    <header className="top-navigation">
      <div className="brand">LTools</div>
      <nav className="module-navigation" aria-label="主导航">
        {modules.map((module) => (
          <NavLink
            className={({ isActive }) =>
              `module-navigation__link${isActive ? " is-active" : ""}`
            }
            key={module.to}
            to={module.to}
          >
            {module.label}
          </NavLink>
        ))}
      </nav>
      {searchPlaceholder ? (
        <SearchBox
          aria-label={searchPlaceholder}
          className={compactSearch ? "search-box--compact" : ""}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={searchPlaceholder}
          value={searchValue}
        />
      ) : null}
    </header>
  );
}
