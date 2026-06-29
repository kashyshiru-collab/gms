import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Target } from "lucide-react";

export const Route = createFileRoute("/_authenticated/positions")({
  component: PositionsPage,
});

function PositionsPage() {
  const [tab, setTab] = useState<"open" | "closed" | "tx">("open");
  const { data: trades = [] } = useQuery({
    queryKey: ["trades", tab],
    queryFn: async () => {
      let q = supabase.from("trades").select("*").order("created_at", { ascending: false }).limit(50);
      if (tab === "open") q = q.eq("status", "open");
      if (tab === "closed") q = q.in("status", ["won", "lost", "closed"]);
      const { data } = await q;
      return data ?? [];
    },
    refetchInterval: 2500,
  });

  const tabs = [
    { k: "open" as const, label: `Open (${tab === "open" ? trades.length : ""})` },
    { k: "closed" as const, label: "Closed" },
    { k: "tx" as const, label: "Transactions" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex border-b border-border">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={"flex-1 py-3 text-sm font-bold border-b-2 transition " + (tab === t.k ? "border-primary text-primary" : "border-transparent text-muted-foreground")}>
            {t.label}
          </button>
        ))}
      </div>

      {trades.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
          <div className="h-16 w-16 rounded-full bg-surface grid place-items-center mb-4 border border-border">
            <Target className="h-6 w-6" />
          </div>
          <p className="text-sm">Your {tab === "open" ? "active trades" : tab === "closed" ? "closed trades" : "transactions"} will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {trades.map((t) => (
            <div key={t.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
              <div>
                <div className="font-bold text-sm">{t.market} <span className={"ml-2 text-xs " + (t.direction === "BUY" || t.direction === "OVER" || t.direction === "EVEN" || t.direction === "MATCH" ? "text-bull" : "text-bear")}>{t.direction}</span></div>
                <div className="text-xs text-muted-foreground">{t.module} · ${Number(t.stake).toFixed(2)} · {new Date(t.created_at).toLocaleTimeString()}</div>
              </div>
              <div className="text-right">
                <div className={"text-sm font-bold " + (t.status === "won" ? "text-bull" : t.status === "lost" ? "text-bear" : "text-muted-foreground")}>{t.status.toUpperCase()}</div>
                {Number(t.payout) > 0 && <div className="text-xs text-bull tabular-nums">+${Number(t.payout).toFixed(2)}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
