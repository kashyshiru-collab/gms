// Server-only Payhero helpers. Never import from a client/route file.

const BASE = "https://backend.payhero.co.ke/api/v2";

function authHeader() {
  const direct = process.env.PAYHERO_AUTH_TOKEN;
  if (direct) {
    return direct.startsWith("Basic ") ? direct : `Basic ${direct}`;
  }
  const username = process.env.PAYHERO_USERNAME;
  const password = process.env.PAYHERO_PASSWORD || process.env.PAYHERO_PASWORD;
  if (!username || !password) throw new Error("Payhero credentials not configured");
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

export function normalizeKenyanPhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("0")) return "254" + digits.slice(1);
  if (digits.startsWith("7") || digits.startsWith("1")) return "254" + digits;
  return digits;
}

export async function stkPush(params: {
  amount: number;
  phone: string;
  reference: string;
  callbackUrl: string;
  customerName?: string;
}) {
  const channelId = process.env.PAYHERO_CHANNEL_ID;
  if (!channelId) throw new Error("PAYHERO_CHANNEL_ID missing");
  const body = {
    amount: Math.round(params.amount),
    phone_number: normalizeKenyanPhone(params.phone),
    channel_id: Number(channelId),
    provider: "m-pesa",
    external_reference: params.reference,
    callback_url: params.callbackUrl,
    customer_name: params.customerName ?? "Trader",
  };
  const res = await fetch(`${BASE}/payments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader(),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  if (!res.ok) {
    throw new Error(`Payhero STK failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return json;
}

export async function getServiceWalletBalance() {
  const candidates = [
    `${BASE}/wallet/payment_service?wallet_type=service_wallet`,
    `${BASE}/wallets?wallet_type=service_wallet`,
    `${BASE}/wallet/balance?wallet_type=service_wallet`,
    `${BASE}/wallet?wallet_type=service_wallet`,
  ];
  let lastErr = "";
  for (const url of candidates) {
    const res = await fetch(url, { headers: { Authorization: authHeader() } });
    const text = await res.text();
    if (res.ok) {
      try { return JSON.parse(text); } catch { return { raw: text }; }
    }
    lastErr = `(${res.status}) ${text.slice(0, 160)}`;
    if (res.status !== 404) break;
  }
  throw new Error(`Payhero wallet fetch failed ${lastErr}`);
}

export async function withdrawToMobile(params: {
  amount: number;
  phone: string;
  externalReference: string;
}) {
  const channelId = process.env.PAYHERO_CHANNEL_ID;
  if (!channelId) throw new Error("PAYHERO_CHANNEL_ID missing");
  const body = {
    amount: Math.round(params.amount),
    phone_number: normalizeKenyanPhone(params.phone),
    network_code: "63902",
    external_reference: params.externalReference,
    payment_service: "b2c",
    channel: "mobile",
    channel_id: Number(channelId),
    callback_url: publicAppUrl() + "/api/public/payhero/withdraw-callback",
  };
  const res = await fetch(`${BASE}/withdraw`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader() },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Payhero withdraw failed (${res.status}): ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export async function getTransactionStatus(reference: string) {
  const url = `${BASE}/transaction-status?reference=${encodeURIComponent(reference)}`;
  const res = await fetch(url, { headers: { Authorization: authHeader() } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Payhero status failed (${res.status}): ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

export function publicAppUrl(): string {
  const explicitUrl = process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL;
  if (explicitUrl) return explicitUrl.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;

  throw new Error("PUBLIC_APP_URL missing");
}
