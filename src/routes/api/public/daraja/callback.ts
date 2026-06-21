import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/daraja/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: any = {};
        try {
          payload = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const r = payload?.Body?.stkCallback ?? payload?.stkCallback ?? payload;
        const checkoutRequestId: string | undefined = r?.CheckoutRequestID;
        const resultCode = Number(r?.ResultCode ?? 1);
        const receiptItem = (r?.CallbackMetadata?.Item ?? []).find(
          (item: any) => item?.Name === "MpesaReceiptNumber",
        );
        const receipt: string | undefined = receiptItem?.Value;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let txQuery = supabaseAdmin
          .from("transactions")
          .select("*")
          .eq("daraja_reference", checkoutRequestId ?? "");
        let { data: tx, error: txErr } = await txQuery.maybeSingle();

        if (!tx && r?.AccountReference) {
          const fallback = await supabaseAdmin
            .from("transactions")
            .select("*")
            .eq("reference", String(r.AccountReference))
            .maybeSingle();
          tx = fallback.data;
          txErr = fallback.error;
        }

        if (txErr || !tx) {
          console.error("Daraja callback for unknown tx", checkoutRequestId, txErr);
          return new Response("unknown reference", { status: 200 });
        }

        if (tx.status === "success") {
          return new Response("ok", { status: 200 });
        }

        const prevMeta = (tx.meta && typeof tx.meta === "object" ? tx.meta : {}) as Record<
          string,
          unknown
        >;
        if (resultCode === 0) {
          const credit = Number(tx.amount_kes);
          const { data: wallet } = await supabaseAdmin
            .from("wallets")
            .select("balance_kes")
            .eq("user_id", tx.user_id)
            .maybeSingle();
          const newBalance = Number(wallet?.balance_kes ?? 0) + credit;
          await supabaseAdmin
            .from("wallets")
            .update({ balance_kes: newBalance, updated_at: new Date().toISOString() })
            .eq("user_id", tx.user_id);

          await supabaseAdmin
            .from("transactions")
            .update({
              status: "success",
              mpesa_receipt: receipt ?? null,
              meta: { ...prevMeta, callback: r },
            })
            .eq("id", tx.id);
        } else {
          await supabaseAdmin
            .from("transactions")
            .update({
              status: "failed",
              meta: { ...prevMeta, callback: r },
            })
            .eq("id", tx.id);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
