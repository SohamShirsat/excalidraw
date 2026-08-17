import { describe, expect, it, vi } from "vitest";

import { createConfirmHandler } from "../../electron/dialogHandlers";
import { MENU_SYNTHETIC_KEYDOWN_PAYLOADS } from "../../electron/menuShortcuts";

/**
 * Exercises the two pieces of `electron/menu.ts` + `electron/main.ts`'s
 * app-shell IPC surface (native menu dispatch, native confirm dialog) that
 * can be tested without a real Electron runtime — same approach as
 * `ElectronIpcHandlers.test.ts` for the Personal Workspace handlers: plain
 * functions exercised directly, with a mock standing in for the one real
 * Electron API involved (`dialog.showMessageBox`).
 */

describe("electron/dialogHandlers", () => {
  it("resolves true when the confirm/destructive button (index 1) is chosen", async () => {
    const showMessageBox = vi.fn().mockResolvedValue({ response: 1 });
    const confirm = createConfirmHandler(showMessageBox);

    await expect(
      confirm({ title: "Delete “Foo”?", message: "Delete “Foo”?" }),
    ).resolves.toBe(true);
  });

  it("resolves false when cancel (index 0) is chosen or the dialog is dismissed", async () => {
    const showMessageBox = vi.fn().mockResolvedValue({ response: 0 });
    const confirm = createConfirmHandler(showMessageBox);

    await expect(
      confirm({ title: "Delete “Foo”?", message: "Delete “Foo”?" }),
    ).resolves.toBe(false);
  });

  it("defaults button labels to Cancel/Delete, and passes through message/detail", async () => {
    const showMessageBox = vi.fn().mockResolvedValue({ response: 1 });
    const confirm = createConfirmHandler(showMessageBox);

    await confirm({
      title: "Delete “Booking flow”?",
      message: "Delete “Booking flow”?",
      detail: "This removes the page and its drawing.",
    });

    expect(showMessageBox).toHaveBeenCalledWith({
      type: "warning",
      buttons: ["Cancel", "Delete"],
      defaultId: 1,
      cancelId: 0,
      message: "Delete “Booking flow”?",
      detail: "This removes the page and its drawing.",
    });
  });

  it("honors custom confirmLabel/cancelLabel overrides", async () => {
    const showMessageBox = vi.fn().mockResolvedValue({ response: 1 });
    const confirm = createConfirmHandler(showMessageBox);

    await confirm({
      title: "Discard changes?",
      message: "Discard changes?",
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
    });

    expect(showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        buttons: ["Keep editing", "Discard"],
      }),
    );
  });
});

describe("electron/menuShortcuts", () => {
  it("keys CmdOrCtrl shortcuts off metaKey with no stray modifiers", () => {
    expect(MENU_SYNTHETIC_KEYDOWN_PAYLOADS.openScene).toEqual({
      key: "o",
      code: "KeyO",
      metaKey: true,
    });
    expect(MENU_SYNTHETIC_KEYDOWN_PAYLOADS.saveToActiveFile).toEqual({
      key: "s",
      code: "KeyS",
      metaKey: true,
    });
  });

  it("sets shiftKey for the CmdOrCtrl+Shift+E save-as-image shortcut", () => {
    expect(MENU_SYNTHETIC_KEYDOWN_PAYLOADS.saveAsImage).toEqual({
      key: "e",
      code: "KeyE",
      metaKey: true,
      shiftKey: true,
    });
  });

  it("keys the toggle-theme shortcut off `code`, matching actionToggleTheme's keyTest", () => {
    // `actionToggleTheme`'s keyTest checks `event.code === CODES.D`, not
    // `event.key` — regression guard against silently sending the wrong
    // field for this one shortcut.
    expect(MENU_SYNTHETIC_KEYDOWN_PAYLOADS.toggleTheme).toEqual({
      key: "d",
      code: "KeyD",
      shiftKey: true,
      altKey: true,
    });
  });

  it("uses the slash key for the command palette shortcut", () => {
    expect(MENU_SYNTHETIC_KEYDOWN_PAYLOADS.commandPalette).toEqual({
      key: "/",
      code: "Slash",
      metaKey: true,
    });
  });
});
