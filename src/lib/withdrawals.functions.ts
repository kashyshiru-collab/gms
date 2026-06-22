import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { MIN_WITHDRAWAL_USD } from "./money";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

async function submitWithdrawalToDaraja(
  supabaseAdmin: any,
  req: { id: string; amount_kes: number | string; phone: string; reference: string | null },
  reviewedBy: string,
) {
  const { withdrawToMobile } = await import("./daraja.server");

  await supabaseAdmin
    .from("withdrawal_requests")
    .update({
      status: "processing",
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      admin_note: "Auto payout sent to Daraja",
    })
    .eq("id", req.id);

  try {
    const resp = await withdrawToMobile({
      amountUsd: Number(req.amount_kes),
      phone: req.phone,
      externalReference: req.reference ?? req.id,
    });
    await supabaseAdmin
      .from("withdrawal_requests")
      .update({
        status: "processing",
        daraja_response: { request: resp },
      })
      .eq("id", req.id);
    return { ok: true, id: req.id };
  } catch (e) {
    await supabaseAdmin.rpc("refund_withdrawal", {
      p_request_id: req.id,
      p_reason: "Payout failed: " + (e as Error).message,
    });
    await supabaseAdmin
      .from("withdrawal_requests")
      .update({ status: "failed", daraja_response: { error: (e as Error).message } })
      .eq("id", req.id);
    return { ok: false, id: req.id, error: (e as Error).message };
  }
}

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        amount: z.number().min(MIN_WITHDRAWAL_USD).max(500000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getProfileFlags } = await import("./compliance.server");

    const flags = await getProfileFlags(supabaseAdmin, context.userId);
    if (flags.is_burned) {
      throw new Error("Account disabled. Please contact support.");
    }

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("phone")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);

    const registeredPhone = String(profile?.phone ?? "").trim();
    if (registeredPhone.length < 9) {
      throw new Error("No registered M-Pesa phone found on your profile.");
    }

    const { data: row, error } = await context.supabase.rpc("request_withdrawal", {
      p_amount: data.amount,
      p_phone: registeredPhone,
    });
    if (error) throw new Error(error.message);

    const req = row as { id: string; reference: string } | null;
    if (!req) return { request: row };

    const result = await submitWithdrawalToDaraja(
      supabaseAdmin,
      { ...req, amount_kes: data.amount, phone: registeredPhone },
      context.userId,
    );
    if (!result.ok) throw new Error(result.error);

    return { request: row, processing: true };
  });

export const processMyPendingWithdrawals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id, amount_kes, phone, reference")
      .eq("user_id", context.userId)
      .eq("status", "pending")
      .is("daraja_response", null)
      .order("created_at", { ascending: true })
      .limit(5);
    if (error) throw new Error(error.message);

    const results = [];
    for (const req of data ?? []) {
      results.push(await submitWithdrawalToDaraja(supabaseAdmin, req, context.userId));
    }

    return {
      processed: results.length,
      failed: results.filter((result) => !result.ok).length,
      results,
    };
  });

export const listMyWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("withdrawal_requests")
      .select("id, amount_kes, phone, status, admin_note, created_at, reviewed_at")
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAllWithdrawals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("withdrawal_requests")
      .select(
        "id, user_id, amount_kes, phone, status, admin_note, reference, created_at, reviewed_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((data ?? []).map((r) => r.user_id)));
    const profilesByUser: Record<string, { email: string | null; full_name: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);
      for (const p of profs ?? []) {
        profilesByUser[p.id] = { email: p.email, full_name: p.full_name };
      }
    }
    return (data ?? []).map((r) => ({ ...r, profile: profilesByUser[r.user_id] ?? null }));
  });
