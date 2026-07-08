import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
<<<<<<< HEAD
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
=======
import { useEffect, type ReactNode } from "react";
import { Toaster } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FAVICON_URL } from "@/lib/brand";

import appCss from "../styles.css?url";
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
<<<<<<< HEAD
          The page you're looking for doesn't exist.
        </p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
=======
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
<<<<<<< HEAD
        <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">Please try again.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Try again
          </button>
          <button
            onClick={() => {
              window.location.href = "/";
            }}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Go home
          </button>
=======
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
<<<<<<< HEAD
      { title: "TronixOption — Forex & synthetic trading" },
      { name: "description", content: "Trade forex, synthetic indices and digits on TronixOption. Fund instantly via M-Pesa while tracking balances in USD." },
      { property: "og:title", content: "TronixOption — Forex & synthetic trading" },
      { property: "og:description", content: "Trade forex, synthetic indices and digits on TronixOption. Fund instantly via M-Pesa while tracking balances in USD." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/tronixoption-logo.png" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "TronixOption" },
      { name: "twitter:description", content: "Trade forex, synthetic indices and digits on TronixOption." },
      { name: "twitter:image", content: "/tronixoption-logo.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
=======
      { name: "theme-color", content: "#0f1014" },
      { title: "TRONIXOPTION — Premium trading workspace" },
      { name: "description", content: "TRONIXOPTION: Real Forex, in-house binaries, Polymarket-style predictions, Aviator, and an AI Market Scanner — one premium trading workspace." },
      { name: "author", content: "TRONIXOPTION" },
      { property: "og:title", content: "TRONIXOPTION — Premium trading workspace" },
      { property: "og:description", content: "Trade Forex, Binaries, Predict markets, and Aviator with an AI Market Scanner." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: FAVICON_URL },
      { rel: "shortcut icon", href: FAVICON_URL },
      { rel: "apple-touch-icon", href: FAVICON_URL },
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
<<<<<<< HEAD
    <html lang="en" className="dark">
      <head><HeadContent /></head>
=======
    <html lang="en">
      <head>
        <HeadContent />
      </head>
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
<<<<<<< HEAD
=======
  const router = useRouter();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
<<<<<<< HEAD
      <Toaster richColors theme="dark" position="top-right" />
=======
      <Toaster position="top-center" richColors />
>>>>>>> 7af7b59 (binary: optimistic trades, tick selection, 1s mapping to normal speeds; livechart: SMA/EMA/BOLL/RSI/MACD indicators)
    </QueryClientProvider>
  );
}
