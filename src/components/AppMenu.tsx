import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Menu,
  BarChart3,
  CircleDollarSign,
  Plane,
  Scale,
  User,
  LifeBuoy,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function AppMenu({
  isAdmin = false,
  isAgent = false,
}: {
  isAdmin?: boolean;
  isAgent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const items: { to: string; label: string; icon: LucideIcon; mode?: "binary" | "forex" }[] = [
    { to: "/dashboard", label: "Binary", icon: BarChart3, mode: "binary" },
    { to: "/dashboard", label: "Forex", icon: CircleDollarSign, mode: "forex" },
    { to: "/aviator", label: "Aviator", icon: Plane },
    { to: "/polymarket", label: "Polymarket", icon: Scale },
    { to: "/wallet", label: "Wallet", icon: Wallet },
    { to: "/profile", label: "Profile", icon: User },
    { to: "/support", label: "Support", icon: LifeBuoy },
    ...(isAgent ? [{ to: "/referrals", label: "Referrals", icon: Users }] : []),
  ];
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" title="Menu" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 p-0">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col py-2">
          {items.map((it) => (
            <Link
              key={`${it.to}-${it.label}`}
              to={it.to}
              onClick={() => {
                if (it.mode) {
                  localStorage.setItem("tronix-trading-mode", it.mode);
                  window.dispatchEvent(new CustomEvent("tronix-trading-mode", { detail: it.mode }));
                }
                setOpen(false);
              }}
              className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-accent transition-colors"
              activeProps={{ className: "bg-accent font-medium text-primary" }}
            >
              <it.icon className="h-4 w-4" />
              <span>{it.label}</span>
            </Link>
          ))}
          {isAdmin && <span className="sr-only">Admin access enabled</span>}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
