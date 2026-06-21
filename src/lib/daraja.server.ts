// Server-only Daraja helpers. Never import from a client component.

const SANDBOX_BASE = "https://sandbox.safaricom.co.ke";
const PRODUCTION_BASE = "https://api.safaricom.co.ke";

function baseUrl() {
  return process.env.DARAJA_BASE_URL || (process.env.DARAJA_ENV === "production" ? PRODUCTION_BASE : SANDBOX_BASE);
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing`);
  return value;
}

export function publicAppUrl(): string {
  const explicitUrl = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL;
  if (explicitUrl) return explicitUrl.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  throw new Error("PUBLIC_APP_URL missing");
}

export function normalizeKenyanPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}

export function usdToDarajaKes(amountUsd: number) {
  const rate = Number(process.env.USD_TO_KES_RATE || "130");
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("USD_TO_KES_RATE must be a positive number");
  return Math.max(1, Math.round(amountUsd * rate));
}

async function accessToken() {
  const token = Buffer.from(
    `${requiredEnv("DARAJA_CONSUMER_KEY")}:${requiredEnv("DARAJA_CONSUMER_SECRET")}`,
  ).toString("base64");
  const res = await fetch(`${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${token}` },
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok || !json.access_token) {
    throw new Error(`Daraja OAuth failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return String(json.access_token);
}

function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function stkPassword(shortCode: string, passkey: string, ts: string) {
  return Buffer.from(`${shortCode}${passkey}${ts}`).toString("base64");
}

export async function stkPush(params: {
  amountUsd: number;
  phone: string;
  reference: string;
  callbackUrl: string;
  description?: string;
}) {
  const token = await accessToken();
  const shortCode = requiredEnv("DARAJA_STK_SHORTCODE");
  const passkey = requiredEnv("DARAJA_STK_PASSKEY");
  const ts = timestamp();
  const body = {
    BusinessShortCode: shortCode,
    Password: stkPassword(shortCode, passkey, ts),
    Timestamp: ts,
    TransactionType: process.env.DARAJA_STK_TRANSACTION_TYPE || "CustomerPayBillOnline",
    Amount: usdToDarajaKes(params.amountUsd),
    PartyA: normalizeKenyanPhone(params.phone),
    PartyB: process.env.DARAJA_STK_PARTY_B || shortCode,
    PhoneNumber: normalizeKenyanPhone(params.phone),
    CallBackURL: params.callbackUrl,
    AccountReference: params.reference.slice(0, 12),
    TransactionDesc: (params.description || "TronixOption").slice(0, 13),
  };
  const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok || (json.ResponseCode && json.ResponseCode !== "0")) {
    throw new Error(`Daraja STK failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return json;
}

export async function queryStkStatus(checkoutRequestId: string) {
  const token = await accessToken();
  const shortCode = requiredEnv("DARAJA_STK_SHORTCODE");
  const passkey = requiredEnv("DARAJA_STK_PASSKEY");
  const ts = timestamp();
  const body = {
    BusinessShortCode: shortCode,
    Password: stkPassword(shortCode, passkey, ts),
    Timestamp: ts,
    CheckoutRequestID: checkoutRequestId,
  };
  const res = await fetch(`${baseUrl()}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok) throw new Error(`Daraja STK query failed (${res.status}): ${text.slice(0, 300)}`);
  return json;
}

export async function withdrawToMobile(params: {
  amountUsd: number;
  phone: string;
  externalReference: string;
}) {
  const token = await accessToken();
  const body = {
    OriginatorConversationID: params.externalReference,
    InitiatorName: requiredEnv("DARAJA_B2C_INITIATOR_NAME"),
    SecurityCredential: requiredEnv("DARAJA_B2C_SECURITY_CREDENTIAL"),
    CommandID: process.env.DARAJA_B2C_COMMAND_ID || "BusinessPayment",
    Amount: usdToDarajaKes(params.amountUsd),
    PartyA: requiredEnv("DARAJA_B2C_SHORTCODE"),
    PartyB: normalizeKenyanPhone(params.phone),
    Remarks: "TronixOption withdrawal",
    QueueTimeOutURL: `${publicAppUrl()}/api/public/daraja/withdraw-callback`,
    ResultURL: `${publicAppUrl()}/api/public/daraja/withdraw-callback`,
    Occasion: params.externalReference.slice(0, 100),
  };
  const res = await fetch(`${baseUrl()}/mpesa/b2c/v1/paymentrequest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {}
  if (!res.ok || (json.ResponseCode && json.ResponseCode !== "0")) {
    throw new Error(`Daraja B2C failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return json;
}
