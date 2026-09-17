"use client";

import { useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { MemberAvatar } from "@/features/sharing/components/member-avatar";
import {
  MEMBER_SEARCH_MIN_LENGTH,
  useMemberSearch,
} from "@/features/sharing/hooks/use-member-search";
import { cn } from "@/lib/cn";

/**
 * Email field with a people typeahead.
 *
 * Hand-rolled rather than a cmdk/popover dependency: components/ui is a
 * deliberately small vendored subset, and this is one listbox with four keys.
 *
 * The value is always the raw email string, never a picked user id: the grant
 * endpoint resolves by email, and someone whose account has not synced yet
 * still needs to be invitable. Selecting a suggestion is a shortcut for typing,
 * nothing more.
 */

type MemberPickerProps = {
  value: string;
  onChange: (value: string) => void;
  /** Submits the form — Enter with no active option should still invite. */
  onSubmit?: () => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  id?: string;
};

export function MemberPicker({
  value,
  onChange,
  onSubmit,
  disabled = false,
  invalid = false,
  describedBy,
  id,
}: MemberPickerProps) {
  const generatedId = useId();
  const inputId = id ?? `${generatedId}-input`;
  const listboxId = `${generatedId}-listbox`;

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { data, isSearching, isError, enabled } = useMemberSearch(value);
  const suggestions = data ?? [];
  const showList = open && enabled;

  const select = (email: string) => {
    onChange(email);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      if (open) {
        // Stop the dialog from closing too — the listbox is the inner layer.
        event.stopPropagation();
        setOpen(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (event.key === "Enter") {
      if (showList && activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault();
        select(suggestions[activeIndex].email);
        return;
      }
      // No active option: let the typed address through as-is.
      if (onSubmit) {
        event.preventDefault();
        setOpen(false);
        onSubmit();
      }
      return;
    }

    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (suggestions.length === 0) return;

    event.preventDefault();
    setOpen(true);
    setActiveIndex((current) => {
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next = current + delta;
      // Wrap: a two-item list is faster to cycle than to reverse through.
      if (next < 0) return suggestions.length - 1;
      if (next >= suggestions.length) return 0;
      return next;
    });
  };

  return (
    <div className="relative sm:flex-1">
      <Input
        id={inputId}
        type="email"
        inputMode="email"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          showList && activeIndex >= 0
            ? `${listboxId}-option-${activeIndex}`
            : undefined
        }
        aria-invalid={invalid}
        aria-describedby={describedBy}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- initial focus inside a modal dialog
        autoFocus
        placeholder="name@example.com"
        value={value}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Deferred so a click on an option lands before the list unmounts.
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
      />

      {showList ? (
        // The popover keeps the deferred blur-close from firing between
        // mousedown and click on an option; it is not interactive itself, and
        // every key interaction lives on the combobox input above.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          // Grows past the input when a long address needs it, capped so it
          // cannot escape the dialog; anything longer wraps instead of being
          // cut off — picking the right person depends on reading the address.
          className="bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 max-h-56 w-max min-w-full max-w-[min(26rem,calc(100vw-3rem))] overflow-auto rounded-md border p-1 shadow-md"
          onMouseDown={() => clearTimeout(blurTimer.current)}
        >
          <ul id={listboxId} role="listbox" aria-label="People">
            {suggestions.map((member, index) => (
              // Options are deliberately not focusable: this is an
              // aria-activedescendant combobox, so arrow/Enter are handled on
              // the input and the click handler is only the pointer path.
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events
              <li
                key={member.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-2 text-sm",
                  index === activeIndex && "bg-accent text-accent-foreground"
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => select(member.email)}
              >
                {/* lg so the circle spans both lines of the row rather than
                    floating beside the name. */}
                <MemberAvatar
                  size="lg"
                  label={member.username || member.email}
                  seed={member.email}
                  src={member.avatarUrl}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium break-words">{member.username}</span>
                  <span className="text-muted-foreground block text-xs break-all">
                    {member.email}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          {suggestions.length === 0 ? (
            <p className="text-muted-foreground px-2 py-1.5 text-sm" role="status">
              {isSearching
                ? "Searching…"
                : isError
                  ? "Could not search people — type the full email instead."
                  : "No people found. Type a full email to invite anyway."}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Announced once the field is long enough to search but before results
          land, so the listbox appearing is not a surprise. */}
      <span className="sr-only" role="status" aria-live="polite">
        {showList && suggestions.length > 0
          ? `${suggestions.length} people available`
          : ""}
      </span>
    </div>
  );
}

export { MEMBER_SEARCH_MIN_LENGTH };
