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
    const { data } = await context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle();
    if (data) {
      if (Number(data.demo_balance_usd ?? 0) === 0) {
        const [{ count: tradeCount }, { count: txCount }] = await Promise.all([
          context.supabase
            .from("trades")
            .select("id", { count: "exact", head: true })
            .eq("user_id", context.userId)
            .eq("account_type", "demo"),
          context.supabase
            .from("transactions")
            .select("id", { count: "exact", head: true })
            .eq("user_id", context.userId)
            .eq("account_type", "demo"),
        ]);

        if ((tradeCount ?? 0) === 0 && (txCount ?? 0) === 0) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: repaired } = await supabaseAdmin
            .from("profiles")
            .update({ demo_balance_usd: 10000, active_account: "demo" })
            .eq("id", context.userId)
            .select("*")
            .single();
          return repaired ?? data;
        }
      }
      return data;
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const email = user.user?.email ?? null;
    const fullName = typeof user.user?.user_metadata?.full_name === "string" ? user.user.user_metadata.full_name : null;
    const username =
      (typeof user.user?.user_metadata?.username === "string" && user.user.user_metadata.username) ||
      email?.split("@")[0] ||
      "client";

    const { data: created, error } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: context.userId,
        email,
        username,
        full_name: fullName,
        demo_balance_usd: 10000,
        active_account: "demo",
      })
      .select("*")
      .single();
    if (error) throw error;

    await supabaseAdmin.from("user_settings").upsert({ user_id: context.userId });
    await supabaseAdmin.from("user_roles").upsert(
      { user_id: context.userId, role: "client" },
      { onConflict: "user_id,role" },
    );

    return created;
  });
