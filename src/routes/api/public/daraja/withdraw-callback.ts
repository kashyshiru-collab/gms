import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/daraja/withdraw-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any = {};
        try {
          payload = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const r = payload?.Result ?? payload;
        const reference: string | undefined = r?.OriginatorConversationID ?? r?.Occasion;
        const resultCode = Number(r?.ResultCode ?? 1);
        if (!reference) return new Response("missing reference", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tx } = await supabaseAdmin
          .from("transactions")
          .select("*")
          .eq("reference", reference)
          .maybeSingle();
        if (!tx) return new Response("ok", { status: 200 });

        const success = resultCode === 0;
        const prevMeta = (tx.meta && typeof tx.meta === "object" ? tx.meta : {}) as Record<
          string,
          unknown
        >;
        await supabaseAdmin
          .from("transactions")
          .update({
            status: success ? "success" : "failed",
            meta: { ...prevMeta, callback: r },
          })
          .eq("id", tx.id);

        return new Response("ok", { status: 200 });
      },
    },
  },
});
