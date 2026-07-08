import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
<<<<<<< HEAD
import type { Database } from "@/integrations/supabase/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name?: string | null;
  second_name?: string | null;
  phone: string | null;
  referral_code?: string | null;
  created_at: string;
};

type WalletRow = {
  user_id: string;
  balance_kes: number | string | null;
  non_withdrawable_kes?: number | string | null;
};

type RoleRow = {
  user_id: string;
  role: "admin" | "agent" | "user";
};

type TxRow = {
  id: string;
  user_id: string;
  type: string;
  amount_kes: number | string;
  status: string;
  reference: string | null;
  mpesa_receipt?: string | null;
  created_at: string;
};

type BinaryTradeRow = {
  id: string;
  user_id: string;
  pair: string;
  direction: string;
  contract_type: string;
  barrier_digit: number | null;
  stake_kes: number | string;
  payout_kes: number | string;
  status: string;
  entry_price: number | string;
  exit_price: number | string | null;
  duration_seconds: number;
  opened_at: string;
  expires_at: string;
  resolved_at: string | null;
};

type AgentActivityPeriod = "day" | "week" | "month" | "all";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin only");
}

function codeBaseFromName(profile: Pick<ProfileRow, "email" | "full_name" | "first_name">) {
  const raw =
    profile.first_name ||
    profile.full_name?.split(/\s+/)[0] ||
    profile.email?.split("@")[0] ||
    "AGENT";
  return (
    raw
      .normalize("NFKD")
      .replace(/[^\w\s]/g, "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase()
      .slice(0, 18) || "AGENT"
  );
}

async function makeUniqueAgentReferralCode(
  supabaseAdmin: SupabaseClient<Database>,
  profile: Pick<ProfileRow, "id" | "email" | "full_name" | "first_name">,
) {
  const base = codeBaseFromName(profile);
  for (let i = 1; i <= 500; i++) {
    const candidate = `${base}${i}`;
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("referral_code", candidate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.id === profile.id) return candidate;
  }
  return `${base}${Date.now().toString().slice(-6)}`;
}

function periodStart(period: AgentActivityPeriod) {
  if (period === "all") return null;
  const now = new Date();
  if (period === "day") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const day = start.getDay();
    start.setDate(start.getDate() - day);
    return start;
  }
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [usersRes, walletsRes, txRes, agentsRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("wallets").select("balance_kes, non_withdrawable_kes"),
      supabaseAdmin
        .from("transactions")
        .select("id, user_id, type, amount_kes, status, reference, mpesa_receipt, created_at")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin.from("user_roles").select("user_id").eq("role", "agent"),
    ]);

    const totalUserBalance = (walletsRes.data ?? []).reduce(
      (acc, w) => acc + Number(w.balance_kes ?? 0),
      0,
    );
    const totalLockedBalance = (walletsRes.data ?? []).reduce(
      (acc, w) => acc + Number((w as WalletRow).non_withdrawable_kes ?? 0),
      0,
    );

    return {
      users: usersRes.data ?? [],
      transactions: txRes.data ?? [],
      totalUserBalance,
      totalLockedBalance,
      agentCount: agentsRes.data?.length ?? 0,
      darajaWallet: null,
      darajaError:
        "Daraja does not expose a simple service wallet balance through this integration.",
    };
  });

export const adminWithdrawDaraja = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        amount: z.number().int().min(10).max(500000),
        phone: z.string().min(9).max(15),
=======
import { createAdminUser } from "@/lib/auth.functions";
import { z } from "zod";

type RoleQuery = {
  select: (columns: string) => RoleQuery;
  eq: (column: string, value: string) => RoleQuery;
  maybeSingle: () => Promise<{ data: unknown; error: { message?: string } | null }>;
};

type AdminGateClient = {
  from: (table: string) => RoleQuery;
};

type RpcAdminClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

type ReportClient = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  username?: string | null;
  balance_usd?: number | string | null;
  created_at?: string;
};

type ReportTransaction = {
  id: string;
  user_id: string;
  kind: string;
  method?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  amount_usd?: number | string | null;
  status: string;
  account_type?: string | null;
  is_virtual?: boolean | null;
  created_at: string;
};

type ReportTrade = {
  id: string;
  user_id: string;
  module: string;
  market: string;
  direction?: string | null;
  stake?: number | string | null;
  payout?: number | string | null;
  status: string;
  account_type?: string | null;
  created_at: string;
  closed_at?: string | null;
};

