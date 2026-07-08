import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
<<<<<<< HEAD
import type { Json } from "@/integrations/supabase/types";
import { z } from "zod";
import { MIN_DEPOSIT_USD } from "./money";
import { ACTIVE_BROKER, MAX_TRADE_STAKE_USD } from "./risk";

type JsonObject = { [key: string]: Json | undefined };

async function getSpotForPair(symbol: string): Promise<number> {
  const { getPriceAt } = await import("./pricing.server");
  return getPriceAt(symbol, Date.now());
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [walletRes, posRes, txRes] = await Promise.all([
      supabase.from("wallets").select("balance_kes").eq("user_id", userId).maybeSingle(),
      supabase
        .from("positions")
        .select("*")
        .eq("user_id", userId)
        .order("opened_at", { ascending: false })
        .limit(50),
      supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    return {
      balance: Number(walletRes.data?.balance_kes ?? 0),
      positions: posRes.data ?? [],
      transactions: txRes.data ?? [],
    };
  });

export const initiateDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        amount: z.number().min(MIN_DEPOSIT_USD).max(150000),
        phone: z.string().min(9).max(15),
        broker: z.enum([ACTIVE_BROKER, "DCASH", "FX_TRADER"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.broker && data.broker !== ACTIVE_BROKER) {
      throw new Error("Selected broker is currently unavailable.");
    }
    const { getProfileFlags } = await import("./compliance.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const flags = await getProfileFlags(supabaseAdmin, userId);
    if (flags.is_burned) throw new Error("Account disabled. Please contact support.");

    const reference = `dep_${userId.slice(0, 8)}_${Date.now()}`;

    const { error: insErr } = await supabase.from("transactions").insert({
      user_id: userId,
      type: "deposit",
      amount_kes: data.amount,
      status: "pending",
      reference,
      meta: { phone: data.phone, broker: ACTIVE_BROKER },
    });
    if (insErr) throw new Error(insErr.message);

    const { stkPush, publicAppUrl, usdToDarajaKes } = await import("./daraja.server");
    const callbackUrl = `${publicAppUrl()}/api/public/daraja/callback`;

    try {
      const resp = await stkPush({
        amountUsd: data.amount,
        phone: data.phone,
        reference,
        callbackUrl,
      });
      const rawDarajaRef = resp.CheckoutRequestID ?? resp.MerchantRequestID;
      const darajaRef = rawDarajaRef == null ? null : String(rawDarajaRef);
      if (darajaRef) {
        await supabase
          .from("transactions")
          .update({
            daraja_reference: darajaRef,
            meta: {
              phone: data.phone,
              broker: ACTIVE_BROKER,
              provider: "daraja",
              provider_amount_kes: usdToDarajaKes(data.amount),
              provider_response: resp as JsonObject,
            },
          })
          .eq("reference", reference);
      }
      return { ok: true, reference, message: "STK push sent. Check your phone." };
    } catch (e) {
      await supabase
        .from("transactions")
        .update({ status: "failed", meta: { error: (e as Error).message } })
        .eq("reference", reference);
      throw e;
    }
  });

export const openPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        symbol: z.string().min(3).max(10),
        side: z.enum(["buy", "sell"]),
        stake: z.number().positive().max(MAX_TRADE_STAKE_USD),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const spot = await getSpotForPair(data.symbol);
    const { data: pos, error } = await supabase.rpc("open_position_atomic", {
      p_pair: data.symbol,
      p_side: data.side,
      p_stake: data.stake,
      p_entry: spot,
    });
    if (error) throw new Error(error.message);
    return { ok: true, position: pos };
  });

