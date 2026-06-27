import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { MAX_TRADE_STAKE_USD } from "./risk";

const HOUSE_EDGE = 0.03;
const MIN_POLY_BET_USD = 2;

type PolyMarket = {
  id: string;
  title: string;
  description: string | null;
  status: "open" | "resolved" | "void";
  outcome: "yes" | "no" | null;
  min_bet_kes: number | string;
  closes_at: string | null;
  created_at: string;
};

type PolyBet = {
  id: string;
  market_id: string;
  user_id: string;
  side: "yes" | "no";
  amount_kes: number | string;
  quoted_multiplier: number | string;
  status: "open" | "won" | "lost" | "refund";
  payout_kes: number | string;
  created_at: string;
};

function settleQuote(side: "yes" | "no", amount: number, bets: PolyBet[]) {
  const yesPool =
    bets.filter((b) => b.side === "yes").reduce((sum, b) => sum + Number(b.amount_kes), 0) +
    (side === "yes" ? amount : 0);
  const noPool =
    bets.filter((b) => b.side === "no").reduce((sum, b) => sum + Number(b.amount_kes), 0) +
    (side === "no" ? amount : 0);
  const totalPool = yesPool + noPool;
  const sidePool = side === "yes" ? yesPool : noPool;
  const multiplier = sidePool > 0 ? ((totalPool * (1 - HOUSE_EDGE)) / sidePool) : 1;
  return Math.max(0.01, Math.round(multiplier * 10000) / 10000);
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const listPolymarkets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [marketsRes, betsRes] = await Promise.all([
      (supabaseAdmin as any)
        .from("poly_markets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80),
      (supabaseAdmin as any).from("poly_bets").select("*").eq("user_id", context.userId).limit(100),
    ]);
    if (marketsRes.error) throw new Error(marketsRes.error.message);
    if (betsRes.error) throw new Error(betsRes.error.message);

    const markets = (marketsRes.data ?? []) as PolyMarket[];
    const allBetsRes = markets.length
      ? await (supabaseAdmin as any)
          .from("poly_bets")
          .select("market_id, side, amount_kes")
          .in("market_id", markets.map((m) => m.id))
      : { data: [], error: null };
    if (allBetsRes.error) throw new Error(allBetsRes.error.message);
    const allBets = (allBetsRes.data ?? []) as PolyBet[];

    return {
      markets: markets.map((market) => {
        const bets = allBets.filter((b) => b.market_id === market.id);
        const yesPool = bets
          .filter((b) => b.side === "yes")
          .reduce((sum, b) => sum + Number(b.amount_kes), 0);
        const noPool = bets
          .filter((b) => b.side === "no")
          .reduce((sum, b) => sum + Number(b.amount_kes), 0);
        return {
          ...market,
          yesPool,
          noPool,
          yesQuote: settleQuote("yes", 0, bets),
          noQuote: settleQuote("no", 0, bets),
        };
      }),
      bets: (betsRes.data ?? []) as PolyBet[],
      minBetUsd: MIN_POLY_BET_USD,
      houseEdge: HOUSE_EDGE,
    };
  });

export const placePolyBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        marketId: z.string().uuid(),
        side: z.enum(["yes", "no"]),
        amount: z.number().min(MIN_POLY_BET_USD).max(MAX_TRADE_STAKE_USD),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: market, error: marketErr } = await (supabaseAdmin as any)
      .from("poly_markets")
      .select("*")
      .eq("id", data.marketId)
      .maybeSingle();
    if (marketErr) throw new Error(marketErr.message);
    if (!market) throw new Error("Market not found");
    if ((market as PolyMarket).status !== "open") throw new Error("Market is closed");
    if ((market as PolyMarket).closes_at && new Date((market as PolyMarket).closes_at!).getTime() < Date.now()) {
      throw new Error("Market is closed");
    }
    if (data.amount < Number((market as PolyMarket).min_bet_kes ?? MIN_POLY_BET_USD)) {
      throw new Error(`Minimum bet is USD ${Number((market as PolyMarket).min_bet_kes)}`);
    }

    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from("wallets")
      .select("balance_kes")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (walletErr) throw new Error(walletErr.message);
    const balance = Number(wallet?.balance_kes ?? 0);
    if (balance < data.amount) throw new Error("Insufficient wallet balance");

    const { data: existingBets, error: betsErr } = await (supabaseAdmin as any)
      .from("poly_bets")
      .select("*")
      .eq("market_id", data.marketId);
    if (betsErr) throw new Error(betsErr.message);
    const quote = settleQuote(data.side, data.amount, (existingBets ?? []) as PolyBet[]);

    const { error: walletUpdateErr } = await supabaseAdmin
      .from("wallets")
      .update({
        balance_kes: balance - data.amount,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("user_id", context.userId);
    if (walletUpdateErr) throw new Error(walletUpdateErr.message);

    const { data: bet, error: betErr } = await (supabaseAdmin as any)
      .from("poly_bets")
      .insert({
        market_id: data.marketId,
        user_id: context.userId,
        side: data.side,
        amount_kes: data.amount,
        quoted_multiplier: quote,
      } as never)
      .select()
      .single();
    if (betErr) throw new Error(betErr.message);

    await supabaseAdmin.from("transactions").insert({
      user_id: context.userId,
      type: "poly_bet",
      amount_kes: -data.amount,
      status: "success",
      reference: `poly_${(bet as PolyBet).id}`,
      meta: { marketId: data.marketId, side: data.side, quotedMultiplier: quote },
    });

    return { ok: true, bet, quotedMultiplier: quote };
  });