// Inline admin gate (has_role EXECUTE is locked down to service_role only)
async function assertAdmin(supabase: AdminGateClient, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error("Authorization failed");
  if (!data) throw new Error("Forbidden — admin only");
}

function randomCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < len; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

function sumUsd(rows: Array<{ amount_usd?: number | string | null }>) {
  return rows.reduce((sum, row) => sum + Number(row.amount_usd ?? 0), 0);
}

function emptyAccountsReport() {
  return {
    clients: [],
    summary: {
      clients: 0,
      deposits_usd: 0,
      withdrawals_usd: 0,
      stakes_usd: 0,
      retained_usd: 0,
      user_balances_usd: 0,
      trades: 0,
    },
    by_client: [],
    deposits: [],
    withdrawals: [],
    trades: [],
  };
}

function sumAdjustments(rows: Array<Record<string, unknown>>) {
  return rows.reduce(
    (sum, row) => ({
      deposits_usd: sum.deposits_usd + Number(row.deposits_usd ?? 0),
      withdrawals_usd: sum.withdrawals_usd + Number(row.withdrawals_usd ?? 0),
      retained_usd: sum.retained_usd + Number(row.retained_usd ?? 0),
      stakes_usd: sum.stakes_usd + Number(row.stakes_usd ?? 0),
      trades: sum.trades + Number(row.trades ?? 0),
    }),
    { deposits_usd: 0, withdrawals_usd: 0, retained_usd: 0, stakes_usd: 0, trades: 0 },
  );
}

export const createAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        commission_pct: z.number().min(0).max(50).default(10),
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
<<<<<<< HEAD
    await assertAdmin(context.userId);
    const { withdrawToMobile } = await import("./daraja.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const reference = `adm_wd_${Date.now()}`;
    await supabaseAdmin.from("transactions").insert({
      user_id: context.userId,
      type: "admin_withdraw",
      amount_kes: data.amount,
      status: "pending",
      reference,
      meta: { phone: data.phone, initiated_by: context.userId },
    });

    try {
      const resp = await withdrawToMobile({
        amountUsd: data.amount,
        phone: data.phone,
        externalReference: reference,
      });
      await supabaseAdmin
        .from("transactions")
        .update({ status: "processing", meta: { phone: data.phone, response: resp } })
        .eq("reference", reference);
      return { ok: true, reference, response: resp };
    } catch (e) {
      await supabaseAdmin
        .from("transactions")
        .update({ status: "failed", meta: { phone: data.phone, error: (e as Error).message } })
        .eq("reference", reference);
      throw e;
    }
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: isAdmin }, { data: isAgent }] = await Promise.all([
      supabaseAdmin.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      }),
      supabaseAdmin.rpc("has_role", {
        _user_id: context.userId,
        _role: "agent" as never,
      }),
    ]);
    return { isAdmin: Boolean(isAdmin), isAgent: Boolean(isAgent) };
  });

export const listAdminPeople = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [profilesRes, walletsRes, rolesRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, first_name, second_name, phone, referral_code, created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("wallets").select("user_id, balance_kes, non_withdrawable_kes"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    if (profilesRes.error) throw new Error(profilesRes.error.message);
    if (walletsRes.error) throw new Error(walletsRes.error.message);
    if (rolesRes.error) throw new Error(rolesRes.error.message);

    const wallets = new Map(
      ((walletsRes.data ?? []) as WalletRow[]).map((wallet) => [wallet.user_id, wallet]),
    );
    const rolesByUser = new Map<string, Set<string>>();
    for (const row of (rolesRes.data ?? []) as RoleRow[]) {
      if (!rolesByUser.has(row.user_id)) rolesByUser.set(row.user_id, new Set());
      rolesByUser.get(row.user_id)?.add(row.role);
    }

    const people = ((profilesRes.data ?? []) as ProfileRow[]).map((profile) => {
      const wallet = wallets.get(profile.id);
      const roles = Array.from(rolesByUser.get(profile.id) ?? []);
      return {
        ...profile,
        roles,
        isAdmin: roles.includes("admin"),
        isAgent: roles.includes("agent"),
        balance: Number(wallet?.balance_kes ?? 0),
        nonWithdrawable: Number(wallet?.non_withdrawable_kes ?? 0),
        withdrawable: Math.max(
          Number(wallet?.balance_kes ?? 0) - Number(wallet?.non_withdrawable_kes ?? 0),
          0,
        ),
      };
    });

    return {
      clients: people.filter((person) => !person.isAgent),
      agents: people.filter((person) => person.isAgent),
    };
  });

