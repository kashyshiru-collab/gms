import { createHash, randomBytes } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { MAX_TRADE_STAKE_USD } from "./risk";

function crashFromSeed(seed: Buffer) {
  const hash = createHash("sha256").update(seed).digest();
  const n = hash.readUIntBE(0, 6);
  const u = n / 0x1000000000000;
  if (u < 0.035) return 1;
  const raw = 0.97 / Math.max(0.000001, 1 - u);
  return Math.max(1, Math.min(250, Math.floor(raw * 100) / 100));
}

export const playAviatorRound = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        stake: z.number().min(1).max(MAX_TRADE_STAKE_USD),
        cashoutMultiplier: z.number().min(1.01).max(100),
        clientSeed: z.string().min(3).max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const serverSeed = randomBytes(32);
    const mixedSeed = createHash("sha256")
      .update(serverSeed)
      .update(data.clientSeed ?? `${context.userId}:${Date.now()}`)
      .digest();
    const crashMultiplier = crashFromSeed(mixedSeed);
    const won = data.cashoutMultiplier <= crashMultiplier;
    const payout = won ? Math.round(data.stake * data.cashoutMultiplier * 0.97 * 100) / 100 : 0;
    const profit = payout - data.stake;
    const seedHash = createHash("sha256").update(serverSeed).digest("hex");

    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from("wallets")
      .select("balance_kes")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (walletErr) throw new Error(walletErr.message);
    const balance = Number(wallet?.balance_kes ?? 0);
    if (balance < data.stake) throw new Error("Insufficient wallet balance");

    const nextBalance = balance - data.stake + payout;
    const { error: updateErr } = await supabaseAdmin
      .from("wallets")
      .update({ balance_kes: nextBalance, updated_at: new Date().toISOString() } as never)
      .eq("user_id", context.userId);
    if (updateErr) throw new Error(updateErr.message);

    const { error: roundErr } = await (supabaseAdmin as any).from("aviator_rounds").insert({
      user_id: context.userId,
      stake_kes: data.stake,
      cashout_multiplier: data.cashoutMultiplier,
      crash_multiplier: crashMultiplier,
      payout_kes: payout,
      seed_hash: seedHash,
      client_seed: data.clientSeed ?? null,
      status: won ? "won" : "lost",
    } as never);
    if (roundErr && roundErr.code !== "42P01") {
      throw new Error(roundErr.message);
    }

    await supabaseAdmin.from("transactions").insert({
      user_id: context.userId,
      type: "aviator",
      amount_kes: profit,
      status: "success",
      reference: `aviator_${Date.now()}`,
      meta: {
        stake: data.stake,
        cashoutMultiplier: data.cashoutMultiplier,
        crashMultiplier,
        payout,
        seedHash,
        won,
      },
    });

    return {
      ok: true,
      won,
      stake: data.stake,
      payout,
      profit,
      crashMultiplier,
      cashoutMultiplier: data.cashoutMultiplier,
      seedHash,
    };
  });
