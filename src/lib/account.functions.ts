import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ADMIN_EMAILS = new Set(["gregtory03@gmail.com"]);

export const createPasswordAccount = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        fullName: z.string().min(2).max(120),
        phone: z.string().min(9).max(20),
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
        full_name: data.fullName.trim(),
        phone: data.phone.trim(),
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
        full_name: data.fullName.trim(),
        phone: data.phone.trim(),
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
        full_name: meta.full_name ?? meta.name ?? null,
        phone: meta.phone ?? null,
        referral_code: (codeRow as unknown as string) ?? null,
      });
    } else {
      // Backfill missing fields if user signed up before metadata was captured.
      const patch: { full_name?: string; phone?: string; email?: string } = {};
      if (meta.full_name) patch.full_name = String(meta.full_name);
      if (meta.phone) patch.phone = String(meta.phone);
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

    return { ok: true };
  });