export const elevateClientToAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, first_name, referral_code")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileErr) throw new Error(profileErr.message);
    if (!profile) throw new Error("Client profile not found.");

    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: "agent" as never });
    if (error && error.code !== "23505") throw new Error(error.message);
    const referralCode = await makeUniqueAgentReferralCode(supabaseAdmin, profile);
    const { error: codeErr } = await supabaseAdmin
      .from("profiles")
      .update({ referral_code: referralCode })
      .eq("id", data.userId);
    if (codeErr) throw new Error(codeErr.message);
    return { ok: true, referralCode };
  });

export const creditAgentWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: z.string().uuid(),
        amount: z.number().int().min(1).max(1_000_000),
        note: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", data.userId)
      .eq("role", "agent")
      .maybeSingle();
    if (!role) throw new Error("Only agents can receive admin wallet credits.");

    const { data: wallet, error: walletErr } = await supabaseAdmin
      .from("wallets")
      .select("balance_kes, non_withdrawable_kes")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (walletErr) throw new Error(walletErr.message);

    const nextBalance = Number(wallet?.balance_kes ?? 0) + data.amount;
    const nextLocked =
      Number((wallet as WalletRow | null)?.non_withdrawable_kes ?? 0) + data.amount;
    const { error: updateErr } = await supabaseAdmin
      .from("wallets")
      .update({
        balance_kes: nextBalance,
        non_withdrawable_kes: nextLocked,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("user_id", data.userId);
    if (updateErr) throw new Error(updateErr.message);

    await supabaseAdmin.from("transactions").insert({
      user_id: data.userId,
      type: "admin_credit",
      amount_kes: data.amount,
      status: "success",
      reference: `agent_credit_${Date.now()}`,
      meta: {
        credited_by: context.userId,
        non_withdrawable: true,
        note: data.note ?? null,
      },
    });

    return { ok: true };
  });

export const getAgentActivityReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        agentId: z.string().uuid().optional(),
        period: z.enum(["day", "week", "month", "all"]).default("day"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: agentRoles, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "agent");
    if (roleErr) throw new Error(roleErr.message);
    const agentIds = (agentRoles ?? []).map((row) => row.user_id);
    if (agentIds.length === 0) {
      return { agents: [], selected: null, clients: [], period: data.period };
    }

    const [agentsRes, refsRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, email, full_name, phone, referral_code, created_at")
        .in("id", agentIds),
      supabaseAdmin
        .from("referrals")
        .select("referrer_id, referred_id, level, created_at")
        .in("referrer_id", agentIds)
        .eq("level", 1),
    ]);
    if (agentsRes.error) throw new Error(agentsRes.error.message);
    if (refsRes.error) throw new Error(refsRes.error.message);

    const selectedId = data.agentId ?? agentIds[0];
    const selectedRefs = (refsRes.data ?? []).filter((ref) => ref.referrer_id === selectedId);
    const clientIds = selectedRefs.map((ref) => ref.referred_id);
    const allReferredIds = Array.from(new Set((refsRes.data ?? []).map((ref) => ref.referred_id)));

    const selectedDepositQuery = supabaseAdmin
      .from("transactions")
      .select("user_id, amount_kes, created_at")
      .eq("type", "deposit")
      .eq("status", "success");
    if (clientIds.length) selectedDepositQuery.in("user_id", clientIds);

    const allDepositQuery = supabaseAdmin
      .from("transactions")
      .select("user_id, amount_kes, created_at")
      .eq("type", "deposit")
      .eq("status", "success");
    if (allReferredIds.length) allDepositQuery.in("user_id", allReferredIds);

    const start = periodStart(data.period);
    if (start) {
      selectedDepositQuery.gte("created_at", start.toISOString());
      allDepositQuery.gte("created_at", start.toISOString());
    }

    const [clientsRes, depositsRes, allDepositsRes] = await Promise.all([
      clientIds.length
        ? supabaseAdmin
            .from("profiles")
            .select("id, email, full_name, phone, created_at")
            .in("id", clientIds)
        : Promise.resolve({ data: [], error: null }),
      clientIds.length ? selectedDepositQuery : Promise.resolve({ data: [], error: null }),
      allReferredIds.length ? allDepositQuery : Promise.resolve({ data: [], error: null }),
    ]);
    if (clientsRes.error) throw new Error(clientsRes.error.message);
    if (depositsRes.error) throw new Error(depositsRes.error.message);
    if (allDepositsRes.error) throw new Error(allDepositsRes.error.message);

    const depositsByClient = new Map<string, number>();
    for (const tx of (depositsRes.data ?? []) as Pick<TxRow, "user_id" | "amount_kes">[]) {
      depositsByClient.set(
        tx.user_id,
        (depositsByClient.get(tx.user_id) ?? 0) + Number(tx.amount_kes),
      );
    }
    const clients = ((clientsRes.data ?? []) as ProfileRow[]).map((client) => ({
      ...client,
      deposited: depositsByClient.get(client.id) ?? 0,
    }));
    const totalDeposited = clients.reduce((sum, client) => sum + client.deposited, 0);

    const allDepositsByClient = new Map<string, number>();
    for (const tx of (allDepositsRes.data ?? []) as Pick<TxRow, "user_id" | "amount_kes">[]) {
      allDepositsByClient.set(
        tx.user_id,
        (allDepositsByClient.get(tx.user_id) ?? 0) + Number(tx.amount_kes),
      );
    }

    const agentSummaries = ((agentsRes.data ?? []) as ProfileRow[]).map((agent) => {
      const refs = (refsRes.data ?? []).filter((ref) => ref.referrer_id === agent.id);
      return {
        ...agent,
        clientCount: refs.length,
        totalDeposited: refs.reduce(
          (sum, ref) => sum + (allDepositsByClient.get(ref.referred_id) ?? 0),
          0,
        ),
        selected: agent.id === selectedId,
      };
    });

    return {
      agents: agentSummaries,
      period: data.period,
      selected: {
        id: selectedId,
        clientCount: clients.length,
        totalDeposited,
      },
      clients,
    };
  });

