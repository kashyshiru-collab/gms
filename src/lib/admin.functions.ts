import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getServiceWalletBalance } = await import("./payhero.server");

    const [usersRes, walletsRes, txRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, email, full_name, created_at").order("created_at", { ascending: false }),
      supabaseAdmin.from("wallets").select("balance_kes"),
      supabaseAdmin.from("transactions").select("id, user_id, type, amount_kes, status, reference, mpesa_receipt, created_at").order("created_at", { ascending: false }).limit(50),
    ]);

    const totalUserBalance = (walletsRes.data ?? []).reduce(
      (acc, w) => acc + Number(w.balance_kes ?? 0),
      0,
    );

    let payheroWallet: any = null;
    let payheroError: string | null = null;
    try {
      payheroWallet = await getServiceWalletBalance();
    } catch (e) {
      payheroError = (e as Error).message;
    }

    return {
      users: usersRes.data ?? [],
      transactions: txRes.data ?? [],
      totalUserBalance,
      payheroWallet,
      payheroError,
    };
  });

export const adminWithdrawPayhero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      amount: z.number().int().min(10).max(500000),
      phone: z.string().min(9).max(15),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { withdrawToMobile } = await import("./payhero.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const reference = `adm_wd_${Date.now()}`;
    await supabaseAdmin.from("transactions").insert({
      user_id: context.userId,
      type: "admin_withdraw",
      amount_kes: data.amount,
      status: "pending",
      reference,
      meta: { phone: data.phone, initiated_by: context.userId },
    });

    try {
      const resp = await withdrawToMobile({
        amount: data.amount,
        phone: data.phone,
        externalReference: reference,
      });
      await supabaseAdmin
        .from("transactions")
        .update({ status: "processing", meta: { phone: data.phone, response: resp } })
        .eq("reference", reference);
      return { ok: true, reference, response: resp };
    } catch (e) {
      await supabaseAdmin
        .from("transactions")
        .update({ status: "failed", meta: { phone: data.phone, error: (e as Error).message } })
        .eq("reference", reference);
      throw e;
    }
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: Boolean(data) };
  });

export const listMarketOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("market_overrides")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const createMarketOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      symbol: z.string().min(3).max(10),
      targetPrice: z.number().positive(),
      durationSeconds: z.number().int().min(30).max(24 * 60 * 60),
      revertSeconds: z.number().int().min(0).max(24 * 60 * 60),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPriceAt, invalidateOverrideCache } = await import("./pricing.server");
    const startPrice = await getPriceAt(data.symbol, Date.now());
    const startAt = new Date();
    const endAt = new Date(Date.now() + data.durationSeconds * 1000);
    // Deactivate any prior active override for same symbol
    await supabaseAdmin
      .from("market_overrides")
      .update({ active: false })
      .eq("symbol", data.symbol)
      .eq("active", true);
    const { data: row, error } = await supabaseAdmin
      .from("market_overrides")
      .insert({
        symbol: data.symbol,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        revert_seconds: data.revertSeconds,
        target_price: data.targetPrice,
        start_price: startPrice,
        created_by: context.userId,
        active: true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    invalidateOverrideCache();
    return row;
  });

export const cancelMarketOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { invalidateOverrideCache } = await import("./pricing.server");
    await supabaseAdmin.from("market_overrides").update({ active: false }).eq("id", data.id);
    invalidateOverrideCache();
    return { ok: true };
  });
