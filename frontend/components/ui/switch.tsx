"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "@/lib/cn";

// Radix supplies role="switch" and aria-checked itself — never hand-add them.
// `peer` on the root is what makes a sibling Label's peer-disabled: styles fire.

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        // Geometry is deliberate — a 2px inset on ALL four sides (border-box):
        //   width  36 - 2 border - 4 padding = 30 content, thumb 16
        //   height 22 - 2 border             = 20 content, thumb 16, centred
        // The thumb's checked translate is calc(100%-2px) = 14px = 30 - 16, so
        // it lands exactly 2px from the right. Change w-9 or px-0.5 and that
        // translate has to be recomputed with it.
        "peer inline-flex h-5.5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent px-0.5 shadow-xs transition-all outline-none",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "bg-background pointer-events-none block size-4 rounded-full shadow-sm ring-0 transition-transform",
          "data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