export const getFinancialReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const txQuery = supabaseAdmin
      .from("transactions")
      .select("id, user_id, type, amount_kes, status, reference, mpesa_receipt, created_at")
      .order("created_at", { ascending: false })
      .limit(250);
    if (data.userId) txQuery.eq("user_id", data.userId);

    const withdrawalQuery = supabaseAdmin
      .from("withdrawal_requests")
      .select("user_id, amount_kes, status");
    if (data.userId) withdrawalQuery.eq("user_id", data.userId);

    const walletsQuery = supabaseAdmin
      .from("wallets")
      .select("user_id, balance_kes, non_withdrawable_kes");
    const profilesQuery = supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, phone")
      .order("created_at", { ascending: false });

    const [txRes, withdrawalRes, walletsRes, profilesRes] = await Promise.all([
      txQuery,
      withdrawalQuery,
      walletsQuery,
      profilesQuery,
    ]);
    if (txRes.error) throw new Error(txRes.error.message);
    if (withdrawalRes.error) throw new Error(withdrawalRes.error.message);
    if (walletsRes.error) throw new Error(walletsRes.error.message);
    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const relevantWallets = data.userId
      ? ((walletsRes.data ?? []) as WalletRow[]).filter((wallet) => wallet.user_id === data.userId)
      : ((walletsRes.data ?? []) as WalletRow[]);
    const remainingBalance = relevantWallets.reduce(
      (sum, wallet) => sum + Number(wallet.balance_kes ?? 0),
      0,
    );
    const nonWithdrawable = relevantWallets.reduce(
      (sum, wallet) => sum + Number(wallet.non_withdrawable_kes ?? 0),
      0,
    );

    const transactions = (txRes.data ?? []) as TxRow[];
    const withdrawals = withdrawalRes.data ?? [];
    const deposited = transactions
      .filter((tx) => tx.type === "deposit" && tx.status === "success")
      .reduce((sum, tx) => sum + Number(tx.amount_kes), 0);
    const adminCredited = transactions
      .filter((tx) => tx.type === "admin_credit" && tx.status === "success")
      .reduce((sum, tx) => sum + Number(tx.amount_kes), 0);
    const withdrawn = withdrawals
      .filter((withdrawal) => withdrawal.status === "paid")
      .reduce((sum, withdrawal) => sum + Number(withdrawal.amount_kes), 0);
    const pendingWithdrawals = withdrawals
      .filter((withdrawal) => ["pending", "approved", "processing"].includes(withdrawal.status))
      .reduce((sum, withdrawal) => sum + Number(withdrawal.amount_kes), 0);

    const profilesById = new Map(
      ((profilesRes.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
    );
    return {
      users: profilesRes.data ?? [],
      summary: {
        deposited,
        adminCredited,
        withdrawn,
        pendingWithdrawals,
        remainingBalance,
        nonWithdrawable,
        withdrawableBalance: Math.max(remainingBalance - nonWithdrawable, 0),
      },
      transactions: transactions.map((tx) => ({
        ...tx,
        profile: profilesById.get(tx.user_id) ?? null,
      })),
    };
  });

