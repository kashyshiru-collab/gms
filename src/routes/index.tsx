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
              src="/gmx-logo.png"
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
            src="/gmx-logo.png"
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
              d: "Wallets are isolated per user. Withdrawals require admin review.",
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
    </div>
  );
}
