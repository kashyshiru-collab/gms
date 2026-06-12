import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDigitStats } from "@/lib/forex.functions";

export function DigitStatsStrip({ symbol }: { symbol: string }) {
  const fn = useServerFn(getDigitStats);
  const q = useQuery({
    queryKey: ["digit-stats", symbol],
    queryFn: () => fn({ data: { symbol } }),
    refetchInterval: 1500,
  });

  if (!q.data) {
    return <div className="h-16 flex items-center justify-center text-xs text-muted-foreground">Loading digit stats…</div>;
  }

  const { digits, lastDigit, maxPct, minPct } = q.data;
  const tied = maxPct === minPct;

  return (
    <div className="flex items-center justify-around gap-1 px-2 py-3 border-t border-border bg-muted/20">
      {digits.map(({ d, pct }) => {
        const isMax = pct === maxPct;
        const isMin = pct === minPct;
        const isLast = d === lastDigit;
        // Tie: both bull & bear markers as red (per user's spec)
        const ringClass =
          tied
            ? "ring-2 ring-bear"
            : isMax
            ? "ring-2 ring-bull"
            : isMin
            ? "ring-2 ring-bear"
            : "ring-1 ring-border";
        return (
          <div key={d} className="flex flex-col items-center min-w-0 relative">
            <div
              className={`h-9 w-9 rounded-full bg-card flex items-center justify-center font-bold text-sm ${ringClass} ${
                isLast ? "shadow-[0_0_0_3px_oklch(0.7_0.18_var(--p-hue,150)/0.25)]" : ""
              }`}
            >{d}</div>
            <div className="text-[10px] mt-0.5 tabular text-muted-foreground">{pct.toFixed(1)}%</div>
            {isLast && (
              <div className="absolute -bottom-2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-primary" />
            )}
          </div>
        );
      })}
    </div>
  );
}
