import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/daraja/b2c-timeout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const payload = await request.json().catch(() => ({}));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        await supabaseAdmin.from("daraja_callbacks").insert({
          callback_type: "b2c_timeout",
          result_code: -1,
          result_description: "B2C request timed out",
          payload,
        } as any);

        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      },
    },
  },
});