export const closePosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ positionId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: posRow, error: readErr } = await supabase
      .from("positions")
      .select("pair, status, entry_price, side, stake_kes")
      .eq("id", data.positionId)
      .maybeSingle();
    if (readErr || !posRow) throw new Error("Position not found");
    if (posRow.status === "closed") throw new Error("Already closed");

    let exit = await getSpotForPair(posRow.pair);

    // Force-loss: fabricate an exit that makes this position lose.
    const { getProfileFlags } = await import("./compliance.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const flags = await getProfileFlags(supabaseAdmin, userId);
    if (flags.force_loss) {
      const entry = Number(posRow.entry_price);
      exit = posRow.side === "buy" ? entry * 0.98 : entry * 1.02;
    }

    const { data: closed, error: rpcErr } = await supabase.rpc("close_position_atomic", {
      p_position_id: data.positionId,
      p_exit: exit,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const closedRow = closed as { pnl_kes?: number | string | null } | null;
    return { ok: true, pnl: Number(closedRow?.pnl_kes ?? 0), exit };
  });

export const getMyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("warnings_count, is_burned, force_loss, full_name, email, phone, referral_code")
      .eq("id", userId)
      .maybeSingle();
    const { tradeGateInfo } = await import("./compliance.server");
    const gate = await tradeGateInfo(supabase, userId);
    return {
      profile: prof ?? null,
      warnings_count: Number(prof?.warnings_count ?? 0),
      is_burned: Boolean(prof?.is_burned ?? false),
      trades_since_last_deposit: gate.trades,
      has_prior_deposit: gate.hasPriorDeposit,
      trade_gate_ok: gate.ok,
    };
  });

export const reconcilePendingDeposits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: pendings } = await supabase
      .from("transactions")
      .select("id, reference, daraja_reference, amount_kes, meta, created_at")
      .eq("user_id", userId)
      .eq("type", "deposit")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);

    if (!pendings || pendings.length === 0) return { checked: 0, credited: 0, failed: 0 };

    const { queryStkStatus } = await import("./daraja.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let credited = 0,
      failed = 0;
    for (const tx of pendings) {
      const lookup = tx.daraja_reference || tx.reference;
      if (!lookup) continue;
      try {
        const r = (await queryStkStatus(lookup)) as JsonObject;
        const resultCode = String(r?.ResultCode ?? "");
        if (resultCode === "0") {
          const credit = Number(tx.amount_kes);
          const receipt = r.MpesaReceiptNumber == null ? null : String(r.MpesaReceiptNumber);
          const { data: w } = await supabaseAdmin
            .from("wallets")
            .select("balance_kes")
            .eq("user_id", userId)
            .maybeSingle();
          const newBal = Number(w?.balance_kes ?? 0) + credit;
          await supabaseAdmin
            .from("wallets")
            .update({ balance_kes: newBal, updated_at: new Date().toISOString() })
            .eq("user_id", userId);
          const prevMeta = (tx.meta && typeof tx.meta === "object" ? tx.meta : {}) as Record<
            string,
            unknown
          >;
          await supabaseAdmin
            .from("transactions")
            .update({
              status: "success",
              mpesa_receipt: receipt,
              meta: { ...prevMeta, reconcile: r },
            })
            .eq("id", tx.id);
          credited++;
        } else if (resultCode && resultCode !== "1032") {
          const prevMeta = (tx.meta && typeof tx.meta === "object" ? tx.meta : {}) as Record<
            string,
            unknown
          >;
          await supabaseAdmin
            .from("transactions")
            .update({
              status: "failed",
              meta: { ...prevMeta, reconcile: r },
            })
            .eq("id", tx.id);
          failed++;
        }
        // QUEUED → leave as pending
      } catch {
        // ignore single-tx errors, continue
      }
    }
    return { checked: pendings.length, credited, failed };
  });
=======
import { z } from "zod";

const USD_TO_KSH = 130;
const MIN_DEPOSIT_USD = 3;
const MIN_WITHDRAW_USD = 1;
const MIN_DEPOSIT_KSH = MIN_DEPOSIT_USD * USD_TO_KSH;
const MIN_WITHDRAW_KSH = MIN_WITHDRAW_USD * USD_TO_KSH;

const MoneyInput = z.object({
  method: z.enum(["mpesa", "crypto"]),
  amount: z.number().positive().max(10_000_000),
  account: z.enum(["real", "demo"]),
  phone: z.string().optional(),
});

type TransactionKind = "deposit" | "withdraw";
type PaymentRequestType = "stk_push" | "b2c";

type WalletTransaction = {
  id: string;
  user_id: string;
  kind: TransactionKind;
  method: "mpesa" | "crypto";
  amount: number | string;
  currency: "KSH" | "USD";
  amount_usd: number | string;
  account_type: "real" | "demo";
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  meta?: Record<string, unknown> | null;
};

type DarajaMode = "stk" | "b2c";
type DarajaStep = "oauth_token" | "stk_push" | "b2c_payment";

