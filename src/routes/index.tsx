<<<<<<< HEAD
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TronixOption - Mobile gambling markets" },
      {
        name: "description",
        content:
          "Mobile gambling markets from your phone. Fund instantly with M-Pesa, manage risk, and withdraw to your number.",
      },
      { property: "og:title", content: "TronixOption - Mobile gambling markets" },
      {
        property: "og:description",
        content:
          "Mobile gambling markets with M-Pesa deposits, clear charts, and direct withdrawals.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-12">
          <div className="flex items-center gap-2">
            <img
              src="/tronixoption-logo.png"
              alt="TronixOption"
              width={150}
              height={54}
              className="h-10 w-auto"
            />
          </div>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
            <a href="#trust" className="hover:text-foreground">
              Why us
            </a>
          </nav>
          <a
            href="/auth"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Log in
          </a>
        </div>
      </header>

      <main className="px-6 md:px-12">
        <section className="mx-auto max-w-6xl py-20 md:py-28">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-bull" />
            18+ mobile trading - M-Pesa enabled
          </div>
          <img
            src="/tronixoption-logo.png"
            alt="TronixOption"
            width={360}
            height={135}
            className="mt-6 h-auto w-full max-w-sm"
          />
          <h1 className="mt-6 text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
            Start earning today by <span className="text-primary">trading.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Follow live movement, choose a stake, place fixed-time bets, and manage each position
            with a clear balance, chart, and bet history.
          </p>
          <p className="mt-4 max-w-2xl text-sm font-medium text-muted-foreground">
            18+ only. Gambling involves financial risks and can be addictive. Please play
            responsibly and only risk what you can afford to lose.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/auth"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Create account <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#how"
              className="inline-flex items-center rounded-md border border-border bg-card px-5 py-3 text-sm font-medium hover:bg-accent"
            >
              How it works
            </a>
          </div>

          <dl className="mt-14 grid max-w-3xl grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { k: "24/7", v: "Markets" },
              { k: "~10s", v: "STK settlement" },
              { k: "Clear", v: "Risk per bet" },
              { k: "USD 3", v: "Start small" },
            ].map((s) => (
              <div key={s.v} className="rounded-xl border border-border bg-card p-4">
                <dt className="text-2xl font-bold tabular text-primary">{s.k}</dt>
                <dd className="mt-1 text-xs text-muted-foreground">{s.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="features" className="mx-auto grid max-w-6xl gap-4 pb-20 md:grid-cols-3">
          {[
            {
              i: TrendingUp,
              t: "Live markets",
              d: "Watch synthetic and forex-style gambling markets with live prices and compact mobile charts.",
            },
            {
              i: Smartphone,
              t: "M-Pesa native",
              d: "Deposit with STK push. Withdraw directly to your phone in minutes.",
            },
            {
              i: Zap,
              t: "Fast betting",
              d: "Pick a market, set your stake, choose a direction, and track every open bet.",
            },
          ].map(({ i: Icon, t, d }) => (
            <div
              key={t}
              className="rounded-xl border border-border bg-card p-6 transition hover:border-primary/40"
            >
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </section>

        <section id="how" className="mx-auto max-w-6xl pb-20">
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            From account to first bet in 3 steps
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              {
                n: "01",
                t: "Create an account",
                d: "Enter your details, open the email confirmation link, then log in.",
              },
              {
                n: "02",
                t: "Fund with M-Pesa",
                d: "Send any amount from USD 3. The STK push hits your phone instantly.",
              },
              {
                n: "03",
                t: "Bet and withdraw",
                d: "Choose a market, place a bet, and withdraw available funds to M-Pesa anytime.",
              },
            ].map((s) => (
              <div key={s.n} className="rounded-xl border border-border bg-card p-6">
                <div className="font-mono text-xs text-primary">{s.n}</div>
                <h3 className="mt-2 font-semibold">{s.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="trust" className="mx-auto grid max-w-6xl gap-4 pb-24 md:grid-cols-3">
          {[
            {
              i: ShieldCheck,
              t: "Custodial safety",
              d: "Wallets are isolated per user. Withdrawals are sent to M-Pesa automatically.",
            },
            {
              i: BarChart3,
              t: "Clear charts",
              d: "Simple market views help you follow movement before choosing a wager.",
            },
            {
              i: Users,
              t: "Earn referrals",
              d: "Invite friends and earn 15% / 10% / 5% across three tiers when referral rewards apply.",
            },
          ].map(({ i: Icon, t, d }) => (
            <div key={t} className="rounded-xl border border-border bg-card p-6">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </section>

        <section className="mx-auto max-w-4xl pb-24 text-center">
          <div className="rounded-2xl border border-border bg-card p-10">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">Ready to start?</h2>
            <p className="mt-3 text-muted-foreground">
              Create your account free. Start with USD 3. No card, no waiting.
            </p>
            <a
              href="/auth"
              className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Create account <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-6 py-8 md:px-12">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 text-xs text-muted-foreground md:flex-row md:items-start md:justify-between">
          <div className="max-w-md space-y-2">
            <div>&copy; {new Date().getFullYear()} TronixOption. All rights reserved.</div>
            <p>
              18+ only. Gambling involves financial risks and can be addictive. Please play
              responsibly and only risk what you can afford to lose.
            </p>
          </div>
          <div className="flex gap-4">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#how" className="hover:text-foreground">
              How it works
            </a>
            <Link to="/auth" className="hover:text-foreground">
              Log in
            </Link>
          </div>
        </div>
      </footer>
=======
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Activity, BarChart3, Plane, ShieldCheck, Smartphone, Zap } from "lucide-react";
import { useRef, useState } from "react";
import { LOGO_URL } from "@/lib/brand";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "TRONIXOPTION - Trading workspace" }] }),
  component: LandingPage,
});

const markets = [
  { label: "Binary", value: "Vol 75", tone: "text-primary", icon: Zap },
  { label: "Forex", value: "EUR/USD", tone: "text-bull", icon: BarChart3 },
  { label: "Crypto", value: "BTC/USD", tone: "text-bear", icon: Activity },
  { label: "Aviator", value: "Global rounds", tone: "text-primary", icon: Plane },
];

function LandingPage() {
  const navigate = useNavigate();
  const [logoClicks, setLogoClicks] = useState(0);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleLogoClick(e: React.MouseEvent) {
    e.preventDefault();
    if (resetTimer.current) clearTimeout(resetTimer.current);
    const next = logoClicks + 1;
    setLogoClicks(next);
    if (next >= 7) {
      setLogoClicks(0);
      navigate({ to: "/admin-setup" });
      return;
    }
    resetTimer.current = setTimeout(() => setLogoClicks(0), 1800);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" onClick={handleLogoClick} className="flex items-center gap-2.5">
            <img src={LOGO_URL} alt="TRONIXOPTION" className="h-10 w-10 object-contain" />
            <span className="text-base font-extrabold tracking-wider">TRONIX<span className="text-primary">OPTION</span></span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/auth" className="px-3 py-2 text-sm font-bold text-muted-foreground hover:text-foreground">Sign in</Link>
            <Link to="/auth" className="rounded-lg bg-primary px-3 py-2 text-sm font-extrabold text-primary-foreground glow-primary">Create account</Link>
          </div>
        </div>
      </header>

      <section className="relative isolate min-h-[92vh] overflow-hidden pt-16">
        <MarketBackdrop />
        <div className="relative mx-auto grid min-h-[calc(92vh-4rem)] max-w-6xl content-center gap-10 px-4 py-12 lg:grid-cols-[1fr_420px] lg:items-center">
          <div className="max-w-3xl">
            <div className="mb-5 flex items-center gap-3">
              <button type="button" onClick={handleLogoClick} aria-label="TRONIXOPTION logo" className="rounded-xl">
                <img src={LOGO_URL} alt="" className="h-16 w-16 object-contain drop-shadow-[0_0_24px_color-mix(in_oklab,var(--gold)_55%,transparent)]" />
              </button>
              <div className="text-xs font-bold uppercase tracking-[0.28em] text-primary">Trading workspace</div>
            </div>
            <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-normal sm:text-6xl lg:text-7xl">
              TRONIX<span className="text-primary">OPTION</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg">
              Trade binary markets, Forex, crypto, prediction events, and synced Aviator rounds from one focused dashboard.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link to="/auth" className="rounded-xl bg-primary px-5 py-3 text-sm font-extrabold text-primary-foreground glow-primary">Start trading</Link>
              <Link to="/auth" className="rounded-xl border border-border bg-surface px-5 py-3 text-sm font-bold text-foreground">Access account</Link>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card/90 p-3 shadow-2xl backdrop-blur">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live workspace</span>
              <span className="live-dot" />
            </div>
            <div className="space-y-2">
              {markets.map(({ label, value, tone, icon: Icon }) => (
                <div key={label} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
                  <div className={"grid h-9 w-9 place-items-center rounded-lg bg-background " + tone}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold">{label}</div>
                    <div className="text-xs text-muted-foreground">{value}</div>
                  </div>
                  <div className={"text-sm font-extrabold tabular-nums " + tone}>{label === "Aviator" ? "2.14x" : "+0.42%"}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Feature icon={<Smartphone className="h-4 w-4" />} label="M-Pesa ready" />
              <Feature icon={<ShieldCheck className="h-4 w-4" />} label="Demo + real" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Feature({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-bold text-muted-foreground">
      <span className="text-primary">{icon}</span>
      {label}
    </div>
  );
}

function MarketBackdrop() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-background">
      <div className="absolute inset-0 opacity-60" style={{ backgroundImage: "linear-gradient(to right, color-mix(in oklab, var(--border) 55%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--border) 45%, transparent) 1px, transparent 1px)", backgroundSize: "54px 54px" }} />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-[linear-gradient(180deg,transparent,var(--background)_72%)]" />
      <div className="absolute left-0 right-0 top-[18%] flex h-64 items-end gap-3 px-4 opacity-70 sm:px-10">
        {Array.from({ length: 34 }).map((_, i) => {
          const up = i % 3 !== 0;
          const h = 36 + ((i * 29) % 150);
          return (
            <span key={i} className="relative flex flex-1 items-end justify-center">
              <span className={"absolute bottom-0 w-px " + (up ? "bg-bull/70" : "bg-bear/70")} style={{ height: `${h + 34}px` }} />
              <span className={"w-full max-w-3 rounded-sm " + (up ? "bg-bull" : "bg-bear")} style={{ height: `${h}px`, animation: `market-rise ${2.4 + (i % 5) * 0.22}s ease-in-out infinite`, animationDelay: `${i * 55}ms` }} />
            </span>
          );
        })}
      </div>
      <style>{`
        @keyframes market-rise {
          0%, 100% { transform: translateY(0); opacity: 0.82; }
          50% { transform: translateY(-12px); opacity: 1; }
        }
      `}</style>
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
    </div>
  );
}