export const getAdminTradesReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tradesData, error: tradesError } = await supabaseAdmin
      .from("binary_trades")
      .select(
        "id, user_id, pair, direction, contract_type, barrier_digit, stake_kes, payout_kes, status, entry_price, exit_price, duration_seconds, opened_at, expires_at, resolved_at",
      )
      .order("opened_at", { ascending: false })
      .limit(250);
    if (tradesError) throw new Error(tradesError.message);

    const trades = (tradesData ?? []) as BinaryTradeRow[];
    const userIds = Array.from(new Set(trades.map((trade) => trade.user_id)));
    const profilesRes = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, email, full_name, phone").in("id", userIds)
      : { data: [], error: null };
    if (profilesRes.error) throw new Error(profilesRes.error.message);

    const profilesById = new Map(
      ((profilesRes.data ?? []) as Pick<ProfileRow, "id" | "email" | "full_name" | "phone">[]).map(
        (profile) => [profile.id, profile],
      ),
    );

    const openTrades = trades.filter((trade) => trade.status === "open");
    const buyLike = openTrades.filter((trade) =>
      ["up", "even", "over"].includes(trade.direction),
    ).length;
    const sellLike = Math.max(openTrades.length - buyLike, 0);
    const stakeOpen = openTrades.reduce((sum, trade) => sum + Number(trade.stake_kes ?? 0), 0);
    const resolved = trades.filter((trade) => trade.status !== "open");
    const stakeResolved = resolved.reduce((sum, trade) => sum + Number(trade.stake_kes ?? 0), 0);
    const payoutResolved = resolved.reduce((sum, trade) => sum + Number(trade.payout_kes ?? 0), 0);

    return {
      summary: {
        total: trades.length,
        open: openTrades.length,
        won: trades.filter((trade) => trade.status === "won").length,
        lost: trades.filter((trade) => trade.status === "lost").length,
        refunded: trades.filter((trade) => trade.status === "refund").length,
        buyPct: openTrades.length ? Math.round((buyLike / openTrades.length) * 100) : 0,
        sellPct: openTrades.length ? Math.round((sellLike / openTrades.length) * 100) : 0,
        stakeOpen,
        stakeResolved,
        payoutResolved,
        netRetained: stakeResolved - payoutResolved,
      },
      trades: trades.map((trade) => ({
        ...trade,
        profile: profilesById.get(trade.user_id) ?? null,
      })),
    };
  });

export const listMarketOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("market_overrides")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const createMarketOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        symbol: z.string().min(3).max(10),
        targetPrice: z.number().positive(),
        durationSeconds: z
          .number()
          .int()
          .min(30)
          .max(24 * 60 * 60),
        revertSeconds: z
          .number()
          .int()
          .min(0)
          .max(24 * 60 * 60),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getPriceAt, invalidateOverrideCache } = await import("./pricing.server");
    const startPrice = await getPriceAt(data.symbol, Date.now());
    const startAt = new Date();
    const endAt = new Date(Date.now() + data.durationSeconds * 1000);
    // Deactivate any prior active override for same symbol
    await supabaseAdmin
      .from("market_overrides")
      .update({ active: false })
      .eq("symbol", data.symbol)
      .eq("active", true);
    const { data: row, error } = await supabaseAdmin
      .from("market_overrides")
      .insert({
        symbol: data.symbol,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        revert_seconds: data.revertSeconds,
        target_price: data.targetPrice,
        start_price: startPrice,
        created_by: context.userId,
        active: true,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    invalidateOverrideCache();
    return row;
  });

export const cancelMarketOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { invalidateOverrideCache } = await import("./pricing.server");
    await supabaseAdmin.from("market_overrides").update({ active: false }).eq("id", data.id);
    invalidateOverrideCache();
    return { ok: true };
  });
=======
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Find user by email via auth admin
    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw new Error(listErr.message);
    const user = list.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (!user)
      throw new Error(`No user found with email ${data.email}. Ask them to sign up first.`);

    // Grant agent role (idempotent)
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: user.id, role: "agent" }, { onConflict: "user_id,role" });

    // Generate unique referral code
    let code = randomCode();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("referral_code", code)
        .maybeSingle();
      if (!existing) break;
      code = randomCode();
    }

    const { data: agent, error } = await supabaseAdmin
      .from("agents")
      .upsert(
        {
          user_id: user.id,
          referral_code: code,
          commission_pct: data.commission_pct,
        },
        { onConflict: "user_id" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);

    return { ok: true, agent };
  });

