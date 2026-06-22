import { createFileRoute } from "@tanstack/react-router";

function resultParameter(result: any, key: string) {
  const params = result?.ResultParameters?.ResultParameter;
  if (!Array.isArray(params)) return null;
  const item = params.find((p) => p?.Key === key);
  return item?.Value == null ? null : String(item.Value);
}

function stringValue(value: unknown) {
  return value == null ? null : String(value);
}

function compactStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((v) => v?.trim()).filter(Boolean) as string[]));
}

function responseMatchesIdentifier(response: unknown, identifiers: string[]) {
  if (!response || typeof response !== "object") return false;
  const request = (response as any).request ?? response;
  return identifiers.some(
    (id) =>
      request?.OriginatorConversationID === id ||
      request?.ConversationID === id ||
      request?.ResponseRefID === id,
  );
}

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
        const identifiers = compactStrings([
          stringValue(r?.OriginatorConversationID),
          stringValue(r?.ConversationID),
          stringValue(r?.Occasion),
          resultParameter(r, "OriginatorConversationID"),
          resultParameter(r, "ConversationID"),
        ]);
        const resultCode = Number(r?.ResultCode ?? 1);
        if (!identifiers.length) return new Response("missing reference", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: directTx } = await supabaseAdmin
          .from("transactions")
          .select("*")
          .in("reference", identifiers)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const success = resultCode === 0;
        const receipt =
          resultParameter(r, "TransactionReceipt") ??
          resultParameter(r, "MpesaReceiptNumber") ??
          resultParameter(r, "ReceiptNo");

        const { data: directWithdrawal } = await supabaseAdmin
          .from("withdrawal_requests")
          .select("*")
          .in("reference", identifiers)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        let withdrawal = directWithdrawal;

        if (!withdrawal) {
          const { data: recentWithdrawals } = await supabaseAdmin
            .from("withdrawal_requests")
            .select("*")
            .in("status", ["pending", "approved", "processing"])
            .order("created_at", { ascending: false })
            .limit(100);
          withdrawal =
            recentWithdrawals?.find((row) =>
              responseMatchesIdentifier(row.daraja_response, identifiers),
            ) ?? null;
        }

        if (withdrawal && !["paid", "failed", "rejected"].includes(withdrawal.status)) {
          const prevResponse =
            withdrawal.daraja_response && typeof withdrawal.daraja_response === "object"
              ? withdrawal.daraja_response
              : {};

          if (success) {
            await supabaseAdmin
              .from("withdrawal_requests")
              .update({
                status: "paid",
                daraja_response: { ...prevResponse, callback: r },
                admin_note: receipt ? `Paid: ${receipt}` : "Paid by Daraja",
                reviewed_at: new Date().toISOString(),
              })
              .eq("id", withdrawal.id);

            await supabaseAdmin.from("transactions").insert({
              user_id: withdrawal.user_id,
              type: "withdraw_paid",
              amount_kes: 0,
              status: "success",
              reference: "paid_" + withdrawal.id,
              mpesa_receipt: receipt,
              meta: { request_id: withdrawal.id, callback: r, phone: withdrawal.phone },
            });
          } else {
            await supabaseAdmin.rpc("refund_withdrawal", {
              p_request_id: withdrawal.id,
              p_reason: `Daraja payout failed: ${r?.ResultDesc ?? "Unknown error"}`,
            });
            await supabaseAdmin
              .from("withdrawal_requests")
              .update({
                status: "failed",
                daraja_response: { ...prevResponse, callback: r },
                reviewed_at: new Date().toISOString(),
              })
              .eq("id", withdrawal.id);
          }
        }

        let tx = directTx;
        if (!tx) {
          const { data: recentTxs } = await supabaseAdmin
            .from("transactions")
            .select("*")
            .eq("type", "admin_withdraw")
            .eq("status", "processing")
            .order("created_at", { ascending: false })
            .limit(100);
          tx =
            recentTxs?.find((row) => responseMatchesIdentifier(row.meta, identifiers)) ?? null;
        }

        if (tx) {
          const prevMeta = (tx.meta && typeof tx.meta === "object" ? tx.meta : {}) as Record<
            string,
            unknown
          >;
          const nextStatus =
            tx.type === "admin_withdraw" ? (success ? "success" : "failed") : tx.status;
          await supabaseAdmin
            .from("transactions")
            .update({
              status: nextStatus,
              mpesa_receipt: receipt,
              meta: { ...prevMeta, callback: r },
            })
            .eq("id", tx.id);
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
