"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
};

/**
 * Invite one person by email at a role.
 *
 * Deliberately narrow: it owns only email/role/error and hands a validated
 * input upward. Wednesday replaces the Input with a typeahead against /users
 * search without touching the dialog or the mutation.
 */
export function ShareGrantForm({
  onSubmit,
  pending,
  disabled = false,
}: ShareGrantFormProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [error, setError] = useState<string>();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
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

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="share-email">Invite by email</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="share-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- initial focus inside a modal dialog
            autoFocus
            className="sm:flex-1"
            placeholder="name@example.com"
            value={email}
            disabled={disabled}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(undefined);
            }}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "share-email-error" : undefined}
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

        {error ? (
          <p
            id="share-email-error"
            role="alert"
            className="text-destructive text-sm"
          >
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
