import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import type React from "react";
import {
  adminWithdrawDaraja,
  creditAgentWallet,
  elevateClientToAgent,
  getAdminOverview,
  getAdminTradesReport,
  getAgentActivityReport,
  getFinancialReport,
  listAdminPeople,
} from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WithdrawalQueue } from "@/components/admin/WithdrawalQueue";
import { MarketOverridePanel } from "@/components/admin/MarketOverridePanel";
import { PolymarketAdminPanel } from "@/components/admin/PolymarketAdminPanel";
import { toast } from "sonner";
import { formatMoney } from "@/lib/money";
import {
  ArrowDownToLine,
  Banknote,
  CalendarDays,
  Landmark,
  Search,
  Shield,
  UserRoundPlus,
  Users,
  Wallet,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin - TronixOption" }] }),
  component: AdminPage,
});

type Person = {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name?: string | null;
  second_name?: string | null;
  phone: string | null;
  referral_code?: string | null;
  roles: string[];
  balance: number;
  nonWithdrawable: number;
  withdrawable: number;
  created_at: string;
};

type Tx = {
  id: string;
  user_id: string;
  type: string;
  amount_kes: number | string;
  status: string;
  reference: string | null;
  mpesa_receipt?: string | null;
  created_at: string;
  profile?: {
    email: string | null;
    full_name: string | null;
    phone: string | null;
  } | null;
};

type AdminOverview = {
  users?: unknown[];
  transactions?: unknown[];
  totalUserBalance?: number;
  totalLockedBalance?: number;
  agentCount?: number;
  darajaWallet?: unknown;
  darajaError?: string | null;
};

type AdminTrade = {
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
  profile?: {
    email: string | null;
    full_name: string | null;
    phone: string | null;
  } | null;
};

type ActivityPeriod = "day" | "week" | "month" | "all";

const fmtUSD = formatMoney;

