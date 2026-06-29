import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/daraja/stk-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => ({}));
        const callback = payload?.Body?.stkCallback ?? {};
        const checkoutRequestId = callback.CheckoutRequestID;
        const resultCode = Number(callback.ResultCode ?? -1);
        const resultDescription = callback.ResultDesc ?? "STK callback received";

        await recordDarajaCallback({
          callbackType: "stk",
          checkoutRequestId,
          resultCode,
          resultDescription,
          payload,
        });

        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});

async function recordDarajaCallback(input: {
  callbackType: string;
  checkoutRequestId?: string;
  resultCode: number;
  resultDescription: string;
  payload: unknown;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: paymentRequest } = await supabaseAdmin
    .from("payment_requests")
    .select("id, transaction_id")
    .eq("checkout_request_id", input.checkoutRequestId ?? "")
    .maybeSingle();

  await supabaseAdmin.from("daraja_callbacks").insert({
    payment_request_id: paymentRequest?.id ?? null,
    transaction_id: paymentRequest?.transaction_id ?? null,
    callback_type: input.callbackType,
    checkout_request_id: input.checkoutRequestId ?? null,
    result_code: input.resultCode,
    result_description: input.resultDescription,
    payload: input.payload,
  } as any);

  if (!paymentRequest?.transaction_id) return;

  const status = input.resultCode === 0 ? "completed" : "failed";
  await supabaseAdmin.rpc("apply_transaction", {
    _transaction_id: paymentRequest.transaction_id,
    _status: status,
    _meta: {
      daraja_result_code: input.resultCode,
      daraja_result_description: input.resultDescription,
    },
  });
  await supabaseAdmin.from("payment_requests").update({ status }).eq("id", paymentRequest.id);
}
