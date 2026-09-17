"use client";

import { useState } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

/**
 * Avatar for a share principal: the account photo when Clerk has one, initials
 * otherwise.
 *
 * The backend stores `avatar_url` only when Clerk reports `hasImage` — Clerk
 * hands back a generated placeholder for accounts without a photo, and these
 * initials read better than that. A photo that fails to load (expired proxy
 * URL, offline) falls back to the same initials rather than leaving a broken
 * image.
 *
 * Purely decorative: the row beside it already names the person, so it is
 * aria-hidden rather than repeating that name to a screen reader.
 */

const avatarVariants = cva(
  // leading-none: the font's line box is taller than the glyphs, so default
  // line-height makes two capitals sit visibly high inside the circle.
  "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full text-center leading-none font-semibold tracking-tight uppercase",
  {
    variants: {
      size: {
        sm: "size-6 text-[10px]",
        md: "size-8 text-xs",
        // Spans both lines of a two-line row (name over email).
        lg: "size-9 text-sm",
      },
    },
    defaultVariants: { size: "sm" },
  }
);

/**
 * FNV-1a over the seed, mapped onto the colour wheel.
 *
 * A fixed palette collided constantly at this scale — six users landed on four
 * colours — so the hue is computed instead and everyone gets their own. The
 * yellow-to-cyan band drops in lightness, where a mid-tone fill cannot carry
 * white text; contrast stays above 4.4:1 across the wheel.
 */
const toneFor = (seed: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  const hue = Math.abs(hash) % 360;
  const lightness = hue >= 40 && hue < 200 ? 30 : 42;
  return `hsl(${hue} 62% ${lightness}%)`;
};

/**
 * Two letters where the label gives two words, otherwise the first two
 * characters of the local part — "ada.lovelace@x.dev" reads better as AL than
 * as AD.
 */
const initialsFor = (label: string): string => {
  const localPart = label.split("@")[0] ?? label;
  const words = localPart.split(/[\s._-]+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`;
  }
  return (words[0] ?? label).slice(0, 2) || "?";
};

type MemberAvatarProps = VariantProps<typeof avatarVariants> & {
  /** Email or username — whatever the row displays. Drives the initials. */
  label: string;
  /**
   * Identity the colour is derived from. Pass the email everywhere: the picker
   * labels a row by username and the grants list by email, and without a shared
   * seed the same person would change colour between the two.
   */
  seed?: string;
  /** Account photo, when the account has one. */
  src?: string | null;
  className?: string;
};

export function MemberAvatar({
  label,
  seed,
  src,
  size,
  className,
}: MemberAvatarProps) {
  const [failed, setFailed] = useState(false);
  const showPhoto = Boolean(src) && !failed;

  return (
    <span
      aria-hidden
      data-slot="member-avatar"
      className={cn(avatarVariants({ size }), className)}
      style={
        showPhoto
          ? undefined
          : { backgroundColor: toneFor(seed ?? label), color: "#fff" }
      }
    >
      {showPhoto ? (
        // Plain <img>: next/image would need every Clerk host listed in
        // next.config, and these are already small, cached CDN thumbnails.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src as string}
          alt=""
          className="size-full object-cover"
          // Google's CDN rejects requests carrying a referrer from an unknown
          // origin, which is exactly what localhost is.
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        initialsFor(label)
      )}
    </span>
  );
}
