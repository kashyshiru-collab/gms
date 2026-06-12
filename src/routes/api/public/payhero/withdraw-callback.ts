import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/payhero/withdraw-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any = {};
        try {
          payload = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        const r = payload?.response ?? payload;
        const reference: string | undefined =
          r?.ExternalReference ?? r?.external_reference ?? payload?.ExternalReference;
        const status: string = (r?.Status ?? r?.status ?? "").toString().toLowerCase();
        if (!reference) return new Response("missing reference", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tx } = await supabaseAdmin
          .from("transactions")
          .select("*")
          .eq("reference", reference)
          .maybeSingle();
        if (!tx) return new Response("ok", { status: 200 });

        const success = status === "success" || status === "completed" || status === "complete";
        const prevMeta = (tx.meta && typeof tx.meta === "object" ? tx.meta : {}) as Record<string, unknown>;
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
