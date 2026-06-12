import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, LineChart, ArrowUpFromLine, User, LifeBuoy, Users } from "lucide-react";
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
  const items: { to: string; label: string; icon: LucideIcon }[] = [
    { to: "/dashboard", label: "Trading", icon: LineChart },
    { to: "/withdrawals", label: "Withdrawals", icon: ArrowUpFromLine },
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
              key={it.to}
              to={it.to}
              onClick={() => setOpen(false)}
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
