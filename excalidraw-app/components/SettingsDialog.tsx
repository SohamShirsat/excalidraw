import { Dialog } from "@excalidraw/excalidraw/components/Dialog";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Theme } from "@excalidraw/element/types";

import {
  findShortcutConflict,
  getEffectiveBindings,
  SHORTCUT_DEFINITIONS,
  shortcutBindingsEqual,
} from "../data/shortcutBindings";

import "./SettingsDialog.scss";

import type {
  ShortcutBinding,
  ShortcutDefinition,
} from "../data/shortcutBindings";

type SettingsSection = "general" | "shortcuts" | "about";

const sections: { id: SettingsSection; label: string }[] = [
  { id: "general", label: "General" },
  { id: "shortcuts", label: "Shortcuts" },
  { id: "about", label: "About" },
];

const ignoredCaptureKeys = new Set([
  "Alt",
  "CapsLock",
  "Control",
  "Meta",
  "Shift",
]);

export const bindingFromKeyboardEvent = (
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
  >,
): ShortcutBinding | null => {
  if (ignoredCaptureKeys.has(event.key)) {
    return null;
  }

  return {
    key: event.key,
    code: event.code,
    ...(event.metaKey ? { metaKey: true } : {}),
    ...(event.ctrlKey ? { ctrlKey: true } : {}),
    ...(event.shiftKey ? { shiftKey: true } : {}),
    ...(event.altKey ? { altKey: true } : {}),
  };
};

export const formatShortcutBinding = (binding: ShortcutBinding): string => {
  const modifiers = [
    binding.metaKey ? "⌘" : "",
    binding.ctrlKey ? "⌃" : "",
    binding.altKey ? "⌥" : "",
    binding.shiftKey ? "⇧" : "",
  ].filter(Boolean);
  const key =
    binding.key === " "
      ? "Space"
      : binding.key === "Escape"
      ? "Esc"
      : binding.key.length === 1
      ? binding.key.toLocaleUpperCase()
      : binding.key;
  return `${modifiers.join("")}${key}`;
};

const ShortcutRow = ({
  definition,
  effectiveBinding,
  isOverridden,
  isCapturing,
  onStartCapture,
  onCapture,
  onReset,
}: {
  definition: ShortcutDefinition;
  effectiveBinding: ShortcutBinding;
  isOverridden: boolean;
  isCapturing: boolean;
  onStartCapture: () => void;
  onCapture: (binding: ShortcutBinding) => void;
  onReset: () => void;
}) => {
  const captureButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isCapturing) {
      captureButtonRef.current?.focus();
    }
  }, [isCapturing]);

  return (
    <div className="settings-shortcut-row">
      <div className="settings-shortcut-copy">
        <span>{definition.label}</span>
        {isOverridden && <small>Custom</small>}
      </div>
      <button
        ref={captureButtonRef}
        className="settings-shortcut-binding"
        type="button"
        onClick={onStartCapture}
        onKeyDown={(event) => {
          if (!isCapturing) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const binding = bindingFromKeyboardEvent(event.nativeEvent);
          if (binding) {
            onCapture(binding);
          }
        }}
        aria-label={`Change shortcut for ${definition.label}`}
      >
        {isCapturing
          ? "Press shortcut…"
          : formatShortcutBinding(effectiveBinding)}
      </button>
      <button
        className="settings-shortcut-reset"
        type="button"
        disabled={!isOverridden}
        onClick={onReset}
      >
        Reset
      </button>
    </div>
  );
};

