import type { Metadata } from "next";
import { DriveView } from "@/features/drive/components/drive-view";

export const metadata: Metadata = { title: "My Drive" };

// Next 16: route params are async.
export default async function DriveFolderPage({
  params,
}: {
  params: Promise<{ folderId: string }>;
}) {
  const { folderId } = await params;
  return <DriveView folderId={folderId} />;
}
