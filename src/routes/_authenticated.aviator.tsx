import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { AppMenu } from "@/components/AppMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { checkIsAdmin } from "@/lib/admin.functions";
import { playAviatorRound } from "@/lib/aviator.functions";
import { getDashboard } from "@/lib/wallet.functions";
import { formatMoney } from "@/lib/money";
import { ArrowLeft, Plane, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/aviator")({
  head: () => ({ meta: [{ title: "Aviator - TronixOption" }] }),
  component: AviatorPage,
});

function AviatorPage() {
  const qc = useQueryClient();
  const adminFn = useServerFn(checkIsAdmin);
  const dashFn = useServerFn(getDashboard);
  const playFn = useServerFn(playAviatorRound);
  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: () => adminFn(), staleTime: 60_000 });
  const dashQ = useQuery({ queryKey: ["dash"], queryFn: () => dashFn(), refetchInterval: 8_000 });

  const [stake, setStake] = useState("5");
  const [target, setTarget] = useState("2.00");
  const [phase, setPhase] = useState<"idle" | "flying" | "done">("idle");
  const [shownMultiplier, setShownMultiplier] = useState(1);
  const [last, setLast] = useState<any>(null);

  const playMut = useMutation({
    mutationFn: () =>
      playFn({
        data: {
          stake: Number(stake),
          cashoutMultiplier: Number(target),
          clientSeed: `${navigator.userAgent}:${Date.now()}`,
        },
      }),
    onSuccess: (result) => {
      setLast(result);
      setPhase("flying");
      setShownMultiplier(1);
      qc.invalidateQueries({ queryKey: ["dash"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (phase !== "flying" || !last) return;
    const started = performance.now();
    let frame = 0;
    const animate = (now: number) => {
      const elapsed = (now - started) / 1000;
      const next = Math.min(last.crashMultiplier, Math.max(1, Math.exp(elapsed * 0.72)));
      setShownMultiplier(Math.floor(next * 100) / 100);
      if (next >= last.crashMultiplier) {
        setPhase("done");
        toast[last.won ? "success" : "warning"](
          last.won
            ? `Cashed out at ${last.cashoutMultiplier.toFixed(2)}x for ${formatMoney(last.payout)}`
            : `Crashed at ${last.crashMultiplier.toFixed(2)}x`,
        );
        return;
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [phase, last]);

  const path = useMemo(() => {
    const x = Math.min(92, 12 + shownMultiplier * 17);
    const y = Math.max(12, 78 - shownMultiplier * 18);
    return { x, y };
  }, [shownMultiplier]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="grid h-16 grid-cols-[auto_1fr_auto] items-center gap-3 px-3">
          <div className="flex items-center gap-2">
            <AppMenu isAdmin={adminQ.data?.isAdmin} isAgent={adminQ.data?.isAgent} />
            <div className="flex items-center gap-2 font-semibold">
              <Plane className="h-5 w-5 text-primary" />
              Aviator
            </div>
          </div>
          <div className="justify-self-center text-sm text-muted-foreground">
            {formatMoney(dashQ.data?.balance ?? 0)}
          </div>
          <Button asChild size="sm" variant="ghost">
            <Link to="/dashboard">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Trade
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-4 p-3 pb-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="relative h-[54svh] min-h-[360px] overflow-hidden rounded-lg border border-border bg-card">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:48px_48px]" />
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d={`M 8 82 C 24 78, 36 64, ${path.x} ${path.y}`} fill="none" stroke="rgb(34 211 238)" strokeWidth="0.7" />
          </svg>
          <div
            className="absolute flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_36px_var(--primary)] transition-all duration-100"
            style={{ left: `${path.x}%`, top: `${path.y}%`, transform: "translate(-50%, -50%)" }}
          >
            <Plane className="h-7 w-7 rotate-45" />
          </div>
          <div className="absolute inset-x-0 top-10 text-center">
            <div className={`text-6xl font-black tabular ${phase === "done" && !last?.won ? "text-bear" : "text-foreground"}`}>
              {shownMultiplier.toFixed(2)}x
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {phase === "idle" ? "Waiting for next flight" : phase === "flying" ? "Flying" : last?.won ? "Cashed out" : "Crashed"}
            </div>
          </div>
          {last && (
            <div className="absolute bottom-3 left-3 right-3 rounded-md border border-border bg-background/80 p-3 text-xs text-muted-foreground backdrop-blur">
              Server seed hash: <span className="font-mono">{last.seedHash.slice(0, 24)}...</span>
            </div>
          )}
        </section>

        <aside className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Server crypto RNG with SHA-256 seed proof
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Stake (USD)</label>
            <Input type="number" min={1} value={stake} onChange={(e) => setStake(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Auto cashout</label>
            <Input type="number" min={1.01} step="0.01" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 gap-2">
            {["1.50", "2.00", "3.00", "5.00"].map((m) => (
              <button key={m} onClick={() => setTarget(m)} className="rounded border border-border bg-muted/40 py-2 text-sm font-semibold">
                {m}x
              </button>
            ))}
          </div>
          <Button
            className="h-12 w-full font-bold"
            disabled={playMut.isPending || phase === "flying"}
            onClick={() => playMut.mutate()}
          >
            {playMut.isPending || phase === "flying" ? "Round running" : "Start round"}
          </Button>
          {last && (
            <div className="rounded-md border border-border bg-background p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Crash</span>
                <span className="font-mono">{last.crashMultiplier.toFixed(2)}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payout</span>
                <span className={last.payout > 0 ? "text-bull" : "text-bear"}>{formatMoney(last.payout)}</span>
              </div>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
