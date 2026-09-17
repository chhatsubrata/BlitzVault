"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MemberPicker } from "@/features/sharing/components/member-picker";
import {
  SHARE_ROLES,
  shareGrantCreateSchema,
  type ShareGrantCreateInput,
  type ShareRole,
} from "@/features/sharing/types";

const ROLE_LABELS: Record<ShareRole, string> = {
  editor: "Editor",
  viewer: "Viewer",
};

type ShareGrantFormProps = {
  onSubmit: (input: ShareGrantCreateInput) => void;
  pending: boolean;
  // The shares query failed, so there is nothing sane to grant against.
  disabled?: boolean;
  /**
   * Server rejection about the address just submitted (unknown account, owner).
   * Shown in the field's own error slot rather than only as a toast — the fix
   * is to edit the field, so the message belongs next to it.
   */
  submitError?: string;
};

/**
 * Invite one person by email at a role.
 *
 * Deliberately narrow: it owns only email/role/error and hands a validated
 * input upward. The email field is a typeahead over /users/search, but the
 * submitted value is still just an email — see MemberPicker.
 */
export function ShareGrantForm({
  onSubmit,
  pending,
  disabled = false,
  submitError,
}: ShareGrantFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [error, setError] = useState<string>();

  // A local validation message wins while it is set; otherwise the server's.
  const shownError = error ?? submitError;

  const submit = () => {
    const parsed = shareGrantCreateSchema.safeParse({ email, role });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }

    onSubmit(parsed.data);
    // Clear the address but keep the role: inviting several people at the same
    // level is the common case.
    setEmail("");
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    submit();
  };

  return (
    <form onSubmit={handleSubmit} className="grid min-w-0 gap-3">
      <div className="grid gap-2">
        <Label htmlFor="share-email">Invite by email</Label>
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
          <MemberPicker
            id="share-email"
            value={email}
            disabled={disabled}
            invalid={Boolean(shownError)}
            describedBy={shownError ? "share-email-error" : undefined}
            onChange={(next) => {
              setEmail(next);
              if (error) setError(undefined);
            }}
            onSubmit={submit}
          />

          <div className="flex gap-2">
            {/* A button is labelable, so htmlFor associates: the trigger
                announces "Role, Viewer, combo box". No `name` — Radix would
                render a hidden native select this form never reads. */}
            <Label htmlFor="share-role" className="sr-only">
              Role
            </Label>
            <Select
              value={role}
              onValueChange={(next) => setRole(next as ShareRole)}
              disabled={disabled}
            >
              <SelectTrigger id="share-role" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHARE_ROLES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {ROLE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button type="submit" disabled={pending || disabled}>
              <UserPlus aria-hidden />
              {pending ? "Inviting…" : "Invite"}
            </Button>
          </div>
        </div>

        {shownError ? (
          <p
            id="share-email-error"
            role="alert"
            className="text-destructive text-sm"
          >
            {shownError}
          </p>
        ) : null}
      </div>
    </form>
  );
}