export const creditAgentVirtual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        agent_user_id: z.string().uuid(),
        amount_usd: z.number().positive().max(1_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Credit virtual money to agent's real balance, tag transaction as virtual.
    const { data: p, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("balance_usd")
      .eq("id", data.agent_user_id)
      .single();
    if (pErr || !p) throw new Error("Agent profile not found");

    await supabaseAdmin
      .from("profiles")
      .update({ balance_usd: Number(p.balance_usd) + data.amount_usd })
      .eq("id", data.agent_user_id);

    await supabaseAdmin.from("transactions").insert({
      user_id: data.agent_user_id,
      kind: "admin_credit",
      method: "system",
      amount: data.amount_usd,
      currency: "USD",
      amount_usd: data.amount_usd,
      status: "completed",
      account_type: "real",
      is_virtual: true,
      meta: { granted_by: context.userId },
    });

    return { ok: true };
  });

export const listAgents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("agent_rollups")
      .select("*")
      .order("client_count", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().max(120).optional(),
        agent_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let referralFilter: string[] | null = null;
    if (data.agent_id) {
      const { data: refs } = await supabaseAdmin
        .from("referrals")
        .select("client_id")
        .eq("agent_id", data.agent_id);
      referralFilter = (refs ?? []).map((r) => r.client_id as string);
      if (referralFilter.length === 0) return [];
    }

    let q = supabaseAdmin
      .from("profiles")
      .select("*")
      .limit(data.limit)
      .order("created_at", { ascending: false });
    if (referralFilter) q = q.in("id", referralFilter);
    if (data.search) q = q.or(`username.ilike.%${data.search}%,full_name.ilike.%${data.search}%`);

    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);
    return profiles ?? [];
  });

export const promoteUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "agent"]),
        commission_pct: z.number().min(0).max(100).default(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.user_id, role: data.role }, { onConflict: "user_id,role" });

    if (data.role === "agent") {
      let code = randomCode();
      for (let i = 0; i < 8; i++) {
        const { data: existing } = await supabaseAdmin
          .from("agents")
          .select("id")
          .eq("referral_code", code)
          .maybeSingle();
        if (!existing) break;
        code = randomCode();
      }

      await supabaseAdmin
        .from("agents")
        .upsert(
          { user_id: data.user_id, referral_code: code, commission_pct: data.commission_pct },
          { onConflict: "user_id" },
        );
    }

    return { ok: true };
  });

export const demoteUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        role: z.enum(["admin", "agent"]),
        reset_agent_balances: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.role === "admin") {
      const { count, error: countError } = await supabaseAdmin
        .from("user_roles")
        .select("user_id", { count: "exact", head: true })
        .eq("role", "admin");
      if (countError) throw new Error(countError.message);
      if ((count ?? 0) <= 1) throw new Error("Keep at least one admin account active");
    }

    const { error } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", data.user_id)
      .eq("role", data.role);
    if (error) throw new Error(error.message);

    if (data.role === "agent") {
      const { error: agentError } = await supabaseAdmin
        .from("agents")
        .delete()
        .eq("user_id", data.user_id);
      if (agentError) throw new Error(agentError.message);

      if (data.reset_agent_balances) {
        const { error: balanceError } = await supabaseAdmin
          .from("profiles")
          .update({ balance_usd: 0, demo_balance_usd: 0, balance_ksh: 0 } as Record<
            string,
            unknown
          >)
          .eq("id", data.user_id);
        if (balanceError) throw new Error(balanceError.message);
      }
    }

    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: data.user_id, role: "client" }, { onConflict: "user_id,role" });

    return { ok: true };
  });

