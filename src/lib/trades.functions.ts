import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PlaceTradeInput = z.object({
  module: z.enum(["forex", "binary", "aviator", "predict", "crypto"]),
  market: z.string().min(1).max(64),
  direction: z.string().min(1).max(16),
  stake: z.number().positive().max(1_000_000),
  entry_price: z.number().nullable().optional(),
  meta: z.record(z.string(), z.any()).optional(),
});

export const placeTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PlaceTradeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: trade, error } = await (context.supabase as any).rpc("place_trade", {
      _module: data.module,
      _market: data.market,
      _direction: data.direction,
      _stake: data.stake,
      _entry_price: data.entry_price ?? null,
      _meta: data.meta ?? {},
    });
    if (error) throw error;
    return trade;
  });

const SettleTradeInput = z.object({
  trade_id: z.string().uuid(),
  won: z.boolean(),
  exit_price: z.number().nullable().optional(),
  multiplier: z.number().positive().default(1.85), // ~7.5% house edge on binary
});

export const settleTrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SettleTradeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase as any).rpc("settle_trade", {
      _trade_id: data.trade_id,
      _won: data.won,
      _exit_price: data.exit_price ?? null,
      _multiplier: data.multiplier,
    });
    if (error) throw error;
    return result;
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("profiles").select("*").eq("id", context.userId).single();
    return data;
  });
