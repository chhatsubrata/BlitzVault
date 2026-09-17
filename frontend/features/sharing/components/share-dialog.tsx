"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShareGrantForm } from "@/features/sharing/components/share-grant-form";
import { ShareGrantsList } from "@/features/sharing/components/share-grants-list";
import { SharePublicLinkRow } from "@/features/sharing/components/share-public-link-row";
import { useCreateShareGrant } from "@/features/sharing/hooks/use-create-share-grant";
import { useRevokeShareGrant } from "@/features/sharing/hooks/use-revoke-share-grant";
import { useShares } from "@/features/sharing/hooks/use-shares";
import type { ShareResourceRef } from "@/features/sharing/types";

type ShareDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ShareResourceRef;
  // Shown in the title so the dialog names what is being shared.
  resourceName: string;
};

export function ShareDialog({
  open,
  onOpenChange,
  resource,
  resourceName,
}: ShareDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open. Beyond resetting form state without a
            setState-in-effect, this is what keeps useShares from mounting once
            per card across the whole grid. */}
        {open ? (
          <ShareDialogBody resource={resource} resourceName={resourceName} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ShareDialogBody({
  resource,
  resourceName,
}: {
  resource: ShareResourceRef;
  resourceName: string;
}) {
  const shares = useShares(resource);
  const createGrant = useCreateShareGrant(resource);
  const revokeGrant = useRevokeShareGrant(resource);

  return (
    <div className="grid gap-4">
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

      <SharePublicLinkRow />
    </div>
  );
}
