import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function MetricCard({
  value,
  label,
  className,
  loading = false,
}: {
  value: React.ReactNode;
  label: string;
  className?: string;
  loading?: boolean;
}) {
  return (
    <Card className={cn("py-4 transition-colors hover:bg-card/80", className)}>
      <CardContent className="px-4 text-center">
        <div className="text-2xl font-semibold tabular-nums leading-tight">
          {loading ? (
            <Skeleton className="mx-auto h-7 w-20" />
          ) : (
            value
          )}
        </div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1.5">
          {label}
        </div>
      </CardContent>
    </Card>
  );
}
