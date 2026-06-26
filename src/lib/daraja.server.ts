// Server-only Daraja helpers. Never import from a client component.
import { createHash } from "node:crypto";

const SANDBOX_BASE = "https://sandbox.safaricom.co.ke";
const PRODUCTION_BASE = "https://api.safaricom.co.ke";

type DarajaAccessToken = {
  token: string;
  expiresIn: string | null;
  fingerprint: string;
};

type DarajaJsonValue = string | number | boolean | null | DarajaJson | DarajaJsonValue[];
type DarajaJson = { [key: string]: DarajaJsonValue | undefined };

function baseUrl() {
  const explicit = process.env.DARAJA_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  return process.env.DARAJA_ENV?.trim().toLowerCase() === "sandbox"
    ? SANDBOX_BASE
    : PRODUCTION_BASE;
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} missing`);
  return value;
}

function darajaEnvLabel() {
  return baseUrl() === PRODUCTION_BASE ? "production" : "sandbox";
}

function maskValue(value: string) {
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function darajaConfigLabel() {
  const consumerKey = process.env.DARAJA_CONSUMER_KEY?.trim() || "";
  const b2cShortCode = process.env.DARAJA_B2C_SHORTCODE?.trim() || "";
  const initiator = process.env.DARAJA_B2C_INITIATOR_NAME?.trim() || "";
  const commandId = process.env.DARAJA_B2C_COMMAND_ID?.trim() || "BusinessPayment";
  return `endpoint=${b2cPaymentUrl()}, consumerKey=${maskValue(consumerKey)}, b2cShortCode=${b2cShortCode || "missing"}, initiator=${initiator || "missing"}, command=${commandId}`;
}

function fingerprintToken(token: string) {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

function tokenLabel(auth: DarajaAccessToken) {
  return `oauthTokenLength=${auth.token.length}, oauthTokenHash=${auth.fingerprint}, oauthExpiresIn=${auth.expiresIn ?? "missing"}, authHeader=Bearer <redacted>`;
}

function bearerAuthHeader(auth: DarajaAccessToken) {
  if (!auth.token) throw new Error("Daraja OAuth returned an empty access token");
  if (/\s/.test(auth.token)) throw new Error("Daraja OAuth returned an invalid access token");
  return `Bearer ${auth.token}`;
}

function debugDaraja(label: string, auth: DarajaAccessToken, extra: Record<string, unknown> = {}) {
  if (process.env.DARAJA_DEBUG?.trim().toLowerCase() !== "true") return;
  console.info(`[daraja:${label}]`, {
    env: darajaEnvLabel(),
    baseUrl: baseUrl(),
    tokenLength: auth.token.length,
    tokenHash: auth.fingerprint,
    expiresIn: auth.expiresIn,
    authHeader: "Bearer <redacted>",
    ...extra,
  });
}

function debugDarajaOAuth(json: Record<string, unknown>, auth: DarajaAccessToken) {
  if (process.env.DARAJA_DEBUG?.trim().toLowerCase() !== "true") return;
  console.info("[daraja:oauth]", {
    env: darajaEnvLabel(),
    baseUrl: baseUrl(),
    responseKeys: Object.keys(json),
    accessTokenLength: auth.token.length,
    accessTokenHash: auth.fingerprint,
    expiresIn: auth.expiresIn,
  });
}

function parseDarajaJson(text: string): DarajaJson {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function darajaString(json: DarajaJson, key: string) {
  const value = json[key];
  return value == null ? null : String(value);
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

function darajaPhone(input: string): string {
  const phone = normalizeKenyanPhone(input);
  if (!/^254(?:7|1)\d{8}$/.test(phone)) {
    throw new Error("Valid Kenyan M-Pesa phone required");
  }
  return phone;
}

export function usdToDarajaKes(amountUsd: number) {
  const rate = Number(process.env.USD_TO_KES_RATE || "130");
  if (!Number.isFinite(rate) || rate <= 0)
    throw new Error("USD_TO_KES_RATE must be a positive number");
  return Math.max(1, Math.round(amountUsd * rate));
}

function usdToB2cKes(amountUsd: number) {
  const amountKes = usdToDarajaKes(amountUsd);
  if (amountKes < 10) throw new Error("Minimum Daraja B2C withdrawal is KES 10");
  if (amountKes > 250000) throw new Error("Maximum Daraja B2C withdrawal is KES 250,000");
  return amountKes;
}

function b2cPaymentUrl() {
  const version = process.env.DARAJA_B2C_API_VERSION?.trim() || "v3";
  return `${baseUrl()}/mpesa/b2c/${version}/paymentrequest`;
}

function originatorConversationId(reference: string) {
  return createHash("sha256").update(reference).digest("hex").slice(0, 20);
}

async function accessToken(): Promise<DarajaAccessToken> {
  const consumerKey = requiredEnv("DARAJA_CONSUMER_KEY");
  const consumerSecret = requiredEnv("DARAJA_CONSUMER_SECRET");
  const token = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");
  const url = `${baseUrl()}/oauth/v1/generate?grant_type=client_credentials`;

  const res = await fetch(url, {
    headers: { Authorization: `Basic ${token}` },
  });
  const text = await res.text();

  const json = parseDarajaJson(text);
  const accessToken = darajaString(json, "access_token")?.trim();
  if (!res.ok || !accessToken) {
    throw new Error(
      `Daraja OAuth failed on ${darajaEnvLabel()} (${res.status}): ${text.slice(0, 300)}`,
    );
  }
  const auth = {
    token: accessToken,
    expiresIn: darajaString(json, "expires_in"),
    fingerprint: fingerprintToken(accessToken),
  };
  debugDarajaOAuth(json, auth);
  return auth;
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
  const auth = await accessToken();
  debugDaraja("stk", auth, { reference: params.reference });
  const shortCode = requiredEnv("DARAJA_STK_SHORTCODE");
  const passkey = requiredEnv("DARAJA_STK_PASSKEY");
  const ts = timestamp();
  const body = {
    BusinessShortCode: shortCode,
    Password: stkPassword(shortCode, passkey, ts),
    Timestamp: ts,
    TransactionType: process.env.DARAJA_STK_TRANSACTION_TYPE?.trim() || "CustomerPayBillOnline",
    Amount: usdToDarajaKes(params.amountUsd),
    PartyA: darajaPhone(params.phone),
    PartyB: process.env.DARAJA_STK_PARTY_B?.trim() || shortCode,
    PhoneNumber: darajaPhone(params.phone),
    CallBackURL: params.callbackUrl,
    AccountReference: params.reference.slice(0, 12),
    TransactionDesc: (params.description || "TronixOption").slice(0, 13),
  };
  const res = await fetch(`${baseUrl()}/mpesa/stkpush/v1/processrequest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: bearerAuthHeader(auth) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = parseDarajaJson(text);
  const responseCode = darajaString(json, "ResponseCode");
  if (!res.ok || (responseCode && responseCode !== "0")) {
    throw new Error(
      `Daraja STK failed on ${darajaEnvLabel()} (${res.status}; ${tokenLabel(auth)}): ${text.slice(0, 300)}`,
    );
  }
  return json;
}