export const resetUserBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        user_id: z.string().uuid(),
        account: z.enum(["real", "demo", "all"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const update =
      data.account === "real"
        ? { balance_usd: 0, balance_ksh: 0 }
        : data.account === "demo"
          ? { demo_balance_usd: 0 }
          : { balance_usd: 0, demo_balance_usd: 0, balance_ksh: 0 };

    const { error } = await supabaseAdmin
      .from("profiles")
      .update(update as Record<string, unknown>)
      .eq("id", data.user_id);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

export const listAccountMetricAdjustments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("account_metric_adjustments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createAccountMetricAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        label: z.string().trim().min(2).max(120),
        deposits_usd: z.number().default(0),
        withdrawals_usd: z.number().default(0),
        retained_usd: z.number().default(0),
        stakes_usd: z.number().default(0),
        trades: z.number().int().default(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("account_metric_adjustments").insert({
      ...data,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetAdminAccountsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reason: z.string().trim().min(2).max(160).default("Manual summary reset"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("account_summary_resets")
      .insert({ reset_by: context.userId, reason: data.reason })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, reset: row };
  });

export const getAccountsReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        scope: z.enum(["admin", "agent"]).default("agent"),
        start_date: z.string().optional(),
        end_date: z.string().optional(),
        client_id: z.string().uuid().optional(),
        mode: z.enum(["current", "all_time"]).default("current"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roleRows = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = new Set((roleRows.data ?? []).map((r) => r.role));
    const isAdmin = roles.has("admin");
    const isAgent = roles.has("agent");
    if (data.scope === "admin" && !isAdmin) throw new Error("Forbidden — admin only");
    if (data.scope === "agent" && !isAdmin && !isAgent) throw new Error("Forbidden — agent only");

    let clientIds: string[] | null = null;
    if (data.scope === "agent" && !isAdmin) {
      const { data: agent } = await supabaseAdmin
        .from("agents")
        .select("id")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!agent?.id) return emptyAccountsReport();

      const { data: refs } = await supabaseAdmin
        .from("referrals")
        .select("client_id")
        .eq("agent_id", agent.id);
      clientIds = (refs ?? []).map((r) => r.client_id as string);
      if (clientIds.length === 0) return emptyAccountsReport();
    }

    if (data.client_id) {
      if (clientIds && !clientIds.includes(data.client_id))
        throw new Error("Client is not under this agent");
      clientIds = [data.client_id];
    }

    let profilesQ = supabaseAdmin
      .from("profiles")
      .select("id,email,full_name,username,balance_usd,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (clientIds) profilesQ = profilesQ.in("id", clientIds);
    const { data: clients, error: clientsError } = await profilesQ;
    if (clientsError) throw new Error(clientsError.message);
    const scopedIds = (clients ?? []).map((c) => c.id as string);
    if (scopedIds.length === 0) return { ...emptyAccountsReport(), clients: [] };

    let from = data.start_date ? `${data.start_date}T00:00:00.000Z` : undefined;
    const to = data.end_date ? `${data.end_date}T23:59:59.999Z` : undefined;
    if (data.scope === "admin" && data.mode === "current") {
      const { data: reset } = await supabaseAdmin
        .from("account_summary_resets")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const resetAt = typeof reset?.created_at === "string" ? reset.created_at : undefined;
      if (resetAt && (!from || new Date(resetAt).getTime() > new Date(from).getTime())) {
        from = resetAt;
      }
    }

    let txQ = supabaseAdmin
      .from("transactions")
      .select(
        "id,user_id,kind,method,amount,currency,amount_usd,status,account_type,is_virtual,created_at",
      )
      .in("user_id", scopedIds)
      .eq("account_type", "real")
      .eq("is_virtual", false)
      .in("status", ["completed"])
      .order("created_at", { ascending: false })
      .limit(1000);
    if (from) txQ = txQ.gte("created_at", from);
    if (to) txQ = txQ.lte("created_at", to);
    const { data: transactions, error: txError } = await txQ;
    if (txError) throw new Error(txError.message);

    let tradesQ = supabaseAdmin
      .from("trades")
      .select(
        "id,user_id,module,market,direction,stake,payout,status,account_type,created_at,closed_at",
      )
      .in("user_id", scopedIds)
      .eq("account_type", "real")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (from) tradesQ = tradesQ.gte("created_at", from);
    if (to) tradesQ = tradesQ.lte("created_at", to);
    const { data: trades, error: tradesError } = await tradesQ;
    if (tradesError) throw new Error(tradesError.message);

    let adjustmentsQ = supabaseAdmin
      .from("account_metric_adjustments")
      .select("deposits_usd,withdrawals_usd,retained_usd,stakes_usd,trades,created_at");
    if (from) adjustmentsQ = adjustmentsQ.gte("created_at", from);
    if (to) adjustmentsQ = adjustmentsQ.lte("created_at", to);
    const { data: adjustments } = await adjustmentsQ;
    const manual = sumAdjustments((adjustments ?? []) as Array<Record<string, unknown>>);

    const reportClients = (clients ?? []) as ReportClient[];
    const reportTransactions = (transactions ?? []) as ReportTransaction[];
    const reportTrades = (trades ?? []) as ReportTrade[];
    const clientMap = new Map(reportClients.map((c) => [c.id, c]));
    const deposits = (transactions ?? []).filter(
      (t: ReportTransaction) => t.kind === "deposit" && t.method === "mpesa",
    );
    const withdrawals = reportTransactions.filter((t) => t.kind === "withdraw");
    const closedTrades = reportTrades.filter((t) => t.status !== "open");
    const houseRetained = closedTrades.reduce((sum, t) => {
      if (t.status === "lost") return sum + Number(t.stake ?? 0);
      if (t.status === "won")
        return sum - Math.max(Number(t.payout ?? 0) - Number(t.stake ?? 0), 0);
      return sum;
    }, 0);

    const byClient = scopedIds.map((id) => {
      const profile = clientMap.get(id);
      const clientTx = reportTransactions.filter((t) => t.user_id === id);
      const clientTrades = reportTrades.filter((t) => t.user_id === id);
      const clientClosed = clientTrades.filter((t) => t.status !== "open");
      const retained = clientClosed.reduce((sum, t) => {
        if (t.status === "lost") return sum + Number(t.stake ?? 0);
        if (t.status === "won")
          return sum - Math.max(Number(t.payout ?? 0) - Number(t.stake ?? 0), 0);
        return sum;
      }, 0);
      return {
        client_id: id,
        name: profile?.full_name || profile?.username || profile?.email || id.slice(0, 8),
        email: profile?.email ?? null,
        deposits_usd: sumUsd(clientTx.filter((t) => t.kind === "deposit")),
        withdrawals_usd: sumUsd(clientTx.filter((t) => t.kind === "withdraw")),
        stakes_usd: clientTrades.reduce((s, t) => s + Number(t.stake ?? 0), 0),
        retained_usd: retained,
        trades: clientTrades.length,
      };
    });

    return {
      clients: clients ?? [],
      summary: {
        clients: scopedIds.length,
        deposits_usd: sumUsd(deposits) + manual.deposits_usd,
        withdrawals_usd: sumUsd(withdrawals) + manual.withdrawals_usd,
        stakes_usd: reportTrades.reduce((s, t) => s + Number(t.stake ?? 0), 0) + manual.stakes_usd,
        retained_usd: houseRetained + manual.retained_usd,
        user_balances_usd: reportClients.reduce(
          (s, client) => s + Number(client.balance_usd ?? 0),
          0,
        ),
        trades: reportTrades.length + manual.trades,
      },
      by_client: byClient,
      deposits,
      withdrawals,
      trades: reportTrades,
    };
  });

export const failStaleMpesaWithdrawals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        older_than_minutes: z.number().int().min(1).max(60).default(2),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await (supabaseAdmin as unknown as RpcAdminClient).rpc(
      "fail_stale_mpesa_withdrawals",
      {
        _older_than: `${data.older_than_minutes} minutes`,
      },
    );
    if (error) throw new Error(error.message);
    return { ok: true, repaired: rows ?? [] };
  });

export const reconcileSuccessfulB2cCallbacks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: callbackRows, error } = await (supabaseAdmin as unknown as RpcAdminClient).rpc(
      "reconcile_successful_b2c_callbacks",
    );
    if (error) throw new Error(error.message);

    const { data: acceptedRows, error: acceptedError } = await (
      supabaseAdmin as unknown as RpcAdminClient
    ).rpc("complete_accepted_b2c_withdrawals");
    if (acceptedError) throw new Error(acceptedError.message);

    return { ok: true, repaired: [...(callbackRows ?? []), ...(acceptedRows ?? [])] };
  });

export const createAdminAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        fullName: z.string().min(2).max(120),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return createAdminUser(data);
  });

export const listAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    if (rolesErr) throw new Error(rolesErr.message);

    const ids = (roles ?? []).map((row) => row.user_id);
    if (ids.length === 0) return [];

    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id,email,full_name,username,created_at")
      .in("id", ids)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return profiles ?? [];
  });

export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ new_password: z.string().min(8).max(72) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.auth.updateUser({ password: data.new_password });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        full_name: z.string().trim().min(2).max(120).optional(),
        username: z.string().trim().min(2).max(40).optional(),
        phone: z.string().trim().min(9).max(16).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const phone = data.phone ? normalizeKenyanPhone(data.phone) : undefined;
    const { error } = await context.supabase
      .from("profiles")
      .update({ full_name: data.full_name, username: data.username, phone })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

function normalizeKenyanPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  throw new Error("Enter a valid Kenyan Safaricom number");
}
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
