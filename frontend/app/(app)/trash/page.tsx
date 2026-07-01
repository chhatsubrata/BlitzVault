import type { Metadata } from "next";
import { TrashView } from "@/features/drive/components/trash-view";

export const metadata: Metadata = { title: "Trash" };

export default function TrashPage() {
  return <TrashView />;
}
