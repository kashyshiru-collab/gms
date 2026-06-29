import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MoneyInput = z.object({
  method: z.enum(["mpesa", "crypto"]),
  amount: z.number().positive().max(10_000_000),
  account: z.enum(["real", "demo"]),
  phone: z.string().optional(),
});

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: WalletTransaction; error: { message?: string } | null }>;
};

type WalletTransaction = {
  id: string;
  amount: number | string;
};

export const createDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MoneyInput.parse(d))
  .handler(async ({ data, context }) => {
    const currency = data.method === "mpesa" ? "KSH" : "USD";
    const { data: tx, error } = await (context.supabase as unknown as RpcClient).rpc(
      "create_transaction",
      {
        _kind: "deposit",
        _method: data.method,
        _amount: data.amount,
        _currency: currency,
        _account: data.account,
        _phone: data.phone ?? null,
        _meta: {},
        _provider_reference: null,
      },
    );
    if (error) {
      console.error("[Wallet] create deposit transaction failed", error);
      throw new Error(`Could not create deposit transaction: ${error.message ?? String(error)}`);
    }

    if (data.method === "mpesa" && data.account === "real") {
      try {
        return await startDarajaStkPush(tx, data.phone);
      } catch (e) {
        console.error("[Daraja] STK push failed", e);
        try {
          await markTransactionFailed(tx.id, e);
        } catch (markError) {
          console.error("[Daraja] Could not mark failed transaction", markError);
        }
        throw e;
      }
    }

    return { ok: true, transaction: tx };
  });

export const createWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MoneyInput.parse(d))
  .handler(async ({ data, context }) => {
    const currency = data.method === "mpesa" ? "KSH" : "USD";
    const { data: tx, error } = await (context.supabase as unknown as RpcClient).rpc(
      "create_transaction",
      {
        _kind: "withdraw",
        _method: data.method,
        _amount: data.amount,
        _currency: currency,
        _account: data.account,
        _phone: data.phone ?? null,
        _meta: {},
        _provider_reference: null,
      },
    );
    if (error) {
      console.error("[Wallet] create withdrawal transaction failed", error);
      throw new Error(`Could not create withdrawal transaction: ${error.message ?? String(error)}`);
    }

    if (data.method === "mpesa" && data.account === "real") {
      return startDarajaB2C(tx, data.phone);
    }

    return { ok: true, transaction: tx };
  });

async function startDarajaStkPush(transaction: WalletTransaction, phone?: string) {
  const msisdn = normalizeKenyanPhone(phone);
  const env = getDarajaEnv("stk");
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
  const password = Buffer.from(`${env.stkShortcode}${env.stkPasskey}${timestamp}`).toString(
    "base64",
  );
  const body = {
    BusinessShortCode: env.stkShortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(Number(transaction.amount)),
    PartyA: msisdn,
    PartyB: env.stkShortcode,
    PhoneNumber: msisdn,
    CallBackURL: env.stkCallbackUrl,
    AccountReference: `TRONIX-${transaction.id.slice(0, 8)}`,
    TransactionDesc: "TRONIXOPTION deposit",
  };

  const response = await darajaFetch("/mpesa/stkpush/v1/processrequest", body, "stk");
  if (response.ResponseCode && response.ResponseCode !== "0") {
    console.error("[Daraja] STK rejected", response);
    throw new Error(
      response.ResponseDescription ?? response.errorMessage ?? "Daraja rejected STK push",
    );
  }
  await recordPaymentRequest(transaction.id, "stk_push", msisdn, body, response);
  return { ok: true, transaction, daraja: response };
}

async function startDarajaB2C(transaction: WalletTransaction, phone?: string) {
  const msisdn = normalizeKenyanPhone(phone);
  const env = getDarajaEnv("b2c");
  const body = {
    InitiatorName: env.b2cInitiatorName,
    SecurityCredential: env.b2cSecurityCredential,
    CommandID: "BusinessPayment",
    Amount: Math.round(Number(transaction.amount)),
    PartyA: env.b2cShortcode,
    PartyB: msisdn,
    Remarks: "TRONIXOPTION withdrawal",
    QueueTimeOutURL: env.b2cTimeoutUrl,
    ResultURL: env.b2cResultUrl,
    Occasion: `TRONIX-${transaction.id.slice(0, 8)}`,
  };

  const response = await darajaFetch("/mpesa/b2c/v1/paymentrequest", body, "b2c");
  await recordPaymentRequest(transaction.id, "b2c", msisdn, body, response);
  return { ok: true, transaction, daraja: response };
}