export const SettingsDialog = ({
  onClose,
  workspaceDirectory,
  appTheme,
  onThemeChange,
  appVersion,
  overrides,
  onSaveOverrides,
}: {
  onClose: () => void;
  workspaceDirectory: string | null;
  appTheme: Theme | "system";
  onThemeChange: (theme: Theme | "system") => void;
  appVersion: string;
  overrides: Record<string, ShortcutBinding | null>;
  onSaveOverrides: (
    next: Record<string, ShortcutBinding | null>,
  ) => Promise<void>;
}) => {
  const [section, setSection] = useState<SettingsSection>("general");
  const [capturingId, setCapturingId] = useState<string | null>(null);
  const [shortcutError, setShortcutError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const effectiveBindings = useMemo(
    () => getEffectiveBindings(overrides),
    [overrides],
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Set(SHORTCUT_DEFINITIONS.map((item) => item.category)),
      ).map((category) => ({
        category,
        definitions: effectiveBindings.filter(
          (definition) => definition.category === category,
        ),
      })),
    [effectiveBindings],
  );

  const save = async (next: Record<string, ShortcutBinding | null>) => {
    setIsSaving(true);
    setShortcutError("");
    try {
      await onSaveOverrides(next);
    } catch (error) {
      console.error("[settings] unable to save shortcut overrides", error);
      setShortcutError(
        "Could not save your shortcut changes. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const captureBinding = (
    definition: ShortcutDefinition,
    binding: ShortcutBinding,
  ) => {
    const conflict = findShortcutConflict(
      effectiveBindings,
      binding,
      definition.id,
    );
    if (conflict) {
      setShortcutError(
        `${formatShortcutBinding(binding)} is already used by ${
          conflict.label
        }.`,
      );
      return;
    }

    setCapturingId(null);
    const next = { ...overrides };
    const canonicalDefinition = SHORTCUT_DEFINITIONS.find(
      (item) => item.id === definition.id,
    );
    next[definition.id] =
      canonicalDefinition &&
      shortcutBindingsEqual(binding, canonicalDefinition.defaultBinding)
        ? null
        : binding;
    void save(next);
  };

  return (
    <Dialog
      className="settings-dialog"
      size="wide"
      title="Settings"
      onCloseRequest={onClose}
    >
      <div className="settings-dialog-layout">
        <nav className="settings-dialog-nav" aria-label="Settings sections">
          {sections.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === section ? "is-active" : undefined}
              onClick={() => {
                setSection(item.id);
                setCapturingId(null);
                setShortcutError("");
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <section className="settings-dialog-panel">
          {section === "general" && (
            <>
              <h3>General</h3>
              <div className="settings-field">
                <span>Workspace folder</span>
                <code>
                  {workspaceDirectory || "Loading workspace location…"}
                </code>
                <small>
                  Your drawings stay in this folder and are never bundled into
                  the app.
                </small>
              </div>
              <div className="settings-field">
                <span>Appearance</span>
                <div
                  className="settings-theme-options"
                  role="group"
                  aria-label="Appearance"
                >
                  {(["light", "dark", "system"] as const).map((theme) => (
                    <button
                      type="button"
                      key={theme}
                      className={appTheme === theme ? "is-active" : undefined}
                      onClick={() => onThemeChange(theme)}
                    >
                      {theme[0].toLocaleUpperCase() + theme.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {section === "shortcuts" && (
            <>
              <div className="settings-panel-heading">
                <div>
                  <h3>Keyboard shortcuts</h3>
                  <p>Click a shortcut, then press the new key combination.</p>
                </div>
                <button
                  type="button"
                  className="settings-reset-all"
                  disabled={isSaving || Object.keys(overrides).length === 0}
                  onClick={() => void save({})}
                >
                  Reset all
                </button>
              </div>
              {shortcutError && (
                <p className="settings-shortcut-error" role="alert">
                  {shortcutError}
                </p>
              )}
              <div className="settings-shortcut-groups">
                {categories.map(({ category, definitions }) => (
                  <section
                    key={category}
                    aria-labelledby={`settings-category-${category}`}
                  >
                    <h4 id={`settings-category-${category}`}>{category}</h4>
                    {definitions.map((definition) => (
                      <ShortcutRow
                        key={definition.id}
                        definition={definition}
                        effectiveBinding={definition.defaultBinding}
                        isOverridden={overrides[definition.id] != null}
                        isCapturing={capturingId === definition.id}
                        onStartCapture={() => {
                          setCapturingId(definition.id);
                          setShortcutError("");
                        }}
                        onCapture={(binding) =>
                          captureBinding(definition, binding)
                        }
                        onReset={() =>
                          void save({ ...overrides, [definition.id]: null })
                        }
                      />
                    ))}
                  </section>
                ))}
              </div>
            </>
          )}

          {section === "about" && (
            <>
              <h3>About Personal Excalidraw</h3>
              <p className="settings-about-copy">
                A private, local-first drawing workspace for your Mac.
              </p>
              <dl className="settings-about-details">
                <div>
                  <dt>Version</dt>
                  <dd>{appVersion}</dd>
                </div>
                <div>
                  <dt>Storage</dt>
                  <dd>Local workspace folder</dd>
                </div>
              </dl>
              <a
                href="https://github.com/excalidraw/excalidraw"
                target="_blank"
                rel="noreferrer"
              >
                View the Excalidraw project
              </a>
            </>
          )}
        </section>
      </div>
    </Dialog>
  );
};
