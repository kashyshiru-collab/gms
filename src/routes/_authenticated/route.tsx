import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DebugConsole } from "@/components/DebugConsole";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.user.id);
      if (!cancelled) setIsAdmin(!!data?.some((row) => row.role === "admin"));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen pb-20 max-w-3xl mx-auto">
      <AppHeader />
      <main className="px-3 py-3">
        <Outlet />
      </main>
      {isAdmin && <DebugConsole />}
      <BottomNav />
    </div>
  );
}
