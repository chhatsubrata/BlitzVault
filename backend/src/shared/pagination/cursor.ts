/**
 * Opaque keyset-pagination cursor shared across features. Encodes the
 * `(created_at, id)` tuple of the last row on a page as base64url JSON so
 * clients treat it as an opaque token. A malformed cursor decodes to
 * `undefined` (first page) rather than throwing.
 */
export type KeysetCursor = { createdAt: string; id: string };

export const encodeCursor = (cursor: KeysetCursor): string =>
    Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");

/**
 * SQL for the time half of a keyset predicate/ordering. The `created_at`
 * columns are `timestamp without time zone` but the cursor's `createdAt` is a
 * UTC ISO string (from a JS Date). We interpret the column in the session tz to
 * get a real instant (`timestamptz`) and truncate to milliseconds so it lines
 * up with the ms-precision cursor — comparisons stay correct in any tz and at
 * micro/ms precision. Pair with `:cursorAt::timestamptz` on the value side.
 */
export const keysetTimeExpr = (column: string): string =>
    `date_trunc('milliseconds', ${column} AT TIME ZONE current_setting('TimeZone'))`;

export const decodeCursor = (raw?: string): KeysetCursor | undefined => {
    if (!raw) return undefined;
    try {
        const parsed = JSON.parse(
            Buffer.from(raw, "base64url").toString("utf8")
        ) as Partial<KeysetCursor>;
        if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
            return { createdAt: parsed.createdAt, id: parsed.id };
        }
    } catch {
        // Malformed cursor -> treat as no cursor (first page).
    }
    return undefined;
};
