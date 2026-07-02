"use client";

import { useCallback, useRef, useState, type RefObject } from "react";

import { isTypingTarget } from "@/lib/keyboard";

export type GridItemKind = "folder" | "file";
export type GridItem = { id: string; kind: GridItemKind };

type UseGridKeyboardParams = {
  // Combined folders-then-files, matching render order.
  items: GridItem[];
  gridRef: RefObject<HTMLDivElement | null>;
  // Enter/Space on the focused item: folder -> open, file -> download.
  onActivate: (item: GridItem) => void;
  // Delete/Backspace on the focused item.
  onTrash: (item: GridItem, index: number) => void;
};

export type GridItemProps = {
  tabIndex: 0 | -1;
  // Named `cardRef` (not `ref`) so it threads as a normal prop through
  // DriveItemCard to the underlying Card, sidestepping component-ref semantics.
  cardRef: (node: HTMLElement | null) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  onFocus: () => void;
  "data-active": "" | undefined;
};

export type UseGridKeyboardResult = {
  getItemProps: (index: number) => GridItemProps;
  activeIndex: number;
};

/**
 * Roving-tabindex keyboard navigation for the drive grid. Only the active card
 * is tab-reachable (tabIndex 0); arrow/j/k move focus by reading the LIVE column
 * count from the grid's resolved `grid-template-columns`, so row movement stays
 * correct across the responsive sm/md/lg breakpoints with no hardcoding.
 *
 * Key handling lives per-card (via getItemProps().onKeyDown), not on window, so
 * it can never fire while a Radix dialog/menu holds focus, and never collides
 * with the global `?` help handler.
 */
export function useGridKeyboard({
  items,
  gridRef,
  onActivate,
  onTrash,
}: UseGridKeyboardParams): UseGridKeyboardResult {
  const [activeIndexState, setActiveIndex] = useState(0);
  const nodes = useRef(new Map<number, HTMLElement>());

  // Clamp on read (not via an effect) so the active index stays in range as the
  // list shrinks after a delete — no cascading setState-in-effect render.
  const activeIndex =
    items.length === 0
      ? 0
      : Math.min(activeIndexState, items.length - 1);

  const focusIndex = useCallback(
    (next: number) => {
      if (items.length === 0) return;
      const clamped = Math.max(0, Math.min(next, items.length - 1));
      setActiveIndex(clamped);
      nodes.current.get(clamped)?.focus();
    },
    [items.length]
  );

  // Count resolved grid tracks (the browser expands the template to one px
  // value per rendered column). Falls back to 1 so linear nav still works.
  const getColumnCount = useCallback((): number => {
    const grid = gridRef.current;
    if (!grid) return 1;
    const template = getComputedStyle(grid).gridTemplateColumns;
    const cols = template.split(" ").filter(Boolean).length;
    return cols > 0 ? cols : 1;
  }, [gridRef]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>, index: number) => {
      // Defense-in-depth: never hijack typing, and let OS/browser combos pass.
      if (isTypingTarget(event.target)) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      switch (event.key) {
        case "ArrowRight":
          event.preventDefault();
          focusIndex(index + 1);
          break;
        case "ArrowLeft":
          event.preventDefault();
          focusIndex(index - 1);
          break;
        case "ArrowDown":
        case "j":
          event.preventDefault();
          focusIndex(index + getColumnCount());
          break;
        case "ArrowUp":
        case "k":
          event.preventDefault();
          focusIndex(index - getColumnCount());
          break;
        case "Home":
          event.preventDefault();
          focusIndex(0);
          break;
        case "End":
          event.preventDefault();
          focusIndex(items.length - 1);
          break;
        case "Enter":
        case " ":
          // Space would otherwise scroll the page.
          event.preventDefault();
          onActivate(items[index]);
          break;
        case "Delete":
        case "Backspace":
          // Backspace would otherwise navigate the browser back.
          event.preventDefault();
          onTrash(items[index], index);
          break;
        default:
          break;
      }
    },
    [focusIndex, getColumnCount, items, onActivate, onTrash]
  );

  const getItemProps = useCallback(
    (index: number): GridItemProps => ({
      tabIndex: index === activeIndex ? 0 : -1,
      cardRef: (node: HTMLElement | null) => {
        if (node) nodes.current.set(index, node);
        else nodes.current.delete(index);
      },
      onKeyDown: (event) => onKeyDown(event, index),
      // Sync roving state when a card is focused by mouse/Tab.
      onFocus: () => setActiveIndex(index),
      "data-active": index === activeIndex ? "" : undefined,
    }),
    [activeIndex, onKeyDown]
  );

  return { getItemProps, activeIndex };
}
