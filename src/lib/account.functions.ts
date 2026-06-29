import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const setActiveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account: z.enum(["real", "demo"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .rpc("set_active_account", { _account: data.account });
    if (error) {
      const direct = await context.supabase
        .from("profiles")
        .update({ active_account: data.account } as any)
        .eq("id", context.userId);

      if (direct.error) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const admin = await supabaseAdmin
          .from("profiles")
          .update({ active_account: data.account } as any)
          .eq("id", context.userId);
        if (admin.error) throw admin.error;
      }
    }
    return { ok: true, account: data.account };
  });

export const resetDemoBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (context.supabase as any).rpc("reset_demo_account");
    if (error) throw error;
    return { ok: true };
  });