async function darajaFetch(path: string, body: Record<string, unknown>, mode: "stk" | "b2c") {
  const env = getDarajaEnv(mode);
  const token = await getDarajaToken(mode);
  const res = await fetch(`${env.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[Daraja] HTTP request failed", {
      mode,
      path,
      status: res.status,
      response: json,
    });
    throw new Error(
      `Daraja ${mode.toUpperCase()} request failed (${res.status}): ${
        json.errorMessage ??
        json.error_description ??
        json.ResponseDescription ??
        "No response message"
      }`,
    );
  }
  return json;
}

async function getDarajaToken(mode: "stk" | "b2c") {
  const env = getDarajaEnv(mode);
  const credentials = Buffer.from(`${env.consumerKey}:${env.consumerSecret}`).toString("base64");
  const res = await fetch(`${env.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    console.error("[Daraja] Token request failed", { mode, status: res.status, response: json });
    throw new Error(
      `Could not authenticate with Daraja ${mode.toUpperCase()} (${res.status}): ${
        json.errorMessage ?? json.error_description ?? "No access token returned"
      }`,
    );
  }
  return json.access_token as string;
}

async function recordPaymentRequest(
  transactionId: string,
  requestType: "stk_push" | "b2c",
  phone: string,
  requestPayload: Record<string, unknown>,
  responsePayload: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("payment_requests").insert({
    transaction_id: transactionId,
    request_type: requestType,
    phone,
    checkout_request_id: responsePayload.CheckoutRequestID ?? null,
    conversation_id: responsePayload.ConversationID ?? null,
    originator_conversation_id: responsePayload.OriginatorConversationID ?? null,
    status: "pending",
    request_payload: requestPayload,
    response_payload: responsePayload,
  } as Record<string, unknown>);
}

async function markTransactionFailed(transactionId: string, error: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as unknown as RpcClient).rpc("apply_transaction", {
    _transaction_id: transactionId,
    _status: "failed",
    _meta: {
      provider_error: error instanceof Error ? error.message : String(error),
      failed_at: new Date().toISOString(),
    },
  });
}

function normalizeKenyanPhone(phone?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  throw new Error("Enter a valid Kenyan Safaricom number");
}

function getDarajaEnv(mode: "stk" | "b2c") {
  const baseUrl = process.env.DARAJA_BASE_URL ?? "https://api.safaricom.co.ke";
  const appUrl = getPublicAppUrl();
  const shared = {
    consumerKey: process.env.DARAJA_CONSUMER_KEY,
    consumerSecret: process.env.DARAJA_CONSUMER_SECRET,
  };
  const stk = {
    stkShortcode: process.env.DARAJA_STK_SHORTCODE,
    stkPasskey: process.env.DARAJA_STK_PASSKEY,
    stkCallbackUrl: process.env.DARAJA_STK_CALLBACK_URL ?? `${appUrl}/api/daraja/stk-callback`,
  };
  const b2c = {
    b2cInitiatorName: process.env.DARAJA_B2C_INITIATOR_NAME,
    b2cSecurityCredential: process.env.DARAJA_B2C_SECURITY_CREDENTIAL,
    b2cShortcode: process.env.DARAJA_B2C_SHORTCODE,
    b2cResultUrl: process.env.DARAJA_B2C_RESULT_URL ?? `${appUrl}/api/daraja/b2c-result`,
    b2cTimeoutUrl: process.env.DARAJA_B2C_TIMEOUT_URL ?? `${appUrl}/api/daraja/b2c-timeout`,
  };
  const required = mode === "stk" ? { ...shared, ...stk } : { ...shared, ...b2c };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    console.error("[Daraja] Missing environment variables", { mode, missing });
    throw new Error(
      `Missing Daraja environment variable(s): ${missing.join(", ")}. Set them in Vercel and your local .env file.`,
    );
  }
  return { baseUrl, ...(required as Record<string, string>) };
}

function getPublicAppUrl() {
  const explicit =
    process.env.DARAJA_PUBLIC_BASE_URL ?? process.env.PUBLIC_APP_URL ?? process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  console.error("[Daraja] Missing public app URL", {
    hasDarajaPublicBaseUrl: Boolean(process.env.DARAJA_PUBLIC_BASE_URL),
    hasPublicAppUrl: Boolean(process.env.PUBLIC_APP_URL),
    hasAppUrl: Boolean(process.env.APP_URL),
    hasVercelUrl: Boolean(process.env.VERCEL_URL),
  });
  throw new Error(
    "Missing public app URL for Daraja callbacks. Set DARAJA_PUBLIC_BASE_URL or APP_URL.",
  );
}
