import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/daraja/b2c-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => ({}));
        await handleB2cCallback(payload, "b2c");
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});

async function handleB2cCallback(
  payload: Record<string, unknown>,
  callbackType: "b2c" | "b2c_timeout",
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = getRecord(payload.Result);
  const conversationId = getString(result.ConversationID);
  const originatorConversationId = getString(result.OriginatorConversationID);
  const resultCode = Number(result.ResultCode ?? -1);
  const resultDescription = getString(result.ResultDesc) ?? "B2C callback received";

  let query = supabaseAdmin.from("payment_requests").select("id, transaction_id").limit(1);
  if (conversationId) query = query.eq("conversation_id", conversationId);
  else if (originatorConversationId) {
    query = query.eq("originator_conversation_id", originatorConversationId);
  } else {
    query = query.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  const { data: paymentRequest } = await query.maybeSingle();

  await supabaseAdmin.from("daraja_callbacks").insert({
    payment_request_id: paymentRequest?.id ?? null,
    transaction_id: paymentRequest?.transaction_id ?? null,
    callback_type: callbackType,
    conversation_id: conversationId ?? null,
    result_code: resultCode,
    result_description: resultDescription,
    payload,
  } as Record<string, unknown>);

  if (!paymentRequest?.transaction_id) return;

  const status = resultCode === 0 ? "completed" : "failed";
  await supabaseAdmin.rpc("apply_transaction", {
    _transaction_id: paymentRequest.transaction_id,
    _status: status,
    _meta: {
      daraja_result_code: resultCode,
      daraja_result_description: resultDescription,
      callback_at: new Date().toISOString(),
    },
  });

  await supabaseAdmin
    .from("payment_requests")
    .update({ status, response_payload: payload } as Record<string, unknown>)
    .eq("id", paymentRequest.id);
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}
