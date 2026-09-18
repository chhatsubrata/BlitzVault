"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShareCopyLinkRow } from "@/features/sharing/components/share-copy-link-row";
import { ShareGrantForm } from "@/features/sharing/components/share-grant-form";
import { ShareGrantsList } from "@/features/sharing/components/share-grants-list";
import { SharePublicLinkRow } from "@/features/sharing/components/share-public-link-row";
import { useCreateShareGrant } from "@/features/sharing/hooks/use-create-share-grant";
import { useRevokeShareGrant } from "@/features/sharing/hooks/use-revoke-share-grant";
import { useShares } from "@/features/sharing/hooks/use-shares";
import type { ShareResourceRef } from "@/features/sharing/types";
import { isApiError } from "@/lib/api-error";

type ShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ShareResourceRef;
  // Shown in the title so the dialog names what is being shared.
  resourceName: string;
  /**
   * App-relative link to the resource, supplied by the caller: routing belongs
   * to the drive feature, and the dialog should not learn the URL scheme.
   */
  resourceHref: string;
};

export function ShareDialog({
  open,
  onOpenChange,
  resource,
  resourceName,
  resourceHref,
}: ShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open. Beyond resetting form state without a
            setState-in-effect, this is what keeps useShares from mounting once
            per card across the whole grid. */}
        {open ? (
          <ShareDialogBody
            resource={resource}
            resourceName={resourceName}
            resourceHref={resourceHref}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ShareDialogBody({
  resource,
  resourceName,
  resourceHref,
}: {
  resource: ShareResourceRef;
  resourceName: string;
  resourceHref: string;
}) {
  const shares = useShares(resource);
  const createGrant = useCreateShareGrant(resource);
  const revokeGrant = useRevokeShareGrant(resource);

  return (
    // min-w-0 all the way down: DialogContent is a grid, and a grid item's
    // default min-width:auto lets one long child (the link URL) set the
    // column's max-content width and push every row past the panel edge.
    <div className="grid min-w-0 gap-4">
      <DialogHeader>
        <DialogTitle className="truncate" title={resourceName}>
          Share {resourceName}
        </DialogTitle>
        <DialogDescription>
          People you invite can open this{" "}
          {resource.kind === "folder" ? "folder and everything inside it" : "file"}.
        </DialogDescription>
      </DialogHeader>

      <ShareGrantForm
        pending={createGrant.isPending}
        disabled={shares.isError}
        submitError={grantErrorMessage(createGrant.error)}
        onSubmit={(input) => createGrant.mutate(input)}
      />

      <ShareGrantsList
        grants={shares.data?.grants ?? []}
        isLoading={shares.isLoading}
        isError={shares.isError}
        revokingPrincipalId={
          revokeGrant.isPending ? revokeGrant.variables?.principalId : undefined
        }
        onRevoke={(grant) =>
          revokeGrant.mutate({
            principalId: grant.principal.id,
            email: grant.principal.email,
          })
        }
      />

      <ShareCopyLinkRow href={resourceHref} />

      <SharePublicLinkRow
        resource={resource}
        resourceName={resourceName}
        link={shares.data?.publicLink}
        isLoading={shares.isLoading}
        disabled={shares.isError}
      />
    </div>
  );
}

/**
 * The two grant failures that are about the address the user just typed, so
 * they belong in the form rather than only in a toast. Anything else (network,
 * 403, 500) keeps the mutation's own toast and returns undefined here.
 */
function grantErrorMessage(error: unknown): string | undefined {
  if (!isApiError(error)) return undefined;

  if (error.code === "NOT_FOUND") {
    return "No BlitzVault account uses that email.";
  }
  if (error.code === "CONFLICT") {
    return "They already own this item.";
  }
  return undefined;
}
