import "./EditorTabBar.scss";

export type EditorTab = {
  pageId: string;
  label: string;
  secondaryLabel?: string;
};

const CloseIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="m4.5 4.5 7 7m0-7-7 7"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

const PlusIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path
      d="M8 3v10M3 8h10"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
    />
  </svg>
);

// A two-pane "split" glyph — the same idiom VS Code/Figma use for "open to
// the side".
const SplitIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <rect
      x="2.5"
      y="3"
      width="11"
      height="10"
      rx="1.25"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    />
    <path d="M8 3v10" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

export const EditorTabBar = ({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNewTab,
  newTabLabel = "New page",
  onSplitTab,
  splitLabel = "Open to the side",
  canCloseLast = false,
  trailing,
}: {
  tabs: EditorTab[];
  activeId: string | null;
  onSelect: (pageId: string) => void;
  onClose: (pageId: string) => void;
  onNewTab?: () => void;
  newTabLabel?: string;
  onSplitTab?: (pageId: string) => void;
  splitLabel?: string;
  canCloseLast?: boolean;
  trailing?: React.ReactNode;
}) => {
  return (
    <div className="editor-tab-bar" role="tablist" aria-label="Open pages">
      <div className="editor-tab-bar-scroll">
        {tabs.map((tab) => {
          const isActive = tab.pageId === activeId;
          return (
            <div
              key={tab.pageId}
              role="tab"
              aria-selected={isActive}
              className={`editor-tab${isActive ? " is-active" : ""}`}
              onClick={() => !isActive && onSelect(tab.pageId)}
              title={
                tab.secondaryLabel
                  ? `${tab.label} — ${tab.secondaryLabel}`
                  : tab.label
              }
            >
              <span className="editor-tab-label">{tab.label}</span>
              <span className="editor-tab-actions">
                {onSplitTab && (
                  <button
                    type="button"
                    className="editor-tab-action"
                    aria-label={`${splitLabel}: ${tab.label}`}
                    title={splitLabel}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSplitTab(tab.pageId);
                    }}
                  >
                    <SplitIcon />
                  </button>
                )}
                {(tabs.length > 1 || canCloseLast) && (
                  <button
                    type="button"
                    className="editor-tab-action editor-tab-close"
                    aria-label={`Close ${tab.label}`}
                    title="Close tab"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClose(tab.pageId);
                    }}
                  >
                    <CloseIcon />
                  </button>
                )}
              </span>
            </div>
          );
        })}
        {onNewTab && (
          <button
            type="button"
            className="editor-tab-new"
            aria-label={newTabLabel}
            title={`${newTabLabel} (${
              navigator.platform.toLowerCase().includes("mac") ? "⌘T" : "Ctrl+T"
            })`}
            onClick={onNewTab}
          >
            <PlusIcon />
          </button>
        )}
      </div>
      {trailing && <div className="editor-tab-bar-trailing">{trailing}</div>}
    </div>
  );
};