export async function queryStkStatus(checkoutRequestId: string) {
  const auth = await accessToken();
  debugDaraja("stk-query", auth, { checkoutRequestId });
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
    headers: { "Content-Type": "application/json", Authorization: bearerAuthHeader(auth) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = parseDarajaJson(text);
  if (!res.ok) {
    throw new Error(
      `Daraja STK query failed (${res.status}; ${tokenLabel(auth)}): ${text.slice(0, 300)}`,
    );
  }
  return json;
}

export async function withdrawToMobile(params: {
  amountUsd: number;
  phone: string;
  externalReference: string;
}) {
  const auth = await accessToken();
  const originatorId = originatorConversationId(params.externalReference);
  debugDaraja("b2c", auth, {
    externalReference: params.externalReference,
    originatorConversationId: originatorId,
  });
  const body = {
    OriginatorConversationID: originatorId,
    InitiatorName: requiredEnv("DARAJA_B2C_INITIATOR_NAME"),
    SecurityCredential: requiredEnv("DARAJA_B2C_SECURITY_CREDENTIAL"),
    CommandID: process.env.DARAJA_B2C_COMMAND_ID?.trim() || "BusinessPayment",
    Amount: usdToB2cKes(params.amountUsd),
    PartyA: requiredEnv("DARAJA_B2C_SHORTCODE"),
    PartyB: darajaPhone(params.phone),
    Remarks: "TronixOption withdrawal",
    QueueTimeOutURL: `${publicAppUrl()}/api/public/daraja/withdraw-callback`,
    ResultURL: `${publicAppUrl()}/api/public/daraja/withdraw-callback`,
    Occassion: params.externalReference.slice(0, 100),
  };
  const res = await fetch(b2cPaymentUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: bearerAuthHeader(auth) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = parseDarajaJson(text);
  const responseCode = darajaString(json, "ResponseCode");
  if (!res.ok || (responseCode && responseCode !== "0")) {
    throw new Error(
      `Daraja B2C failed on ${darajaEnvLabel()} (${res.status}; ${darajaConfigLabel()}; ${tokenLabel(auth)}): ${text.slice(0, 300)}`,
    );
  }
  return { ...json, OriginatorConversationID: originatorId };
}