export const createDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MoneyInput.parse(d))
  .handler(async ({ data, context }) => {
    const phone = data.method === "mpesa" ? await getProfilePhone(context.userId) : data.phone;
    validateMoney("deposit", data.method, data.amount, phone);

    const tx = await createWalletTransaction({
      userId: context.userId,
      kind: "deposit",
      method: data.method,
      amount: data.amount,
      account: data.account,
      phone,
    });

    if (data.method === "mpesa" && data.account === "real") {
      try {
        const daraja = await sendStkPush(tx, phone);
        return { ok: true, transaction: tx, daraja };
      } catch (error) {
        await markTransaction(tx.id, "failed", { provider_error: getErrorMessage(error) });
        throw error;
      }
    }

    return { ok: true, transaction: tx };
  });

export const createWithdrawal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => MoneyInput.parse(d))
  .handler(async ({ data, context }) => {
    if (data.account === "demo") {
      throw new Error("Demo funds cannot be withdrawn. Switch to your real account to withdraw.");
    }

    const phone = data.method === "mpesa" ? await getProfilePhone(context.userId) : data.phone;
    validateMoney("withdraw", data.method, data.amount, phone);

    const tx = await createWalletTransaction({
      userId: context.userId,
      kind: "withdraw",
      method: data.method,
      amount: data.amount,
      account: data.account,
      phone,
    });

    if (data.method === "mpesa" && data.account === "real") {
      try {
        const daraja = await sendB2cPayment(tx, phone);
        return { ok: true, transaction: tx, daraja };
      } catch (error) {
        await markTransaction(tx.id, "failed", { provider_error: getErrorMessage(error) });
        throw error;
      }
    }

    return { ok: true, transaction: tx };
  });

export const syncPendingMpesaDeposits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: requests, error } = await supabaseAdmin
      .from("payment_requests")
      .select("id, transaction_id, checkout_request_id, transactions!inner(id,user_id,kind,status)")
      .eq("request_type", "stk_push")
      .in("status", ["pending", "processing"])
      .eq("transactions.user_id", context.userId)
      .eq("transactions.kind", "deposit")
      .in("transactions.status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error(error.message);

    const synced: Array<{ transaction_id: string; status: string }> = [];
    for (const request of requests ?? []) {
      const checkoutRequestId = getStringValue(request.checkout_request_id);
      if (!checkoutRequestId) continue;

      const result = await queryStkStatus(checkoutRequestId);
      const resultCode = Number(result.ResultCode ?? result.ResponseCode ?? -1);
      const resultDescription =
        getStringValue(result.ResultDesc) ??
        getStringValue(result.ResponseDescription) ??
        "STK query response";

      if (resultCode === 0) {
        await markTransaction(request.transaction_id, "completed", {
          daraja_result_code: resultCode,
          daraja_result_description: resultDescription,
          synced_by: "stk_query",
          callback_at: new Date().toISOString(),
        });
        await supabaseAdmin
          .from("payment_requests")
          .update({ status: "completed", response_payload: result } as Record<string, unknown>)
          .eq("id", request.id);
        synced.push({ transaction_id: request.transaction_id, status: "completed" });
      } else if ([1, 1032, 1037, 2001].includes(resultCode)) {
        await markTransaction(request.transaction_id, "failed", {
          daraja_result_code: resultCode,
          daraja_result_description: resultDescription,
          synced_by: "stk_query",
          callback_at: new Date().toISOString(),
        });
        await supabaseAdmin
          .from("payment_requests")
          .update({ status: "failed", response_payload: result } as Record<string, unknown>)
          .eq("id", request.id);
        synced.push({ transaction_id: request.transaction_id, status: "failed" });
      }
    }

    return { ok: true, synced };
  });

