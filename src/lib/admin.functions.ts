import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
  return raw
    .normalize("NFKD")
    .replace(/[^\w\s]/g, "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase()
    .slice(0, 18) || "AGENT";
}

async function makeUniqueAgentReferralCode(supabaseAdmin, profile: Pick<ProfileRow, "id" | "email" | "full_name" | "first_name">) {
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
    const { getServiceWalletBalance } = await import("./payhero.server");

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

    let payheroWallet: unknown = null;
    let payheroError: string | null = null;
    try {
      payheroWallet = await getServiceWalletBalance();
    } catch (e) {
      payheroError = (e as Error).message;
    }

    return {
      users: usersRes.data ?? [],
      transactions: txRes.data ?? [],
      totalUserBalance,
      totalLockedBalance,
      agentCount: agentsRes.data?.length ?? 0,
      payheroWallet,
      payheroError,
    };
  });

export const adminWithdrawPayhero = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        amount: z.number().int().min(10).max(500000),
        phone: z.string().min(9).max(15),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { withdrawToMobile } = await import("./payhero.server");
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
        amount: data.amount,
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
      .filter((withdrawal) => ["pending", "approved"].includes(withdrawal.status))
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
