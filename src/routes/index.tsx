import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, TrendingUp, Smartphone, Zap, ShieldCheck, Users, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pesa Trade — Forex trading with M-Pesa" },
      { name: "description", content: "Trade major forex pairs from Kenya. Fund instantly with M-Pesa STK push, open positions in seconds, withdraw to your phone." },
      { property: "og:title", content: "Pesa Trade — Forex trading with M-Pesa" },
      { property: "og:description", content: "Live spot prices on EUR/USD, GBP/USD, USD/KES. Deposit & withdraw via M-Pesa." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl flex items-center justify-between px-6 py-4 md:px-12">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center font-bold text-primary-foreground">P</div>
            <span className="font-semibold tracking-tight">Pesa Trade</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <a href="#trust" className="hover:text-foreground">Why us</a>
          </nav>
          <a href="/auth" className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Sign in
          </a>
        </div>
      </header>

      <main className="px-6 md:px-12">
        <section className="mx-auto max-w-6xl py-20 md:py-28">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-bull animate-pulse" />
            Live markets · M-Pesa enabled
          </div>
          <h1 className="mt-6 text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
            Trade forex from <span className="text-primary">your phone.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            Live prices on EUR/USD, GBP/USD, USD/KES and more. Top up via M-Pesa STK push, open buy/sell or 60‑second binary trades, withdraw straight to your phone.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="/auth" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">
              Start trading <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#how" className="inline-flex items-center rounded-md border border-border bg-card px-5 py-3 text-sm font-medium hover:bg-accent">
              How it works
            </a>
          </div>

          <dl className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl">
            {[
              { k: "12+", v: "Major pairs" },
              { k: "~10s", v: "STK settlement" },
              { k: "85%", v: "Binary payout" },
              { k: "24/7", v: "Markets open" },
            ].map((s) => (
              <div key={s.v} className="rounded-xl border border-border bg-card p-4">
                <dt className="text-2xl font-bold text-primary tabular">{s.k}</dt>
                <dd className="text-xs text-muted-foreground mt-1">{s.v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section id="features" className="mx-auto max-w-6xl grid gap-4 pb-20 md:grid-cols-3">
          {[
            { i: TrendingUp, t: "Live markets", d: "Real spot prices on major pairs, streamed every few seconds." },
            { i: Smartphone, t: "M-Pesa native", d: "Deposit with STK push. Withdraw directly to your phone in minutes." },
            { i: Zap, t: "Instant orders", d: "Open spot or 60-second binary trades. Close anytime, see P&L live." },
          ].map(({ i: Icon, t, d }) => (
            <div key={t} className="rounded-xl border border-border bg-card p-6 hover:border-primary/40 transition">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-semibold">{t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </section>

        <section id="how" className="mx-auto max-w-6xl pb-20">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">From signup to profit in 3 steps</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { n: "01", t: "Create an account", d: "Sign up with email and your M-Pesa number. Takes 30 seconds." },
              { n: "02", t: "Fund with M-Pesa", d: "Send any amount from KES 10. The STK push hits your phone instantly." },
              { n: "03", t: "Trade & withdraw", d: "Pick a pair, set stake, go long or short. Cash out to M-Pesa anytime." },
            ].map((s) => (
              <div key={s.n} className="rounded-xl border border-border bg-card p-6">
                <div className="text-xs font-mono text-primary">{s.n}</div>
                <h3 className="mt-2 font-semibold">{s.t}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="trust" className="mx-auto max-w-6xl pb-24 grid gap-4 md:grid-cols-3">
          {[
            { i: ShieldCheck, t: "Custodial safety", d: "Wallets are isolated per user. Withdrawals require admin review." },
            { i: BarChart3, t: "Real charts", d: "Lightweight candle charts powered by TradingView's open library." },
            { i: Users, t: "Earn referrals", d: "Invite friends and earn 15% / 10% / 5% across three tiers, paid on every win." },
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
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight">Ready to place your first trade?</h2>
            <p className="mt-3 text-muted-foreground">Sign up free. Start with KES 10. No card, no waiting.</p>
            <a href="/auth" className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:opacity-90">
              Open my account <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-6 md:px-12 py-8">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div>© {new Date().getFullYear()} Pesa Trade. Trading involves risk.</div>
          <div className="flex gap-4">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#how" className="hover:text-foreground">How it works</a>
            <Link to="/auth" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
