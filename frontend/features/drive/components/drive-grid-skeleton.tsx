import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6";
const PLACEHOLDER_COUNT = 8;

export function DriveGridSkeleton() {
  return (
    <div className={GRID} aria-hidden>
      {Array.from({ length: PLACEHOLDER_COUNT }).map((_, i) => (
        <Card key={i} className="gap-3">
          <Skeleton className="size-7" />
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </Card>
      ))}
    </div>
  );
}
