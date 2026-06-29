import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/trades.functions";
import { createDeposit, createWithdrawal } from "@/lib/wallet.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus,
  Minus,
  History,
  Smartphone,
  Bitcoin,
  LogOut,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { getErrorMessage, logDebugEvent, serializeError } from "@/lib/debug-logger";

export const Route = createFileRoute("/_authenticated/wallet")({
  component: WalletPage,
});

interface Tx {
  id: string;
  kind: string;
  method: string | null;
  amount: number;
  currency: string;
  status: string;
  account_type: string;
  created_at: string;
}

function WalletPage() {
  const fetchProfile = useServerFn(getMyProfile);
  const depositFn = useServerFn(createDeposit);
  const withdrawFn = useServerFn(createWithdrawal);
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"deposit" | "withdraw" | "history">("deposit");
  const [method, setMethod] = useState<"mpesa" | "crypto">("mpesa");
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("0793542051");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Tx[]>([]);

  const activeAccount = (profile?.active_account ?? "demo") as "real" | "demo";

  useEffect(() => {
    if (tab !== "history") return;
    supabase
      .from("transactions")
      .select("id, kind, method, amount, currency, status, account_type, created_at")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => setHistory((data ?? []) as Tx[]));
  }, [tab]);

  async function deposit() {
    const amt = Number(amount);
    logDebugEvent("info", "wallet.deposit", "Deposit button pressed", {
      method,
      amount: amt,
      account: activeAccount,
      phone,
    });
    if (!amt || amt < (method === "mpesa" ? 100 : 1)) {
      logDebugEvent("warn", "wallet.deposit", "Deposit validation failed", { method, amount: amt });
      toast.error(`Minimum deposit ${method === "mpesa" ? "KSh 100" : "$1"}`);
      return;
    }

    setBusy(true);
    try {
      const result = await depositFn({
        data: { method, amount: amt, account: activeAccount, phone },
      });
      logDebugEvent("info", "wallet.deposit", "Deposit request succeeded", result);
      toast.success(
        method === "mpesa" && activeAccount === "real"
          ? "STK push sent to your phone"
          : `Deposited to ${activeAccount.toUpperCase()} account`,
      );
      setAmount("");
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) {
      logDebugEvent("error", "wallet.deposit", "Deposit request failed", serializeError(e));
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    const amt = Number(amount);
    logDebugEvent("info", "wallet.withdraw", "Withdraw button pressed", {
      method,
      amount: amt,
      account: activeAccount,
      phone,
    });
    if (!amt || amt < (method === "mpesa" ? 100 : 5)) {
      logDebugEvent("warn", "wallet.withdraw", "Withdraw validation failed", {
        method,
        amount: amt,
      });
      toast.error(`Minimum withdrawal ${method === "mpesa" ? "KSh 100" : "$5"}`);
      return;
    }

    setBusy(true);
    try {
      const result = await withdrawFn({
        data: { method, amount: amt, account: activeAccount, phone },
      });
      logDebugEvent("info", "wallet.withdraw", "Withdraw request succeeded", result);
      toast.success("Withdrawal request submitted - processing in 1-24h");
      setAmount("");
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) {
      logDebugEvent("error", "wallet.withdraw", "Withdraw request failed", serializeError(e));
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const balUSD =
    activeAccount === "real"
      ? Number(profile?.balance_usd ?? 0)
      : Number(profile?.demo_balance_usd ?? 0);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-gradient-to-br from-primary/20 to-primary-glow/10 border border-primary/30 p-5 text-center glow-primary">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mb-1">
          {activeAccount === "real" ? "Real Account" : "Demo Account"} - USD
        </div>
        <div className="text-3xl font-extrabold tabular-nums">${balUSD.toFixed(2)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          ~ KSh {(balUSD * 130).toFixed(0)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 bg-card border border-border rounded-xl p-1">
        {(
          [
            ["deposit", Plus],
            ["withdraw", Minus],
            ["history", History],
          ] as const
        ).map(([k, Icon]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={
              "py-2.5 rounded-lg flex flex-col items-center gap-0.5 text-xs font-semibold " +
              (tab === k ? "bg-primary/15 text-primary" : "text-muted-foreground")
            }
          >
            <Icon className="h-4 w-4" /> {k[0].toUpperCase() + k.slice(1)}
          </button>
        ))}
      </div>

      {(tab === "deposit" || tab === "withdraw") && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <MethodCard
              active={method === "mpesa"}
              onClick={() => setMethod("mpesa")}
              icon={<Smartphone className="h-5 w-5" />}
              title="M-Pesa"
              sub="STK Push"
            />
            <MethodCard
              active={method === "crypto"}
              onClick={() => setMethod("crypto")}
              icon={<Bitcoin className="h-5 w-5" />}
              title="Crypto"
              sub="USDT / BTC / ETH"
            />
          </div>

          <div>
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">
              Amount ({method === "mpesa" ? "KSH" : "USD"})
            </div>
            <div className="flex items-center bg-card border border-border rounded-xl px-3 py-2.5">
              <span className="font-bold text-muted-foreground mr-2 text-sm">
                {method === "mpesa" ? "KSh" : "$"}
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                inputMode="numeric"
                className="flex-1 bg-transparent outline-none font-bold text-base tabular-nums"
              />
            </div>
          </div>

          {method === "mpesa" && (
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">
                Safaricom Number
              </div>
              <div className="flex items-center bg-card border border-border rounded-xl px-3 py-2.5">
                <span className="mr-2 text-xs font-bold text-muted-foreground">KE</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="flex-1 bg-transparent outline-none font-bold tabular-nums text-sm"
                />
              </div>
            </div>
          )}

          <button
            onClick={tab === "deposit" ? deposit : withdraw}
            disabled={busy}
            className={
              "w-full py-3 rounded-xl font-bold text-sm disabled:opacity-50 " +
              (tab === "deposit"
                ? "bg-bull text-bull-foreground glow-bull"
                : "bg-primary text-primary-foreground glow-primary")
            }
          >
            {busy
              ? "Processing..."
              : tab === "deposit"
                ? `Deposit ${method === "mpesa" ? "KSh" : "$"}${amount || 0}`
                : `Withdraw ${method === "mpesa" ? "KSh" : "$"}${amount || 0}`}
          </button>
        </>
      )}

      {tab === "history" && (
        <div className="bg-card border border-border rounded-xl divide-y divide-border">
          {history.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No transactions yet.
            </div>
          )}
          {history.map((t) => {
            const isDeposit = t.kind === "deposit";
            return (
              <div key={t.id} className="flex items-center gap-3 p-3">
                <div
                  className={
                    "h-9 w-9 rounded-lg grid place-items-center " +
                    (isDeposit ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear")
                  }
                >
                  {isDeposit ? (
                    <ArrowDownLeft className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm capitalize">
                    {t.kind} - {t.method ?? "system"}
                  </div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(t.created_at).toLocaleString()} - {t.account_type?.toUpperCase()}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className={
                      "font-bold tabular-nums text-sm " + (isDeposit ? "text-bull" : "text-bear")
                    }
                  >
                    {isDeposit ? "+" : "-"}
                    {t.currency === "KSH" ? "KSh" : "$"}
                    {Number(t.amount).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-muted-foreground capitalize">{t.status}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={signOut}
        className="w-full py-2.5 rounded-xl bg-card border border-border text-bear font-semibold flex items-center justify-center gap-2 mt-4 text-sm"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}

function errorMessage(error: unknown) {
  return getErrorMessage(error, "Request failed. Check your payment settings and try again.");
}

function MethodCard({
  active,
  onClick,
  icon,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "py-2.5 rounded-xl border flex items-center gap-2 px-3 " +
        (active ? "bg-primary/15 border-primary glow-primary" : "bg-card border-border")
      }
    >
      <span className={active ? "text-primary" : "text-muted-foreground"}>{icon}</span>
      <div className="text-left">
        <div className="font-bold text-sm">{title}</div>
        <div className="text-[10px] text-muted-foreground">{sub}</div>
      </div>
    </button>
  );
}
