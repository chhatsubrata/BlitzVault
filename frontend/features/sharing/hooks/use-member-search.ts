import { useQuery } from "@tanstack/react-query";

import { searchMembers } from "@/features/sharing/api";
import { useDebouncedValue } from "@/features/sharing/hooks/use-debounced-value";
import { sharingKeys } from "@/features/sharing/keys";
import type { MemberSuggestion } from "@/features/sharing/types";

/** Matches the backend's minimum; a shorter term is a 400, not a search. */
export const MEMBER_SEARCH_MIN_LENGTH = 2;

const DEBOUNCE_MS = 250;
// A directory changes rarely; within one dialog session the answer is stable.
const STALE_TIME_MS = 30_000;

/**
 * Typeahead results for `term`, debounced and gated on length.
 *
 * Returns `isSearching` separately from `isFetching`: while the debounce is
 * still pending the query has not started, but the field is not idle either —
 * without it the listbox flashes "No people found" between keystrokes.
 */
export function useMemberSearch(term: string) {
    const trimmed = term.trim();
    const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
    const enabled = debounced.length >= MEMBER_SEARCH_MIN_LENGTH;

    const query = useQuery<MemberSuggestion[]>({
        queryKey: sharingKeys.memberSearch(debounced),
        queryFn: () => searchMembers(debounced),
        enabled,
        staleTime: STALE_TIME_MS,
        // Same reasoning as useShares: a typeahead that retries with backoff
        // shows stale state long after the user moved on.
        retry: false,
    });

    return {
        ...query,
        enabled,
        isSearching:
            query.isFetching ||
            (trimmed.length >= MEMBER_SEARCH_MIN_LENGTH && trimmed !== debounced),
    };
}