async function createWalletTransaction(input: {
  userId: string;
  kind: TransactionKind;
  method: "mpesa" | "crypto";
  amount: number;
  account: "real" | "demo";
  phone?: string;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (input.kind === "withdraw" && input.account === "demo") {
    throw new Error("Demo funds cannot be withdrawn. Switch to your real account to withdraw.");
  }

  const currency = input.method === "mpesa" ? "KSH" : "USD";
  const amountUsd = toUsd(input.amount, currency);
  const isVirtual = input.account === "demo";
  const providerPending = input.method === "mpesa" && input.account === "real";
  const status = providerPending ? "pending" : "completed";

  if (input.kind === "withdraw") {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("balance_usd, demo_balance_usd")
      .eq("id", input.userId)
      .single();
    if (error || !profile) throw new Error("Profile not found");

    const balance =
      input.account === "real"
        ? Number(profile.balance_usd ?? 0)
        : Number(profile.demo_balance_usd ?? 0);
    if (balance < amountUsd) throw new Error("Insufficient balance");

    await adjustBalance(input.userId, input.account, -amountUsd, currency, 0);
  }

  const { data: tx, error } = await supabaseAdmin
    .from("transactions")
    .insert({
      user_id: input.userId,
      kind: input.kind,
      method: input.method,
      account_type: input.account,
      amount: input.amount,
      currency,
      amount_usd: amountUsd,
      status,
      is_virtual: isVirtual,
      meta: {
        phone: input.method === "mpesa" ? normalizeKenyanPhone(input.phone) : null,
        usd_to_ksh: USD_TO_KSH,
      },
    } as Record<string, unknown>)
    .select("*")
    .single();
  if (error || !tx) throw new Error(error?.message ?? "Could not create transaction");

  if (input.kind === "deposit" && status === "completed") {
    await adjustBalance(
      input.userId,
      input.account,
      amountUsd,
      currency,
      currency === "KSH" ? input.amount : 0,
    );
  }

  return tx as WalletTransaction;
}

async function sendStkPush(transaction: WalletTransaction, phone?: string) {
  const msisdn = normalizeKenyanPhone(phone);
  const env = getDarajaEnv("stk");
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${env.stkShortcode}${env.stkPasskey}${timestamp}`).toString(
    "base64",
  );
  const payload = {
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

  const response = await darajaRequest("/mpesa/stkpush/v1/processrequest", payload, "stk");
  if (response.ResponseCode && response.ResponseCode !== "0") {
    throw new Error(response.ResponseDescription ?? response.errorMessage ?? "STK push rejected");
  }

  await recordPaymentRequest(transaction.id, "stk_push", msisdn, payload, response);
  return response;
}

async function queryStkStatus(checkoutRequestId: string) {
  const env = getDarajaEnv("stk");
  const token = await getDarajaToken("stk");
  const timestamp = darajaTimestamp();
  const password = Buffer.from(`${env.stkShortcode}${env.stkPasskey}${timestamp}`).toString(
    "base64",
  );
  const payload = {
    BusinessShortCode: env.stkShortcode,
    Password: password,
    Timestamp: timestamp,
    CheckoutRequestID: checkoutRequestId,
  };

  const res = await fetch(`${env.baseUrl}/mpesa/stkpushquery/v1/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(formatDarajaError("stk", "stk_push", res.status, json, env.baseUrl));
  }
  return json as Record<string, unknown>;
}

async function sendB2cPayment(transaction: WalletTransaction, phone?: string) {
  const msisdn = normalizeKenyanPhone(phone);
  const env = getDarajaEnv("b2c");
  const payload = {
    InitiatorName: env.b2cInitiatorName,
    SecurityCredential: env.b2cSecurityCredential,
    CommandID: env.b2cCommandId,
    Amount: Math.round(Number(transaction.amount)),
    PartyA: env.b2cShortcode,
    PartyB: msisdn,
    Remarks: "TRONIXOPTION withdrawal",
    QueueTimeOutURL: env.b2cTimeoutUrl,
    ResultURL: env.b2cResultUrl,
    Occasion: `TRONIX-${transaction.id.slice(0, 8)}`,
  };

  const response = await darajaRequest("/mpesa/b2c/v1/paymentrequest", payload, "b2c");
  if (response.ResponseCode && response.ResponseCode !== "0") {
    throw new Error(response.ResponseDescription ?? response.errorMessage ?? "B2C payment rejected");
  }

  await recordPaymentRequest(transaction.id, "b2c", msisdn, payload, response);
  await markTransaction(transaction.id, "completed", {
    daraja_request_sent: true,
    b2c_request_accepted: true,
    completed_on_b2c_acceptance: true,
    conversation_id: response.ConversationID ?? null,
    originator_conversation_id: response.OriginatorConversationID ?? null,
    response_description: response.ResponseDescription ?? null,
  });
  await markPaymentRequestStatus(transaction.id, "b2c", "completed", response);
  return response;
}