function personName(person: Pick<Person, "email" | "full_name" | "first_name" | "second_name">) {
  return (
    person.full_name ||
    `${person.first_name ?? ""} ${person.second_name ?? ""}`.trim() ||
    person.email ||
    "Unnamed user"
  );
}

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const overviewFn = useServerFn(getAdminOverview);
  const peopleFn = useServerFn(listAdminPeople);

  const overviewQ = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => overviewFn(),
    refetchInterval: 15_000,
    retry: false,
  });
  const peopleQ = useQuery({
    queryKey: ["admin-people"],
    queryFn: () => peopleFn(),
    refetchInterval: 20_000,
    retry: false,
  });

  if (overviewQ.isError || peopleQ.isError) {
    const error = (overviewQ.error ?? peopleQ.error) as Error;
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="max-w-md space-y-4 p-8 text-center">
          <Shield className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Access denied</h1>
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>
            Back to dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <SecretAdminLogo onExit={() => navigate({ to: "/dashboard" })} />
          <div className="text-xs text-muted-foreground">Tap logo 5 times to return</div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 md:p-6">
        <Tabs defaultValue="overview" className="space-y-5">
          <div className="overflow-x-auto">
            <TabsList className="h-auto justify-start">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="clients">Clients</TabsTrigger>
              <TabsTrigger value="agents">Agents</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="finance">Finance</TabsTrigger>
              <TabsTrigger value="trades">Trades</TabsTrigger>
              <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
              <TabsTrigger value="markets">Markets</TabsTrigger>
              <TabsTrigger value="polymarket">Polymarket</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview">
            <OverviewPanel overview={overviewQ.data} />
          </TabsContent>
          <TabsContent value="clients">
            <ClientsPanel clients={(peopleQ.data?.clients ?? []) as Person[]} />
          </TabsContent>
          <TabsContent value="agents">
            <AgentsPanel agents={(peopleQ.data?.agents ?? []) as Person[]} />
          </TabsContent>
          <TabsContent value="activity">
            <ActivityReportPanel agents={(peopleQ.data?.agents ?? []) as Person[]} />
          </TabsContent>
          <TabsContent value="finance">
            <FinancePanel
              people={
                [...(peopleQ.data?.clients ?? []), ...(peopleQ.data?.agents ?? [])] as Person[]
              }
            />
          </TabsContent>
          <TabsContent value="trades">
            <TradesPanel />
          </TabsContent>
          <TabsContent value="withdrawals">
            <WithdrawalQueue />
          </TabsContent>
          <TabsContent value="markets">
            <MarketOverridePanel />
          </TabsContent>
          <TabsContent value="polymarket">
            <PolymarketAdminPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );

  function ClientsPanel({ clients }: { clients: Person[] }) {
    const [search, setSearch] = useState("");
    const elevateFn = useServerFn(elevateClientToAgent);
    const elevateMut = useMutation({
      mutationFn: (userId: string) => elevateFn({ data: { userId } }),
      onSuccess: () => {
        toast.success("Client elevated to agent");
        qc.invalidateQueries({ queryKey: ["admin-people"] });
        qc.invalidateQueries({ queryKey: ["admin-overview"] });
      },
      onError: (error: Error) => toast.error(error.message),
    });
    const filtered = useMemo(() => filterPeople(clients, search), [clients, search]);

    return (
      <Card className="overflow-hidden">
        <PanelHeader
          title="Clients"
          description="All non-agent users. Elevating a client moves them to the Agents page."
          search={search}
          setSearch={setSearch}
        />
        <PeopleTable
          people={filtered}
          empty="No clients found."
          action={(person) =>
            person.roles.includes("admin") ? (
              <span className="text-xs text-muted-foreground">admin</span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => elevateMut.mutate(person.id)}
                disabled={elevateMut.isPending}
              >
                <UserRoundPlus className="mr-1.5 h-4 w-4" />
                Elevate
              </Button>
            )
          }
        />
      </Card>
    );
  }

  function AgentsPanel({ agents }: { agents: Person[] }) {
    const [search, setSearch] = useState("");
    const [amountByAgent, setAmountByAgent] = useState<Record<string, string>>({});
    const [noteByAgent, setNoteByAgent] = useState<Record<string, string>>({});
    const creditFn = useServerFn(creditAgentWallet);
    const creditMut = useMutation({
      mutationFn: (vars: { userId: string; amount: number; note?: string }) =>
        creditFn({ data: vars }),
      onSuccess: () => {
        toast.success("Agent wallet credited as non-withdrawable funds");
        setAmountByAgent({});
        setNoteByAgent({});
        qc.invalidateQueries({ queryKey: ["admin-people"] });
        qc.invalidateQueries({ queryKey: ["admin-overview"] });
        qc.invalidateQueries({ queryKey: ["finance-report"] });
      },
      onError: (error: Error) => toast.error(error.message),
    });
    const filtered = useMemo(() => filterPeople(agents, search), [agents, search]);

    return (
      <Card className="overflow-hidden">
        <PanelHeader
          title="Agents"
          description="Admin credits raise the visible wallet balance but are locked from withdrawals."
          search={search}
          setSearch={setSearch}
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <PeopleHead extra="Credit locked funds" />
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No agents found.
                  </td>
                </tr>
              )}
              {filtered.map((agent) => (
                <tr key={agent.id} className="border-b border-border/60">
                  <PersonCells person={agent} />
                  <td className="p-3">
                    <div className="grid min-w-[320px] grid-cols-[110px_1fr_auto] gap-2">
                      <Input
                        type="number"
                        min={1}
                        placeholder="USD"
                        value={amountByAgent[agent.id] ?? ""}
                        onChange={(event) =>
                          setAmountByAgent((value) => ({
                            ...value,
                            [agent.id]: event.target.value,
                          }))
                        }
                      />
                      <Input
                        placeholder="Note"
                        value={noteByAgent[agent.id] ?? ""}
                        onChange={(event) =>
                          setNoteByAgent((value) => ({
                            ...value,
                            [agent.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          const amount = Number(amountByAgent[agent.id]);
                          if (!amount) {
                            toast.error("Enter an amount.");
                            return;
                          }
                          creditMut.mutate({
                            userId: agent.id,
                            amount,
                            note: noteByAgent[agent.id],
                          });
                        }}
                        disabled={creditMut.isPending}
                      >
                        Add
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }

  function ActivityReportPanel({ agents }: { agents: Person[] }) {
    const reportFn = useServerFn(getAgentActivityReport);
    const [agentId, setAgentId] = useState(agents[0]?.id ?? "");
    const [period, setPeriod] = useState<ActivityPeriod>("day");
    useEffect(() => {
      if (!agentId && agents[0]?.id) setAgentId(agents[0].id);
    }, [agentId, agents]);
    const reportQ = useQuery({
      queryKey: ["agent-activity", agentId, period],
      queryFn: () => reportFn({ data: { agentId: agentId || undefined, period } }),
      enabled: agents.length > 0,
      retry: false,
    });

    return (
      <div className="space-y-4">
        <Card className="p-5">
          <div className="grid gap-4 md:grid-cols-[320px_1fr] md:items-end">
            <div>
              <Label htmlFor="agent-report">Agent</Label>
              <select
                id="agent-report"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {personName(agent)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="activity-period">Period</Label>
                <select
                  id="activity-period"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value as ActivityPeriod)}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                >
                  <option value="day">Today</option>
                  <option value="week">This week</option>
                  <option value="month">This month</option>
                  <option value="all">All time</option>
                </select>
              </div>
              <Metric
                icon={Users}
                label="Clients brought onboard"
                value={String(reportQ.data?.selected?.clientCount ?? 0)}
              />
              <Metric
                icon={ArrowDownToLine}
                label="Client deposits"
                value={fmtUSD(reportQ.data?.selected?.totalDeposited ?? 0)}
              />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-semibold">
            Agent referral deposits
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Agent</th>
                  <th className="p-3 text-left">Referral code</th>
                  <th className="p-3 text-right">Onboarded</th>
                  <th className="p-3 text-right">Deposits</th>
                </tr>
              </thead>
              <tbody>
                {(reportQ.data?.agents ?? []).map((agent) => (
                  <tr
                    key={agent.id}
                    className={`cursor-pointer border-b border-border/60 ${
                      agent.id === agentId ? "bg-muted/30" : ""
                    }`}
                    onClick={() => setAgentId(agent.id)}
                  >
                    <td className="p-3">
                      <div className="font-medium">{personName(agent)}</div>
                      <div className="text-xs text-muted-foreground">{agent.email}</div>
                    </td>
                    <td className="p-3 font-mono text-xs">{agent.referral_code ?? "-"}</td>
                    <td className="p-3 text-right tabular">{agent.clientCount}</td>
                    <td className="p-3 text-right tabular">
                      {fmtUSD(Number(agent.totalDeposited ?? 0))}
                    </td>
                  </tr>
                ))}
                {(reportQ.data?.agents ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      No agents found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-5 py-3 font-semibold">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            Selected agent clients
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Client</th>
                  <th className="p-3 text-left">Phone</th>
                  <th className="p-3 text-right">Deposited</th>
                  <th className="p-3 text-left">Joined</th>
                </tr>
              </thead>
              <tbody>
                {(reportQ.data?.clients ?? []).map((client) => (
                  <tr key={client.id} className="border-b border-border/60">
                    <td className="p-3">
                      <div className="font-medium">{personName(client)}</div>
                      <div className="text-xs text-muted-foreground">{client.email}</div>
                    </td>
                    <td className="p-3">{client.phone ?? "-"}</td>
                    <td className="p-3 text-right tabular">{fmtUSD(client.deposited)}</td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(client.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {(reportQ.data?.clients ?? []).length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      No referred clients for this agent yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  function FinancePanel({ people }: { people: Person[] }) {
    const financeFn = useServerFn(getFinancialReport);
    const [userId, setUserId] = useState("");
    const financeQ = useQuery({
      queryKey: ["finance-report", userId],
      queryFn: () => financeFn({ data: { userId: userId || undefined } }),
      retry: false,
    });
    const summary = financeQ.data?.summary;

    return (
      <div className="space-y-4">
        <Card className="p-5">
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <div>
              <Label htmlFor="finance-user">Filter by client</Label>
              <select
                id="finance-user"
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
              >
                <option value="">All clients and agents</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {personName(person)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Metric
                icon={ArrowDownToLine}
                label="Deposited"
                value={fmtUSD(summary?.deposited ?? 0)}
              />
              <Metric icon={Banknote} label="Withdrawn" value={fmtUSD(summary?.withdrawn ?? 0)} />
              <Metric
                icon={Landmark}
                label="Remaining"
                value={fmtUSD(summary?.remainingBalance ?? 0)}
              />
              <Metric icon={Shield} label="Locked" value={fmtUSD(summary?.nonWithdrawable ?? 0)} />
              <Metric
                icon={Wallet}
                label="Withdrawable"
                value={fmtUSD(summary?.withdrawableBalance ?? 0)}
              />
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-semibold">Transactions</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Time</th>
                  <th className="p-3 text-left">Client</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Reference</th>
                  <th className="p-3 text-left">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {((financeQ.data?.transactions ?? []) as Tx[]).map((tx) => (
                  <tr key={tx.id} className="border-b border-border/60">
                    <td className="p-3 text-muted-foreground">
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="font-medium">
                        {tx.profile?.full_name ?? tx.profile?.email ?? tx.user_id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-muted-foreground">{tx.profile?.phone ?? ""}</div>
                    </td>
                    <td className="p-3">{tx.type}</td>
                    <td className="p-3 text-right tabular">{fmtUSD(Number(tx.amount_kes))}</td>
                    <td className="p-3">{tx.status}</td>
                    <td className="p-3 text-xs">{tx.reference ?? "-"}</td>
                    <td className="p-3 text-xs">{tx.mpesa_receipt ?? "-"}</td>
                  </tr>
                ))}
                {(financeQ.data?.transactions ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  function TradesPanel() {
    const tradesFn = useServerFn(getAdminTradesReport);
    const tradesQ = useQuery({
      queryKey: ["admin-trades"],
      queryFn: () => tradesFn(),
      refetchInterval: 2_000,
      retry: false,
    });
    const summary = tradesQ.data?.summary;

    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric icon={Banknote} label="Open stake" value={fmtUSD(summary?.stakeOpen ?? 0)} />
          <Metric icon={ArrowDownToLine} label="Live buy side" value={`${summary?.buyPct ?? 0}%`} />
          <Metric icon={Landmark} label="Live sell side" value={`${summary?.sellPct ?? 0}%`} />
          <Metric
            icon={Shield}
            label="Resolved retained"
            value={fmtUSD(summary?.netRetained ?? 0)}
          />
          <Metric
            icon={CalendarDays}
            label="Open / won / lost"
            value={`${summary?.open ?? 0} / ${summary?.won ?? 0} / ${summary?.lost ?? 0}`}
          />
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-border px-5 py-3 font-semibold">
            Live and recent trades
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 text-left">Time</th>
                  <th className="p-3 text-left">Client</th>
                  <th className="p-3 text-left">Market</th>
                  <th className="p-3 text-left">Contract</th>
                  <th className="p-3 text-right">Stake</th>
                  <th className="p-3 text-right">Payout</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-right">Entry</th>
                  <th className="p-3 text-right">Exit</th>
                  <th className="p-3 text-left">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {((tradesQ.data?.trades ?? []) as AdminTrade[]).map((trade) => (
                  <tr key={trade.id} className="border-b border-border/60">
                    <td className="p-3 text-muted-foreground">
                      {new Date(trade.opened_at).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="font-medium">
                        {trade.profile?.full_name ??
                          trade.profile?.email ??
                          trade.user_id.slice(0, 8)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {trade.profile?.phone ?? ""}
                      </div>
                    </td>
                    <td className="p-3 font-medium">{trade.pair}</td>
                    <td className="p-3">
                      <div className="font-medium">
                        {trade.contract_type.replace("_", "/")} · {trade.direction}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {trade.barrier_digit == null
                          ? `${trade.duration_seconds}s`
                          : `barrier ${trade.barrier_digit} · ${trade.duration_seconds}s`}
                      </div>
                    </td>
                    <td className="p-3 text-right tabular">{fmtUSD(Number(trade.stake_kes))}</td>
                    <td className="p-3 text-right tabular">{fmtUSD(Number(trade.payout_kes))}</td>
                    <td className="p-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          trade.status === "won"
                            ? "bg-bull/20 text-bull"
                            : trade.status === "lost"
                              ? "bg-bear/20 text-bear"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {trade.status}
                      </span>
                    </td>
                    <td className="p-3 text-right font-mono">
                      {Number(trade.entry_price).toFixed(5)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {trade.exit_price == null ? "-" : Number(trade.exit_price).toFixed(5)}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(trade.expires_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {(tradesQ.data?.trades ?? []).length === 0 && (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-muted-foreground">
                      No trades found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  function OverviewPanel({ overview }: { overview: AdminOverview | undefined }) {
    const withdrawFn = useServerFn(adminWithdrawDaraja);
    const [phone, setPhone] = useState("");
    const [amount, setAmount] = useState("");
    const withdrawMut = useMutation({
      mutationFn: (vars: { amount: number; phone: string }) => withdrawFn({ data: vars }),
      onSuccess: () => {
        toast.success("Daraja withdrawal initiated");
        setAmount("");
        qc.invalidateQueries({ queryKey: ["admin-overview"] });
      },
      onError: (error: Error) => toast.error(error.message),
    });

    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Metric
            icon={Landmark}
            label="Total user balances"
            value={fmtUSD(overview?.totalUserBalance ?? 0)}
          />
          <Metric
            icon={Shield}
            label="Locked admin credits"
            value={fmtUSD(overview?.totalLockedBalance ?? 0)}
          />
          <Metric
            icon={Users}
            label="Users / agents"
            value={`${overview?.users?.length ?? 0} / ${overview?.agentCount ?? 0}`}
          />
        </div>
        {overview?.darajaError && (
          <Card className="border-destructive/40 p-4 text-sm text-destructive">
            {overview.darajaError}
          </Card>
        )}
        <Card className="space-y-4 p-5">
          <div>
            <h2 className="font-semibold">Withdraw Daraja wallet to M-Pesa</h2>
            <p className="text-sm text-muted-foreground">
              Sends real merchant wallet funds to the phone number specified here.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <Label htmlFor="admin-phone">M-Pesa phone</Label>
              <Input
                id="admin-phone"
                placeholder="07XXXXXXXX"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="admin-amount">Amount (USD)</Label>
              <Input
                id="admin-amount"
                type="number"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  const nextAmount = Number(amount);
                  if (!phone || !nextAmount) {
                    toast.error("Phone and amount required");
                    return;
                  }
                  withdrawMut.mutate({ amount: nextAmount, phone });
                }}
                disabled={withdrawMut.isPending}
              >
                Withdraw
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }
}

function filterPeople(people: Person[], search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) return people;
  return people.filter((person) =>
    [personName(person), person.email, person.phone, person.referral_code, person.id]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)),
  );
}

function PanelHeader({
  title,
  description,
  search,
  setSearch,
}: {
  title: string;
  description: string;
  search: string;
  setSearch: (value: string) => void;
}) {
  return (
    <div className="grid gap-4 border-b border-border p-5 md:grid-cols-[1fr_320px] md:items-center">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, phone"
          className="pl-9"
        />
      </div>
    </div>
  );
}

function PeopleTable({
  people,
  action,
  empty,
}: {
  people: Person[];
  action: (person: Person) => React.ReactNode;
  empty: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <PeopleHead extra="Action" />
        <tbody>
          {people.length === 0 && (
            <tr>
              <td colSpan={7} className="p-8 text-center text-muted-foreground">
                {empty}
              </td>
            </tr>
          )}
          {people.map((person) => (
            <tr key={person.id} className="border-b border-border/60">
              <PersonCells person={person} />
              <td className="p-3">{action(person)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PeopleHead({ extra }: { extra: string }) {
  return (
    <thead className="bg-muted/40 text-xs text-muted-foreground">
      <tr>
        <th className="p-3 text-left">Name</th>
        <th className="p-3 text-left">Phone</th>
        <th className="p-3 text-left">Roles</th>
        <th className="p-3 text-right">Balance</th>
        <th className="p-3 text-right">Locked</th>
        <th className="p-3 text-right">Withdrawable</th>
        <th className="p-3 text-left">{extra}</th>
      </tr>
    </thead>
  );
}

function PersonCells({ person }: { person: Person }) {
  return (
    <>
      <td className="p-3">
        <div className="font-medium">{personName(person)}</div>
        <div className="text-xs text-muted-foreground">{person.email ?? "-"}</div>
        <div className="text-[11px] text-muted-foreground">Ref: {person.referral_code ?? "-"}</div>
      </td>
      <td className="p-3">{person.phone ?? "-"}</td>
      <td className="p-3">
        <div className="flex flex-wrap gap-1">
          {(person.roles.length ? person.roles : ["client"]).map((role) => (
            <span key={role} className="rounded bg-muted px-2 py-0.5 text-xs">
              {role}
            </span>
          ))}
        </div>
      </td>
      <td className="p-3 text-right tabular">{fmtUSD(person.balance)}</td>
      <td className="p-3 text-right tabular">{fmtUSD(person.nonWithdrawable)}</td>
      <td className="p-3 text-right tabular">{fmtUSD(person.withdrawable)}</td>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="space-y-1 p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="text-2xl font-bold tabular">{value}</div>
    </Card>
  );
}

function SecretAdminLogo({ onExit }: { onExit: () => void }) {
  const [taps, setTaps] = useState(0);
  useEffect(() => {
    if (taps === 0) return;
    const id = window.setTimeout(() => setTaps(0), 1500);
    return () => window.clearTimeout(id);
  }, [taps]);

  function onTap() {
    const next = taps + 1;
    if (next >= 5) {
      setTaps(0);
      onExit();
      return;
    }
    setTaps(next);
  }

  return (
    <button onClick={onTap} className="flex items-center gap-2" aria-label="TronixOption admin">
      <img src="/tronixoption-mark.png" alt="" width={30} height={30} className="h-8 w-8 rounded-md" />
      <span className="font-semibold tracking-tight">Admin Panel</span>
    </button>
  );
}
