"use client";

// Shared placeholder body for the Week-1 route stubs. Keeps each page a
// one-liner until the real feature lands.
import { toast } from "sonner";
import { Button } from "../ui/button";
type PlaceholderSectionProps = {
  title: string;
  hint: string;
};

export function PlaceholderSection({ title, hint }: PlaceholderSectionProps) {
  return (
    <section className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
      <Button onClick={() => toast.success("Clicked successfully")}>
        Click me
      </Button>
    </section>
  );
}
