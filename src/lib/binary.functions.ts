import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { BINARY_PAYOUT_MULTIPLIER, MAX_TRADE_STAKE_USD } from "./risk";

export const PAYOUT_MULTIPLIER = BINARY_PAYOUT_MULTIPLIER;

export const openBinaryTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      symbol: z.string().min(3).max(10),
      direction: z.enum(["up", "down"]),
      stake: z.number().positive().max(MAX_TRADE_STAKE_USD),
      duration: z.number().int().min(1).max(300),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getPriceAt } = await import("./pricing.server");
    const { supabase } = context;
    const spot = await getPriceAt(data.symbol, Date.now());
    const { data: trade, error } = await supabase.rpc("open_binary_trade", {
      p_pair: data.symbol,
      p_direction: data.direction,
      p_stake: data.stake,
      p_duration: data.duration,
      p_entry: spot,
    });
    if (error) throw new Error(error.message);
    return { ok: true, trade };
  });

export const openDigitTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      symbol: z.string().min(3).max(10),
      contract: z.enum(["rise_fall", "matches", "differs", "even", "odd", "over", "under"]),
      prediction: z.enum(["up", "down", "matches", "differs", "even", "odd", "over", "under"]),
      barrier: z.number().int().min(0).max(9).nullable().optional(),
      stake: z.number().positive().max(MAX_TRADE_STAKE_USD),
      duration: z.number().int().min(1).max(300),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { getPriceAt } = await import("./pricing.server");
    const { supabase } = context;
    const spot = await getPriceAt(data.symbol, Date.now());
    const { data: trade, error } = await supabase.rpc("open_digit_trade", {
      p_pair: data.symbol,
      p_contract: data.contract,
      p_prediction: data.prediction,
      p_barrier: (data.barrier ?? null) as any,
      p_stake: data.stake,
      p_duration: data.duration,
      p_entry: spot,
    });
    if (error) throw new Error(error.message);
    return { ok: true, trade };
  });

export const getActiveBinaryTrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("binary_trades")
      .select("*")
      .eq("user_id", userId)
      .order("opened_at", { ascending: false })
      .limit(20);
    return data ?? [];
  });

// Resolves the calling user's own expired binary/digit trades. Safe to call
// on a poll because resolve_* RPCs short-circuit on already-resolved trades.
export const resolveMyDueBinaryTrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: due } = await supabase
      .from("binary_trades")
      .select("id, pair, contract_type, entry_price")
      .eq("user_id", userId)
      .eq("status", "open")
      .lte("expires_at", new Date().toISOString())
      .limit(50);
    if (!due || due.length === 0) return { resolved: [] as any[] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPriceAt } = await import("./pricing.server");
    const resolved: { id: string; status: string; payout: number; stake: number }[] = [];
    for (const t of due as any[]) {
      try {
        const exit = await getPriceAt(t.pair, Date.now());
        const rpc = t.contract_type && t.contract_type !== "rise_fall"
          ? "resolve_digit_trade"
          : "resolve_binary_trade";
        const { data: r, error } = await supabaseAdmin.rpc(rpc as any, {
          p_trade_id: t.id,
          p_exit: exit,
        });
        if (error || !r) continue;
        resolved.push({
          id: (r as any).id,
          status: (r as any).status,
          payout: Number((r as any).payout_kes ?? 0),
          stake: Number((r as any).stake_kes ?? 0),
        });
      } catch {
        // skip blip
      }
    }
    return { resolved };
  });
