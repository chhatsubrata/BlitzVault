/**
 * Shared keyboard helpers: the typing-target guard and the single drive
 * shortcut registry. One source of truth so the help overlay
 * (keyboard-help-dialog) and the actual grid key handling (use-grid-keyboard)
 * can never drift.
 */

// Returns true when the user is typing into a field, so shortcuts never hijack
// normal text entry.
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export type Shortcut = { keys: string; label: string };

// The real drive shortcut set, in the order shown in the help overlay.
export const DRIVE_SHORTCUTS: readonly Shortcut[] = [
  { keys: "j / ↓", label: "Move down a row" },
  { keys: "k / ↑", label: "Move up a row" },
  { keys: "← / →", label: "Previous / next item" },
  { keys: "Home / End", label: "First / last item" },
  { keys: "Enter / Space", label: "Open folder or download file" },
  { keys: "Delete / Backspace", label: "Send to trash" },
  { keys: "?", label: "Show keyboard shortcuts" },
];
