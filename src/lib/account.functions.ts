import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const setActiveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ account: z.enum(["real", "demo"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any)
      .rpc("set_active_account", { _account: data.account });
    if (error) throw error;
    return { ok: true, account: data.account };
  });

export const resetDemoBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await (context.supabase as any).rpc("reset_demo_account");
    if (error) throw error;
    return { ok: true };
  });
