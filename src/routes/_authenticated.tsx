import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { reconcilePendingDeposits, getMyStatus } from "@/lib/wallet.functions";
import { toast } from "sonner";
import { useEffect, useRef } from "react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedShell,
});

function AuthedShell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reconcileFn = useServerFn(reconcilePendingDeposits);
  const statusFn = useServerFn(getMyStatus);
  const burnedRef = useRef(false);

  useQuery({
    queryKey: ["reconcile-deposits-global"],
    queryFn: async () => {
      const r = await reconcileFn();
      if (r.credited > 0) {
        toast.success(`Deposit confirmed: ${r.credited} credited to your wallet`);
        qc.invalidateQueries({ queryKey: ["dash"] });
        qc.invalidateQueries({ queryKey: ["admin-stats"] });
      }
      return r;
    },
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  });

  const statusQ = useQuery({
    queryKey: ["my-status"],
    queryFn: () => statusFn(),
    refetchInterval: 15_000,
    retry: false,
  });

  useEffect(() => {
    if (statusQ.data?.is_burned && !burnedRef.current) {
      burnedRef.current = true;
      (async () => {
        toast.error("Your account has been disabled. Please contact support.");
        await qc.cancelQueries();
        qc.clear();
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
      })();
    }
  }, [statusQ.data?.is_burned, navigate, qc]);

  return <Outlet />;
}
