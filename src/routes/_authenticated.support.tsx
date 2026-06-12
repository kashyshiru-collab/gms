import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkIsAdmin } from "@/lib/admin.functions";
import { AppMenu } from "@/components/AppMenu";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Mail, MessageCircle, Phone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [{ title: "Support — Pesa Trade" }] }),
  component: SupportPage,
});

function SupportPage() {
  const adminFn = useServerFn(checkIsAdmin);
  const adminQ = useQuery({ queryKey: ["is-admin"], queryFn: () => adminFn(), staleTime: 60_000, retry: false });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <AppMenu isAdmin={adminQ.data?.isAdmin} />
            <h1 className="font-semibold">Support</h1>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
          </Button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <div className="rounded-xl border border-border bg-card p-5 space-y-1">
          <h2 className="text-lg font-semibold">We're here to help</h2>
          <p className="text-sm text-muted-foreground">
            Reach out any time — our team typically responds within a few hours.
          </p>
        </div>

        <div className="grid gap-3">
          <Contact icon={MessageCircle} label="WhatsApp" value="+254 700 000 000" href="https://wa.me/254700000000" />
          <Contact icon={Mail} label="Email" value="support@pesatrade.app" href="mailto:support@pesatrade.app" />
          <Contact icon={Phone} label="Call" value="+254 700 000 000" href="tel:+254700000000" />
        </div>

        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <h3 className="font-medium">Frequently asked</h3>
          <FAQ q="Why is my withdrawal pending?" a="Withdrawals are reviewed before being released to M-Pesa. This usually takes a few minutes." />
          <FAQ q="Why can't I withdraw yet?" a="To keep the platform safe, you must complete at least 5 trades on your most recent deposit before withdrawing." />
          <FAQ q="What does 'account warning' mean?" a="It means you've attempted to withdraw before meeting the trading requirement. A second warning may permanently disable your account." />
        </div>
      </main>
    </div>
  );
}

function Contact({ icon: Icon, label, value, href }: { icon: any; label: string; value: string; href: string }) {
  return (
    <a href={href} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 hover:bg-accent transition-colors">
      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
    </a>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <div className="text-sm font-medium">{q}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{a}</div>
    </div>
  );
}
