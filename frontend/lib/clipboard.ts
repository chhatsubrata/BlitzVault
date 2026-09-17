/**
 * Copy text to the clipboard, reporting whether it worked.
 *
 * `navigator.clipboard` is undefined outside a secure context (plain-HTTP
 * staging, some in-app browsers) and rejects when the page is not focused, so
 * the legacy textarea path is a real fallback here, not ceremony. Callers get a
 * boolean and decide what to tell the user — no toast is fired from inside.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (!text) return false;

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy path rather than failing outright.
    }
  }

  if (typeof document === "undefined") return false;

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Keep it off-screen and non-interactive: a visible textarea would steal
    // layout, and readOnly stops mobile keyboards popping up.
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";

    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
};
