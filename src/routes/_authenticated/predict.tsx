import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, TrendingUp, Users, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/predict")({
  head: () => ({ meta: [{ title: "Polymarket — TRONIXOPTION" }] }),
  component: PredictPage,
});

interface Event {
  id: string;
  question: string;
  category: string;
  yes_price: number;
  no_price: number;
  volume_usd: number;
  ends_at: string;
  resolved: boolean;
}

function formatCountdown(endsAt: string): { label: string; urgent: boolean } {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return { label: "ended", urgent: true };
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d >= 365) {
    const y = Math.floor(d / 365);
    const rd = d % 365;
    return { label: `${y}y ${rd}d`, urgent: false };
  }
  if (d > 0) return { label: `${d}d ${h}h`, urgent: false };
  if (h > 0) return { label: `${h}h ${m}m`, urgent: h < 6 };
  return { label: `${m}m`, urgent: true };
}

function formatVol(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function PredictPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [, setTick] = useState(0);

  useEffect(() => {
    supabase.from("polymarket_events")
      .select("*").eq("resolved", false)
      .order("ends_at", { ascending: true })
      .then(({ data }) => setEvents((data ?? []) as Event[]));
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-2.5">
      <div className="bg-card border border-border rounded-2xl p-3 flex items-start gap-2.5">
        <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary grid place-items-center glow-primary shrink-0"><Sparkles className="h-4 w-4" /></div>
        <div>
          <h1 className="font-bold text-base">Polymarket</h1>
          <p className="text-[11px] text-muted-foreground">Trade real-world event outcomes with YES/NO shares priced by the crowd.</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
        <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" /> {events.length} active</span>
        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> 12,481 traders</span>
      </div>

      {events.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-8 text-center text-sm text-muted-foreground">Loading markets…</div>
      )}

      {events.map((m) => {
        const cd = formatCountdown(m.ends_at);
        return (
          <div key={m.id} className="bg-card border border-border rounded-2xl p-3 space-y-2.5">
            <div className="flex justify-between items-start gap-2">
              <p className="font-semibold leading-snug flex-1 text-sm">{m.question}</p>
              <span className={"text-[10px] whitespace-nowrap flex items-center gap-1 px-1.5 py-0.5 rounded-md " + (cd.urgent ? "bg-bear/15 text-bear" : "bg-surface text-muted-foreground")}>
                <Clock className="h-2.5 w-2.5" /> {cd.label}
              </span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="px-1.5 py-0.5 rounded bg-surface">{m.category}</span>
              <span>{formatVol(Number(m.volume_usd))} vol</span>
            </div>
            <div className="h-1.5 bg-surface rounded-full overflow-hidden flex">
              <div className="bg-bull" style={{ width: `${m.yes_price}%` }} />
              <div className="bg-bear" style={{ width: `${m.no_price}%` }} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="py-2.5 rounded-xl bg-bull/15 border border-bull/40 text-bull font-bold flex items-center justify-between px-3 text-sm">
                <span>YES</span><span className="tabular-nums">{Number(m.yes_price).toFixed(0)}¢</span>
              </button>
              <button className="py-2.5 rounded-xl bg-bear/15 border border-bear/40 text-bear font-bold flex items-center justify-between px-3 text-sm">
                <span>NO</span><span className="tabular-nums">{Number(m.no_price).toFixed(0)}¢</span>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
