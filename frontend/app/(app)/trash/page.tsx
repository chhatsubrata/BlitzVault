import type { Metadata } from "next";
import { PlaceholderSection } from "@/components/layout/placeholder-section";

export const metadata: Metadata = { title: "Trash" };

export default function TrashPage() {
  return (
    <PlaceholderSection
      title="Trash"
      hint="Deleted items stay here until permanently removed."
    />
  );
}
