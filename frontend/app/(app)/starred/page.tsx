import type { Metadata } from "next";
import { PlaceholderSection } from "@/components/layout/placeholder-section";

export const metadata: Metadata = { title: "Starred" };

export default function StarredPage() {
  return (
    <PlaceholderSection
      title="Starred"
      hint="Items you star for quick access will appear here."
    />
  );
}
