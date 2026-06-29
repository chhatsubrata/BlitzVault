import type { Metadata } from "next";
import { PlaceholderSection } from "@/components/layout/placeholder-section";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PlaceholderSection
      title="Settings"
      hint="Account and workspace preferences will appear here."
    />
  );
}
