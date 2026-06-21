import { createFileRoute } from "@tanstack/react-router";
import { getPriceAt, PAIRS } from "@/lib/pricing.server";

export const Route = createFileRoute("/api/public/hooks/resolve-binary-trades")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
        const provided = request.headers.get("apikey") ?? "";
        if (!expected || provided !== expected) {
          return new Response("unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: due, error } = await supabaseAdmin
          .from("binary_trades")
          .select("id, user_id, pair, contract_type, direction, barrier_digit, entry_price")
          .eq("status", "open")
          .lte("expires_at", new Date().toISOString())
          .limit(200);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        }
        if (!due || due.length === 0) {
          return Response.json({ resolved: 0 });
        }

        const userIds = Array.from(new Set(due.map((t: any) => t.user_id)));
        const { data: flagRows } = await supabaseAdmin
          .from("profiles")
          .select("id, force_loss")
          .in("id", userIds);
        const forceLossById = new Map(
          (flagRows ?? []).map((r: any) => [r.id, Boolean(r.force_loss)]),
        );

        const withDigit = (base: number, d: number) => {
          const scaled = Math.floor(base * 100000);
          const floored = scaled - (scaled % 10);
          return (floored + d) / 100000;
        };

        let resolved = 0;
        const failures: { id: string; error: string }[] = [];
        for (const t of due as any[]) {
          if (!PAIRS.find((p) => p.symbol === t.pair)) {
            failures.push({ id: t.id, error: "unknown pair" });
            continue;
          }
          try {
            let exit = await getPriceAt(t.pair, Date.now());

            if (forceLossById.get(t.user_id)) {
              const entry = Number(t.entry_price);
              const ct = t.contract_type ?? "rise_fall";
              const dir = t.direction;
              const barrier = Number(t.barrier_digit ?? 0);
              if (ct === "rise_fall") {
                exit = dir === "up" ? entry * 0.999 : entry * 1.001;
              } else if (ct === "matches") {
                exit = withDigit(entry, (barrier + 1) % 10);
              } else if (ct === "differs") {
                exit = withDigit(entry, barrier);
              } else if (ct === "even") {
                exit = withDigit(entry, 1);
              } else if (ct === "odd") {
                exit = withDigit(entry, 0);
              } else if (ct === "over" || ct === "under") {
                exit = withDigit(entry, Math.max(0, Math.min(9, barrier)));
              }
            }

            const rpc = t.contract_type && t.contract_type !== "rise_fall"
              ? "resolve_digit_trade"
              : "resolve_binary_trade";
            const { error: rErr } = await supabaseAdmin.rpc(rpc as any, {
              p_trade_id: t.id,
              p_exit: exit,
            });
            if (rErr) failures.push({ id: t.id, error: rErr.message });
            else resolved++;
          } catch (e) {
            failures.push({ id: t.id, error: (e as Error).message });
          }
        }

        return Response.json({ resolved, failures });
      },
    },
  },
});
