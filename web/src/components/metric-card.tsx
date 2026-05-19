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
    <Card className={cn("py-4", className)}>
      <CardContent className="px-4 text-center">
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}