async function darajaRequest(path: string, payload: Record<string, unknown>, mode: DarajaMode) {
  const env = getDarajaEnv(mode);
  const token = await getDarajaToken(mode);
  const step: DarajaStep = mode === "stk" ? "stk_push" : "b2c_payment";
  const res = await fetch(`${env.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(formatDarajaError(mode, step, res.status, json, env.baseUrl));
  }
  return json as Record<string, unknown>;
}

async function getDarajaToken(mode: DarajaMode) {
  const env = getDarajaEnv(mode);
  const credentials = Buffer.from(`${env.consumerKey}:${env.consumerSecret}`).toString("base64");
  const res = await fetch(`${env.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    throw new Error(formatDarajaError(mode, "oauth_token", res.status, json, env.baseUrl));
  }
  return json.access_token as string;
}

async function adjustBalance(
  userId: string,
  account: "real" | "demo",
  usdDelta: number,
  currency: "KSH" | "USD",
  kshDelta: number,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("balance_usd, demo_balance_usd, balance_ksh")
    .eq("id", userId)
    .single();
  if (error || !profile) throw new Error("Profile not found");

  const update =
    account === "real"
      ? {
          balance_usd: Number(profile.balance_usd ?? 0) + usdDelta,
          balance_ksh: Number(profile.balance_ksh ?? 0) + (currency === "KSH" ? kshDelta : 0),
        }
      : {
          demo_balance_usd: Number(profile.demo_balance_usd ?? 0) + usdDelta,
          balance_ksh: Number(profile.balance_ksh ?? 0) + (currency === "KSH" ? kshDelta : 0),
        };

  const { error: updateError } = await supabaseAdmin
    .from("profiles")
    .update(update as Record<string, unknown>)
    .eq("id", userId);
  if (updateError) throw new Error(updateError.message);
}

async function markTransaction(
  transactionId: string,
  status: WalletTransaction["status"],
  meta: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("apply_transaction", {
    _transaction_id: transactionId,
    _status: status,
    _meta: meta,
  });
}

async function recordPaymentRequest(
  transactionId: string,
  requestType: PaymentRequestType,
  phone: string,
  requestPayload: Record<string, unknown>,
  responsePayload: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("payment_requests").insert({
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
  if (error) throw new Error(error.message);
}

async function markPaymentRequestStatus(
  transactionId: string,
  requestType: PaymentRequestType,
  status: WalletTransaction["status"],
  responsePayload: Record<string, unknown>,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("payment_requests")
    .update({ status, response_payload: responsePayload } as Record<string, unknown>)
    .eq("transaction_id", transactionId)
    .eq("request_type", requestType);
  if (error) throw new Error(error.message);
}

function validateMoney(
  kind: TransactionKind,
  method: "mpesa" | "crypto",
  amount: number,
  phone?: string,
) {
  const minUsd = kind === "deposit" ? MIN_DEPOSIT_USD : MIN_WITHDRAW_USD;
  const minKsh = kind === "deposit" ? MIN_DEPOSIT_KSH : MIN_WITHDRAW_KSH;
  const minimum = method === "mpesa" ? minKsh : minUsd;
  if (amount < minimum) {
    throw new Error(
      method === "mpesa"
        ? `Minimum ${kind} is KSh ${minKsh} ($${minUsd})`
        : `Minimum ${kind} is $${minUsd}`,
    );
  }
  if (method === "mpesa") normalizeKenyanPhone(phone);
}

async function getProfilePhone(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("phone")
    .eq("id", userId)
    .single();
  if (error || !data?.phone) {
    throw new Error("Add your M-Pesa phone number in Profile before using M-Pesa.");
  }
  return normalizeKenyanPhone(String(data.phone));
}

function toUsd(amount: number, currency: "KSH" | "USD") {
  return currency === "KSH" ? roundMoney(amount / USD_TO_KSH) : roundMoney(amount);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeKenyanPhone(phone?: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  throw new Error("Enter a valid Kenyan Safaricom number");
}

function darajaTimestamp() {
  return new Date()
    .toISOString()
    .replace(/[-:TZ.]/g, "")
    .slice(0, 14);
}

function getDarajaEnv(mode: DarajaMode) {
  const baseUrl = normalizeDarajaBaseUrl(
    readEnv("DARAJA_BASE_URL") ?? "https://sandbox.safaricom.co.ke",
  );
  const appUrl = getPublicAppUrl();
  const shared = {
    consumerKey: readEnv("DARAJA_CONSUMER_KEY"),
    consumerSecret: readEnv("DARAJA_CONSUMER_SECRET"),
  };
  const stk = {
    stkShortcode: readEnv("DARAJA_STK_SHORTCODE"),
    stkPasskey: readEnv("DARAJA_STK_PASSKEY"),
    stkCallbackUrl: readEnv("DARAJA_STK_CALLBACK_URL") ?? `${appUrl}/api/daraja/stk-callback`,
  };
  const b2c = {
    b2cInitiatorName: readEnv("DARAJA_B2C_INITIATOR_NAME"),
    b2cSecurityCredential: readEnv("DARAJA_B2C_SECURITY_CREDENTIAL"),
    b2cShortcode: readEnv("DARAJA_B2C_SHORTCODE"),
    b2cCommandId: readEnv("DARAJA_B2C_COMMAND_ID") ?? "BusinessPayment",
    b2cResultUrl: readEnv("DARAJA_B2C_RESULT_URL") ?? `${appUrl}/api/daraja/b2c-result`,
    b2cTimeoutUrl: readEnv("DARAJA_B2C_TIMEOUT_URL") ?? `${appUrl}/api/daraja/b2c-timeout`,
  };
  const required = mode === "stk" ? { ...shared, ...stk } : { ...shared, ...b2c };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Missing Daraja environment variable(s): ${missing.join(", ")}`);
  }
  return { baseUrl, ...(required as Record<string, string>) };
}

function getPublicAppUrl() {
  const explicit =
    readEnv("DARAJA_PUBLIC_BASE_URL") ?? readEnv("PUBLIC_APP_URL") ?? readEnv("APP_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  throw new Error("Missing public app URL. Set DARAJA_PUBLIC_BASE_URL or APP_URL.");
}

function readEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const quoted =
    (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
  return quoted ? value.slice(1, -1).trim() : value;
}

function normalizeDarajaBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function formatDarajaError(
  mode: DarajaMode,
  step: DarajaStep,
  status: number,
  json: Record<string, unknown>,
  baseUrl: string,
) {
  const providerMessage =
    getStringValue(json.errorMessage) ??
    getStringValue(json.error_description) ??
    getStringValue(json.ResponseDescription) ??
    getStringValue(json.ResultDesc);
  const failingStep = describeDarajaStep(step);
  const providerPart = providerMessage ? ` Provider said: ${providerMessage}.` : "";

  if (providerMessage?.toLowerCase().includes("invalid access token")) {
    return [
      `${failingStep} failed because Daraja rejected the OAuth access token.`,
      `This usually means DARAJA_BASE_URL (${baseUrl}) is using sandbox while the credentials/shortcode are production, or production while they are sandbox.`,
      "Check DARAJA_BASE_URL, DARAJA_CONSUMER_KEY, DARAJA_CONSUMER_SECRET, DARAJA_STK_SHORTCODE, and DARAJA_STK_PASSKEY, then redeploy.",
      `Provider said: ${providerMessage}.`,
    ].join(" ");
  }

  if (step === "oauth_token") {
    return [
      `${failingStep} failed.`,
      "Daraja did not return an access token.",
      `Check DARAJA_CONSUMER_KEY and DARAJA_CONSUMER_SECRET for the ${darajaEnvironmentName(baseUrl)} app.`,
      `HTTP status: ${status}.${providerPart}`,
    ].join(" ");
  }

  return [
    `${failingStep} failed.`,
    `Check the ${mode.toUpperCase()} payload settings for the ${darajaEnvironmentName(baseUrl)} Daraja app.`,
    `HTTP status: ${status}.${providerPart}`,
  ].join(" ");
}

function getStringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function describeDarajaStep(step: DarajaStep) {
  if (step === "oauth_token") return "Daraja OAuth token request";
  if (step === "stk_push") return "Daraja STK push request";
  return "Daraja B2C payment request";
}

function darajaEnvironmentName(baseUrl: string) {
  return baseUrl.includes("sandbox") ? "sandbox" : "production";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
