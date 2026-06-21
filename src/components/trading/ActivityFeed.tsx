import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowDownToLine, ArrowUpFromLine, Trophy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { formatMoney } from "@/lib/money";

type Event = {
  id: string;
  kind: "win" | "deposit" | "withdraw" | "signup";
  display_name: string;
  amount_kes: number | null;
  pair: string | null;
  created_at: string;
};

const fmt = (n: number) => formatMoney(n, 0);

export function ActivityFeed() {
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("activity_events")
      .select("id, kind, display_name, amount_kes, pair, created_at")
      .order("created_at", { ascending: false })
      .limit(40)
      .then(({ data }) => {
        if (!cancelled && data) setEvents(data as Event[]);
      });

    const channel = supabase
      .channel("activity_events")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_events" }, (payload) => {
        setEvents((prev) => [payload.new as Event, ...prev].slice(0, 40));
      })
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="rounded-xl border border-border bg-card flex flex-col h-full">
      <div className="border-b border-border px-4 py-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Live activity</h3>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-bull/60 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-bull" />
          </span>
          live
        </span>
      </div>
      <ul className="divide-y divide-border overflow-y-auto max-h-[460px]">
        {events.length === 0 && (
          <li className="px-4 py-10 text-center text-xs text-muted-foreground">Waiting for activity…</li>
        )}
        {events.map((e) => <Row key={e.id} e={e} />)}
      </ul>
    </div>
  );
}

function Row({ e }: { e: Event }) {
  const cfg = (() => {
    switch (e.kind) {
      case "win":
        return { icon: Trophy, color: "text-bull", bg: "bg-bull/10",
                 text: <>won <b className="text-bull">{e.amount_kes != null ? fmt(Number(e.amount_kes)) : ""}</b>{e.pair ? <> on <span className="font-mono">{e.pair}</span></> : null}</> };
      case "deposit":
        return { icon: ArrowDownToLine, color: "text-primary", bg: "bg-primary/10",
                 text: <>deposited <b>{e.amount_kes != null ? fmt(Number(e.amount_kes)) : ""}</b></> };
      case "withdraw":
        return { icon: ArrowUpFromLine, color: "text-foreground", bg: "bg-muted",
                 text: <>withdrew <b>{e.amount_kes != null ? fmt(Number(e.amount_kes)) : ""}</b></> };
      default:
        return { icon: Trophy, color: "text-muted-foreground", bg: "bg-muted", text: <>{e.kind}</> };
    }
  })();
  const Icon = cfg.icon;
  return (
    <li className="px-4 py-2.5 flex items-start gap-3 text-sm hover:bg-muted/30 transition-colors">
      <div className={`h-7 w-7 shrink-0 rounded-full flex items-center justify-center ${cfg.bg}`}>
        <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="truncate"><span className="font-medium">{e.display_name}</span> {cfg.text}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
        </div>
      </div>
    </li>
  );
}
