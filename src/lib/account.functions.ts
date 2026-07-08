import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

<<<<<<< HEAD
const ADMIN_EMAILS = new Set(["gregtory03@gmail.com"]);

async function attachReferrerFromMetadata(
  supabaseAdmin: any,
  userId: string,
  rawCode: unknown,
) {
  const code = String(rawCode ?? "").trim().toUpperCase();
  if (!code) return;

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("referrals")
    .select("id")
    .eq("referred_id", userId)
    .limit(1);
  if (existingError) throw new Error(existingError.message);
  if ((existing ?? []).length > 0) return;

  const { data: referrer, error: referrerError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("referral_code", code)
    .maybeSingle();
  if (referrerError) throw new Error(referrerError.message);
  if (!referrer || referrer.id === userId) return;

  const { data: agentRole, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", referrer.id)
    .eq("role", "agent")
    .maybeSingle();
  if (roleError) throw new Error(roleError.message);
  if (!agentRole) return;

  await supabaseAdmin
    .from("referrals")
    .insert({ referrer_id: referrer.id, referred_id: userId, level: 1 });

  const { data: l2 } = await supabaseAdmin
    .from("referrals")
    .select("referrer_id")
    .eq("referred_id", referrer.id)
    .eq("level", 1)
    .maybeSingle();
  if (!l2?.referrer_id || l2.referrer_id === userId) return;

  await supabaseAdmin
    .from("referrals")
    .insert({ referrer_id: l2.referrer_id, referred_id: userId, level: 2 });

  const { data: l3 } = await supabaseAdmin
    .from("referrals")
    .select("referrer_id")
    .eq("referred_id", l2.referrer_id)
    .eq("level", 1)
    .maybeSingle();
  if (!l3?.referrer_id || l3.referrer_id === userId) return;

  await supabaseAdmin
    .from("referrals")
    .insert({ referrer_id: l3.referrer_id, referred_id: userId, level: 3 });
}

export const createPasswordAccount = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        firstName: z.string().min(1).max(60).optional(),
        secondName: z.string().min(1).max(60).optional(),
        fullName: z.string().min(2).max(120),
        phone: z.string().min(9).max(20),
        currency: z.string().min(3).max(3).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        first_name: data.firstName?.trim() ?? data.fullName.trim().split(/\s+/)[0] ?? null,
        second_name: data.secondName?.trim() ?? null,
        full_name: data.fullName.trim(),
        phone: data.phone.trim(),
        currency: data.currency ?? "USD",
        referral_code: null,
      },
    });

    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        throw new Error("An account with this email already exists. Please sign in.");
      }
      throw new Error(error.message);
    }

    const userId = created.user?.id;
    if (!userId) throw new Error("Account was not created. Please try again.");

    const { data: codeRow } = await supabaseAdmin.rpc("gen_referral_code");
    await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        email,
        first_name: data.firstName?.trim() ?? null,
        second_name: data.secondName?.trim() ?? null,
        full_name: data.fullName.trim(),
        phone: data.phone.trim(),
        currency: data.currency ?? "USD",
        referral_code: (codeRow as unknown as string) ?? null,
      },
      { onConflict: "id" },
    );

    await supabaseAdmin
      .from("wallets")
      .upsert({ user_id: userId, balance_kes: 0 }, { onConflict: "user_id" });

    if (ADMIN_EMAILS.has(email)) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    }

    return { ok: true };
  });

/**
 * Ensures the signed-in user has a public.profiles row, a public.wallets row,
 * and (for known admin emails) a public.user_roles admin entry. Idempotent.
 * Called after every sign-in / sign-up because we can't add triggers on auth.users.
 */
export const ensureMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Fetch auth user (for email + metadata).
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = authUser?.user?.email ?? null;
    const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, any>;

    // Profile
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("id").eq("id", userId).maybeSingle();
    if (!prof) {
      const { data: codeRow } = await supabaseAdmin.rpc("gen_referral_code");
      await supabaseAdmin.from("profiles").insert({
        id: userId,
        email,
        first_name: meta.first_name ?? null,
        second_name: meta.second_name ?? null,
        full_name: meta.full_name ?? meta.name ?? null,
        phone: meta.phone ?? null,
        currency: meta.currency ?? "USD",
        referral_code: (codeRow as unknown as string) ?? null,
      });
    } else {
      // Backfill missing fields if user signed up before metadata was captured.
      const patch: {
        first_name?: string;
        second_name?: string;
        full_name?: string;
        phone?: string;
        email?: string;
        currency?: string;
      } = {};
      if (meta.first_name) patch.first_name = String(meta.first_name);
      if (meta.second_name) patch.second_name = String(meta.second_name);
      if (meta.full_name) patch.full_name = String(meta.full_name);
      if (meta.phone) patch.phone = String(meta.phone);
      if (meta.currency) patch.currency = String(meta.currency);
      if (email) patch.email = email;
      if (Object.keys(patch).length) {
        await supabaseAdmin.from("profiles").update(patch).eq("id", userId);
      }
    }

    // Wallet
    const { data: wal } = await supabaseAdmin
      .from("wallets").select("user_id").eq("user_id", userId).maybeSingle();
    if (!wal) {
      await supabaseAdmin.from("wallets").insert({ user_id: userId, balance_kes: 0 });
    }

    // Admin role
    if (email && ADMIN_EMAILS.has(email.toLowerCase())) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });
    }

    await attachReferrerFromMetadata(supabaseAdmin, userId, meta.referral_code);

=======
type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
};

export const setActiveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account: z.enum(["real", "demo"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as unknown as RpcClient).rpc("set_active_account", {
      _account: data.account,
    });
    if (error) {
      console.error("[Account] set_active_account RPC failed", { account: data.account, error });
      const direct = await context.supabase
        .from("profiles")
        .update({ active_account: data.account } as Record<string, unknown>)
        .eq("id", context.userId);

      if (direct.error) {
        console.error("[Account] direct profile update failed", {
          account: data.account,
          error: direct.error,
        });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = await supabaseAdmin
          .from("profiles")
          .update({ active_account: data.account } as Record<string, unknown>)
          .eq("id", context.userId);
        if (admin.error) {
          console.error("[Account] admin profile update failed", {
            account: data.account,
            error: admin.error,
          });
          throw new Error(`Failed to switch account: ${admin.error.message}`);
        }
      }
    }
    return { ok: true, account: data.account };
  });

export const resetDemoBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (context.supabase as unknown as RpcClient).rpc("reset_demo_account");
    if (error) throw error;
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
    return { ok: true };
  });
