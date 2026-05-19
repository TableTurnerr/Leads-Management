import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  value,
  label,
  className,
}: {
  value: React.ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <Card className={cn("py-4 transition-colors hover:bg-card/80", className)}>
      <CardContent className="px-4 text-center">
        <div className="text-2xl font-semibold tabular-nums leading-tight">{value}</div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground mt-1.5">
          {label}
        </div>
      </CardContent>
    </Card>
  );
}
