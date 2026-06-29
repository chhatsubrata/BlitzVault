import type { Metadata } from "next";
import { DriveView } from "@/features/drive/components/drive-view";

export const metadata: Metadata = { title: "My Drive" };

export default function DrivePage() {
  return <DriveView />;
}
