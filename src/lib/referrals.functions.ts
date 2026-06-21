import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyReferralStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: isAgent, error: roleError } = await supabaseAdmin.rpc("has_role", {
      _user_id: userId,
      _role: "agent" as never,
    });
    if (roleError) throw new Error(roleError.message);
    if (!isAgent) throw new Error("Forbidden: agents only");

    const [profileR, refsR, comsR] = await Promise.all([
      supabase.from("profiles").select("referral_code").eq("id", userId).maybeSingle(),
      supabase.from("referrals").select("level, referred_id, created_at").eq("referrer_id", userId),
      supabase.from("referral_commissions")
        .select("id, level, amount_kes, profit_kes, rate, referred_id, created_at")
        .eq("referrer_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const refs = refsR.data ?? [];
    const coms = comsR.data ?? [];
    const counts = { l1: 0, l2: 0, l3: 0 };
    for (const r of refs) {
      if (r.level === 1) counts.l1++;
      else if (r.level === 2) counts.l2++;
      else if (r.level === 3) counts.l3++;
    }
    const earnings = { l1: 0, l2: 0, l3: 0, total: 0 };
    for (const c of coms) {
      const amt = Number(c.amount_kes);
      earnings.total += amt;
      if (c.level === 1) earnings.l1 += amt;
      else if (c.level === 2) earnings.l2 += amt;
      else if (c.level === 3) earnings.l3 += amt;
    }

    return {
      referralCode: profileR.data?.referral_code ?? null,
      counts,
      earnings,
      recent: coms,
    };
  });

export const attachReferrerByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().min(1).max(32) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("attach_referrer", { p_code: data.code.toUpperCase() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
