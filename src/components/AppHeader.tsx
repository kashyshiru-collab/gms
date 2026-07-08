import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Sparkles, Rocket, Wallet, User, LogOut, Sun, Moon, Zap, LineChart, Bitcoin, Shield, Crosshair } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyProfile } from "@/lib/trades.functions";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { applyTheme, getInitialTheme, type Theme } from "@/lib/theme";
import { AccountSwitcher } from "@/components/AccountSwitcher";
import { LOGO_URL } from "@/lib/brand";

export function AppHeader() {
  const fetchProfile = useServerFn(getMyProfile);
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    refetchInterval: 5000,
  });
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("dark");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const t = getInitialTheme();
    setTheme(t);
    applyTheme(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id);
      if (!cancelled) setIsAdmin(!!data?.some((r) => r.role === "admin"));
    })();
    return () => { cancelled = true; };
  }, [profile?.id]);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  const menu = [
    { to: "/binary", label: "Binary", icon: Zap },
    { to: "/forex", label: "Forex", icon: LineChart },
    { to: "/crypto", label: "Crypto", icon: Bitcoin },
    { to: "/predict", label: "Polymarket", icon: Sparkles },
    { to: "/aviator", label: "Aviator", icon: Rocket },
    { to: "/wallet", label: "Wallet", icon: Wallet },
  ] as const;

  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 px-3 py-2 bg-background/90 backdrop-blur-md border-b border-border">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="h-9 w-9 grid place-items-center rounded-lg bg-surface border border-border" aria-label="Menu">
            <Menu className="h-4 w-4" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 bg-background border-border p-0">
          <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
            <SheetTitle className="flex items-center gap-2">
              <img src={LOGO_URL} alt="TronixOption" className="h-8 w-8 object-contain" />
              <span className="text-base font-extrabold tracking-tight">TRONIX<span className="text-primary">OPTION</span></span>
            </SheetTitle>
          </SheetHeader>
          <nav className="p-2">
            {menu.map((m) => (
              <Link key={m.to} to={m.to} onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-sm font-semibold">
                <m.icon className="h-4 w-4 text-primary" />
                {m.label}
              </Link>
            ))}
            {isAdmin && (
              <Link to="/admin" onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-sm font-semibold">
                <Shield className="h-4 w-4 text-primary" />
                Admin
              </Link>
            )}
            <div className="my-2 h-px bg-border" />
            <div className="my-2 h-px bg-border" />
            <Link to="/scanner" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-sm font-semibold">
              <Crosshair className="h-4 w-4 text-primary" />
              AI Scanner
            </Link>
            <Link to="/profile" onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-sm font-semibold">
              <User className="h-4 w-4 text-primary" />
              Profile
            </Link>
            <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-sm font-semibold">
              {theme === "dark" ? <Sun className="h-4 w-4 text-primary" /> : <Moon className="h-4 w-4 text-primary" />}
              {theme === "dark" ? "Light theme" : "Dark theme"}
            </button>
            <button onClick={signOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface text-sm font-semibold text-bear">
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </nav>
        </SheetContent>
      </Sheet>

      <Link to="/binary" className="flex items-center gap-1.5">
        <img src={LOGO_URL} alt="TronixOption" className="h-8 w-8 object-contain drop-shadow-[0_0_10px_color-mix(in_oklab,var(--gold)_55%,transparent)]" />
        <span className="hidden sm:inline text-xs font-extrabold tracking-wider">TRONIX<span className="text-primary">OPTION</span></span>
      </Link>

      <div className="ml-auto">
        <AccountSwitcher />
      </div>
    </header>
  );
}