export const createPolyMarket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        title: z.string().min(5).max(160),
        description: z.string().max(1000).optional(),
        minBet: z.number().min(MIN_POLY_BET_USD).max(1000).default(MIN_POLY_BET_USD),
        closesAt: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("poly_markets")
      .insert({
        title: data.title,
        description: data.description ?? null,
        min_bet_kes: data.minBet,
        closes_at: data.closesAt ? new Date(data.closesAt).toISOString() : null,
        created_by: context.userId,
      } as never)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const resolvePolyMarket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ marketId: z.string().uuid(), outcome: z.enum(["yes", "no", "void"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: market, error: marketErr } = await (supabaseAdmin as any)
      .from("poly_markets")
      .select("*")
      .eq("id", data.marketId)
      .maybeSingle();
    if (marketErr) throw new Error(marketErr.message);
    if (!market) throw new Error("Market not found");
    if ((market as PolyMarket).status !== "open") throw new Error("Market already resolved");

    const { data: betsData, error: betsErr } = await (supabaseAdmin as any)
      .from("poly_bets")
      .select("*")
      .eq("market_id", data.marketId)
      .eq("status", "open");
    if (betsErr) throw new Error(betsErr.message);
    const bets = (betsData ?? []) as PolyBet[];
    const totalPool = bets.reduce((sum, b) => sum + Number(b.amount_kes), 0);
    const winningPool =
      data.outcome === "void"
        ? totalPool
        : bets
            .filter((b) => b.side === data.outcome)
            .reduce((sum, b) => sum + Number(b.amount_kes), 0);
    const payoutRate =
      data.outcome === "void"
        ? 1
        : winningPool > 0
          ? (totalPool * (1 - HOUSE_EDGE)) / winningPool
          : 0;

    for (const bet of bets) {
      const isRefund = data.outcome === "void";
      const won = !isRefund && bet.side === data.outcome;
      const payout = isRefund
        ? Number(bet.amount_kes)
        : won
          ? Math.round(Number(bet.amount_kes) * payoutRate * 100) / 100
          : 0;
      const nextStatus = isRefund ? "refund" : won ? "won" : "lost";
      await (supabaseAdmin as any)
        .from("poly_bets")
        .update({ status: nextStatus, payout_kes: payout, settled_at: new Date().toISOString() } as never)
        .eq("id", bet.id);
      if (payout > 0) {
        const { data: wallet } = await supabaseAdmin
          .from("wallets")
          .select("balance_kes")
          .eq("user_id", bet.user_id)
          .maybeSingle();
        await supabaseAdmin
          .from("wallets")
          .update({
            balance_kes: Number(wallet?.balance_kes ?? 0) + payout,
            updated_at: new Date().toISOString(),
          } as never)
          .eq("user_id", bet.user_id);
      }
      await supabaseAdmin.from("transactions").insert({
        user_id: bet.user_id,
        type: "poly_settle",
        amount_kes: payout,
        status: "success",
        reference: `poly_settle_${bet.id}`,
        meta: {
          marketId: data.marketId,
          outcome: data.outcome,
          betSide: bet.side,
          stake: Number(bet.amount_kes),
          payout,
          payoutRate,
        },
      });
    }

    const { error: updateErr } = await (supabaseAdmin as any)
      .from("poly_markets")
      .update({
        status: data.outcome === "void" ? "void" : "resolved",
        outcome: data.outcome === "void" ? null : data.outcome,
        resolved_at: new Date().toISOString(),
        resolved_by: context.userId,
      } as never)
      .eq("id", data.marketId);
    if (updateErr) throw new Error(updateErr.message);

    return { ok: true, settled: bets.length, outcome: data.outcome };
  });
