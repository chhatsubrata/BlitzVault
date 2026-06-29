import type { Metadata } from "next";
import { PlaceholderSection } from "@/components/layout/placeholder-section";

export const metadata: Metadata = { title: "Shared with me" };

export default function SharedPage() {
  return (
    <PlaceholderSection
      title="Shared with me"
      hint="Files and folders others share with you will appear here."
    />
  );
}
