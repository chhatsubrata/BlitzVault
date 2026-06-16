"use client";

import { useEffect, useState } from "react";
import { Keyboard } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Returns true when the user is typing into a field, so the `?` shortcut never
// hijacks normal text entry.
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

// Stub shortcut registry — grows as real shortcuts land. Friday deliverable is
// the overlay + `?` wiring, not a full shortcut set.
const SHORTCUTS: Array<{ keys: string; label: string }> = [
  { keys: "?", label: "Show keyboard shortcuts" },
];

// Self-contained help overlay: renders its own trigger button (for the topbar)
// and a global `?` keydown listener. Mounted once inside the app shell.
export function KeyboardHelpDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "?") return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setOpen((prev) => !prev);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Keyboard shortcuts"
        className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Keyboard className="h-5 w-5" aria-hidden />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs">?</kbd> anytime to
            toggle this panel.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {SHORTCUTS.map((shortcut) => (
            <li
              key={shortcut.keys}
              className="flex items-center justify-between gap-4 text-sm text-foreground"
            >
              <span>{shortcut.label}</span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                {shortcut.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
