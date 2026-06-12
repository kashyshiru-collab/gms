// Server-only helpers for the deposit/withdraw trade-gate and account burn logic.
// Loaded only from inside server-function handler bodies.

export const TRADE_GATE = 5;

export async function tradeGateInfo(supabase: any, userId: string) {
  const { data: depRows } = await supabase
    .from("transactions")
    .select("created_at")
    .eq("user_id", userId)
    .eq("type", "deposit")
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1);
  const lastDepositAt: string | null = depRows?.[0]?.created_at ?? null;
  if (!lastDepositAt) {
    return { hasPriorDeposit: false, trades: 0, lastDepositAt: null, ok: true as const };
  }
  const [binRes, posRes] = await Promise.all([
    supabase
      .from("binary_trades")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("opened_at", lastDepositAt),
    supabase
      .from("positions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("opened_at", lastDepositAt),
  ]);
  const trades = (binRes.count ?? 0) + (posRes.count ?? 0);
  return {
    hasPriorDeposit: true,
    trades,
    lastDepositAt,
    ok: trades >= TRADE_GATE,
  };
}

export async function getProfileFlags(supabaseAdmin: any, userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("warnings_count, is_burned, force_loss")
    .eq("id", userId)
    .maybeSingle();
  return {
    warnings_count: Number(data?.warnings_count ?? 0),
    is_burned: Boolean(data?.is_burned ?? false),
    force_loss: Boolean(data?.force_loss ?? false),
  };
}
