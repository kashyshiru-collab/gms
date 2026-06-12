import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/payhero/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any = {};
        try {
          payload = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        // Payhero callback shape (response.* nested or flat depending on version)
        const r = payload?.response ?? payload;
        const reference: string | undefined = r?.ExternalReference ?? r?.external_reference ?? payload?.ExternalReference;
        const status: string = (r?.Status ?? r?.status ?? "").toString().toLowerCase();
        const receipt: string | undefined = r?.MpesaReceiptNumber ?? r?.mpesa_receipt_number;
        const amountRaw = r?.Amount ?? r?.amount;
        const amount = amountRaw != null ? Number(amountRaw) : undefined;

        if (!reference) {
          return new Response("missing reference", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tx, error: txErr } = await supabaseAdmin
          .from("transactions")
          .select("*")
          .eq("reference", reference)
          .maybeSingle();

        if (txErr || !tx) {
          console.error("Callback for unknown tx", reference, txErr);
          return new Response("unknown reference", { status: 200 });
        }

        if (tx.status === "success") {
          return new Response("ok", { status: 200 });
        }

        const success = status === "success" || status === "completed" || status === "complete";

        if (success) {
          const credit = Number.isFinite(amount as number) ? Number(amount) : Number(tx.amount_kes);

          // Credit wallet
          const { data: wallet } = await supabaseAdmin
            .from("wallets").select("balance_kes").eq("user_id", tx.user_id).maybeSingle();
          const newBalance = Number(wallet?.balance_kes ?? 0) + credit;
          await supabaseAdmin.from("wallets")
            .update({ balance_kes: newBalance, updated_at: new Date().toISOString() })
            .eq("user_id", tx.user_id);

          const prevMeta = (tx.meta && typeof tx.meta === "object" ? tx.meta : {}) as Record<string, unknown>;
          await supabaseAdmin.from("transactions").update({
            status: "success",
            mpesa_receipt: receipt ?? null,
            meta: { ...prevMeta, callback: r },
          }).eq("id", tx.id);
        } else {
          const prevMeta = (tx.meta && typeof tx.meta === "object" ? tx.meta : {}) as Record<string, unknown>;
          await supabaseAdmin.from("transactions").update({
            status: "failed",
            meta: { ...prevMeta, callback: r },
          }).eq("id", tx.id);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
