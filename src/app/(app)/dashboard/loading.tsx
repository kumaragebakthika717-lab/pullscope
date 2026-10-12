import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
        ))}
      </div>
    </div>
  );
}
