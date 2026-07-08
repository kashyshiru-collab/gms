import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/daraja/stk-callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => ({}));
        await handleStkCallback(payload);
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});

async function handleStkCallback(payload: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const callback = getRecord(getRecord(payload.Body).stkCallback);
  const checkoutRequestId = getString(callback.CheckoutRequestID);
  const resultCode = Number(callback.ResultCode ?? -1);
  const resultDescription = getString(callback.ResultDesc) ?? "STK callback received";
  const metadata = extractCallbackMetadata(getArray(getRecord(callback.CallbackMetadata).Item));
  const receiptNumber = getString(metadata.MpesaReceiptNumber);

  const { data: paymentRequest } = await supabaseAdmin
    .from("payment_requests")
    .select("id, transaction_id")
    .eq("checkout_request_id", checkoutRequestId ?? "")
    .maybeSingle();

  await supabaseAdmin.from("daraja_callbacks").insert({
    payment_request_id: paymentRequest?.id ?? null,
    transaction_id: paymentRequest?.transaction_id ?? null,
    callback_type: "stk",
    checkout_request_id: checkoutRequestId ?? null,
    result_code: resultCode,
    result_description: resultDescription,
    payload,
  } as Record<string, unknown>);

  if (!paymentRequest?.transaction_id) return;

  const hasReceipt = Boolean(receiptNumber);
  const status = resultCode === 0 && hasReceipt ? "completed" : resultCode === 0 ? "processing" : "failed";

  if (status === "completed") {
    await supabaseAdmin.rpc("apply_transaction", {
      _transaction_id: paymentRequest.transaction_id,
      _status: status,
      _meta: {
        daraja_result_code: resultCode,
        daraja_result_description: resultDescription,
        mpesa_receipt_number: receiptNumber,
        callback_at: new Date().toISOString(),
      },
    });
  } else {
    await supabaseAdmin.from("transactions").update({
      status,
      meta: {
        daraja_result_code: resultCode,
        daraja_result_description: resultDescription,
        mpesa_receipt_number: receiptNumber ?? null,
        callback_at: new Date().toISOString(),
        callback_guard: status === "processing" ? "missing_receipt_number" : "callback_failed",
      },
    } as Record<string, unknown>).eq("id", paymentRequest.transaction_id);
  }

  await supabaseAdmin
    .from("payment_requests")
    .update({
      status,
      response_payload: payload,
    } as Record<string, unknown>)
    .eq("id", paymentRequest.id);
}

function extractCallbackMetadata(items: Array<{ Name?: string; Value?: unknown }>) {
  return items.reduce<Record<string, unknown>>((acc, item) => {
    if (item.Name) acc[item.Name] = item.Value;
    return acc;
  }, {});
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getArray(value: unknown): Array<{ Name?: string; Value?: unknown }> {
  return Array.isArray(value) ? (value as Array<{ Name?: string; Value?: unknown }>) : [];
}

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
