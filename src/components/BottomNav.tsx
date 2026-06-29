import { Link } from "@tanstack/react-router";
import { Zap, Crosshair, Clock } from "lucide-react";

const items = [
  { to: "/binary", label: "Trade", icon: Zap },
  { to: "/scanner", label: "AI Scanner", icon: Crosshair },
  { to: "/positions", label: "Positions", icon: Clock },
] as const;

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-background/90 backdrop-blur-md border-t border-border">
      <ul className="grid grid-cols-3 max-w-3xl mx-auto">
        {items.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              activeProps={{ className: "text-primary" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold transition-colors"
            >
              {({ isActive }) => (
                <>
                  <span className={"grid place-items-center h-9 w-14 rounded-xl transition-all " + (isActive ? "bg-primary/15 glow-primary" : "")}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="leading-none">{label}</span>
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
