"use client";

import { Button } from "@/components/ui/button";
import { MemberAvatar } from "@/features/sharing/components/member-avatar";
import { PermissionBadge } from "@/features/sharing/components/permission-badge";
import { isOptimisticGrant } from "@/features/sharing/hooks/use-create-share-grant";
import type { ShareGrant } from "@/features/sharing/types";

type ShareGrantsListProps = {
  grants: ShareGrant[];
  isLoading: boolean;
  isError: boolean;
  onRevoke: (grant: ShareGrant) => void;
  revokingPrincipalId?: string;
};

/**
 * Who this resource is shared with. The owner is never listed — a grant is
 * always someone else (docs/api-guidelines.md: "owner is implicit").
 */
export function ShareGrantsList({
  grants,
  isLoading,
  isError,
  onRevoke,
  revokingPrincipalId,
}: ShareGrantsListProps) {
  return (
    <div className="grid min-w-0 gap-2">
      <h3 className="text-sm font-medium text-foreground">Shared with</h3>

      <div className="max-h-48 min-h-24 overflow-auto rounded-md border">
        {isLoading ? (
          <p className="p-4 text-sm text-muted-foreground" role="status">
            Loading…
          </p>
        ) : isError ? (
          <p className="p-4 text-sm text-destructive" role="alert">
            Couldn&rsquo;t load who this is shared with.
          </p>
        ) : grants.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Not shared with anyone yet.
          </p>
        ) : (
          <ul className="divide-y">
            {grants.map((grant) => {
              // A grant the server has not acknowledged has no real principal
              // id yet, so revoking it would 404. Wait for the response.
              const pending = isOptimisticGrant(grant);
              const label = grant.principal.email ?? grant.principal.id;

              return (
                <li
                  key={grant.principal.id}
                  data-optimistic={pending ? "" : undefined}
                  aria-busy={pending || undefined}
                  className={pending ? "opacity-60" : undefined}
                >
                  <div className="flex items-center gap-3 px-3 py-2">
                    <MemberAvatar
                      size="md"
                      label={label}
                      seed={grant.principal.email ?? grant.principal.id}
                      src={grant.principal.avatarUrl}
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-sm text-foreground"
                      title={label}
                    >
                      {label}
                    </span>
                    <PermissionBadge role={grant.role} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      // Name each button for its person: three bare "Remove"s
                      // are indistinguishable in a screen reader's list.
                      aria-label={`Remove ${label}`}
                      disabled={
                        pending || revokingPrincipalId === grant.principal.id
                      }
                      onClick={() => onRevoke(grant)}
                    >
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
