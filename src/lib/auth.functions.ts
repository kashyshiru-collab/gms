import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SignUpInput = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(120),
  referralCode: z.string().max(16).optional(),
});

export const signUpWithoutEmailVerification = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SignUpInput.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = data.fullName.trim().split(/\s+/)[0] || data.email.split("@")[0];

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName.trim(),
        username,
      },
    });
    if (error) throw error;
    if (!created.user) throw new Error("Account could not be created");

    await supabaseAdmin.from("profiles").upsert({
      id: created.user.id,
      email: data.email,
      username,
      full_name: data.fullName.trim(),
      demo_balance_usd: 10000,
      active_account: "real",
    });
    await supabaseAdmin.from("user_settings").upsert({ user_id: created.user.id });
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: created.user.id, role: "client" }, { onConflict: "user_id,role" });

    const referralCode = data.referralCode?.trim().toUpperCase();
    if (referralCode) {
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("referral_code", referralCode)
        .maybeSingle();

      await supabaseAdmin.from("referrals").upsert({
        client_id: created.user.id,
        agent_id: agent?.id ?? null,
        referral_code: referralCode,
      });
    }

    return { ok: true };
  });
