import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/daraja/b2c-result")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => ({}));
        const result = payload?.Result ?? {};
        await recordB2cCallback(payload, result, "b2c");
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});

async function recordB2cCallback(payload: any, result: any, callbackType: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const conversationId = result.ConversationID;
  const originatorConversationId = result.OriginatorConversationID;
  const resultCode = Number(result.ResultCode ?? -1);
  const resultDescription = result.ResultDesc ?? "B2C callback received";

  let query = supabaseAdmin
    .from("payment_requests")
    .select("id, transaction_id")
    .limit(1);

  if (conversationId) {
    query = query.eq("conversation_id", conversationId);
  } else if (originatorConversationId) {
    query = query.eq("originator_conversation_id", originatorConversationId);
  } else {
    query = query.eq("id", "00000000-0000-0000-0000-000000000000");
  }

  const { data } = await query.maybeSingle();

  await supabaseAdmin.from("daraja_callbacks").insert({
    payment_request_id: data?.id ?? null,
    transaction_id: data?.transaction_id ?? null,
    callback_type: callbackType,
    conversation_id: conversationId ?? null,
    result_code: resultCode,
    result_description: resultDescription,
    payload,
  } as any);

  if (!data?.transaction_id) return;

  const status = resultCode === 0 ? "completed" : "failed";
  await supabaseAdmin.rpc("apply_transaction", {
    _transaction_id: data.transaction_id,
    _status: status,
    _meta: {
      daraja_result_code: resultCode,
      daraja_result_description: resultDescription,
    },
  });
  await supabaseAdmin.from("payment_requests").update({ status }).eq("id", data.id);
}
