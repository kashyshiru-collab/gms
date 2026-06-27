-- Add Aviator crash-game history and Polymarket-style prediction markets.

CREATE TABLE IF NOT EXISTS public.aviator_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stake_kes numeric NOT NULL CHECK (stake_kes > 0),
  cashout_multiplier numeric NOT NULL CHECK (cashout_multiplier >= 1),
  crash_multiplier numeric NOT NULL CHECK (crash_multiplier >= 1),
  payout_kes numeric NOT NULL DEFAULT 0,
  seed_hash text NOT NULL,
  client_seed text,
  status text NOT NULL DEFAULT 'lost' CHECK (status IN ('won','lost')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aviator_rounds_user_created_idx
  ON public.aviator_rounds(user_id, created_at DESC);

GRANT SELECT ON public.aviator_rounds TO authenticated;
GRANT ALL ON public.aviator_rounds TO service_role;

ALTER TABLE public.aviator_rounds ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'aviator_rounds'
      AND policyname = 'own aviator rounds select'
  ) THEN
    CREATE POLICY "own aviator rounds select"
      ON public.aviator_rounds
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.poly_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','void')),
  outcome text CHECK (outcome IN ('yes','no')),
  min_bet_kes numeric NOT NULL DEFAULT 2 CHECK (min_bet_kes >= 2),
  closes_at timestamptz,
  resolved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poly_markets_status_created_idx
  ON public.poly_markets(status, created_at DESC);

GRANT SELECT ON public.poly_markets TO authenticated;
GRANT ALL ON public.poly_markets TO service_role;

ALTER TABLE public.poly_markets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'poly_markets'
      AND policyname = 'authenticated read poly markets'
  ) THEN
    CREATE POLICY "authenticated read poly markets"
      ON public.poly_markets
      FOR SELECT TO authenticated
      USING (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.poly_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.poly_markets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('yes','no')),
  amount_kes numeric NOT NULL CHECK (amount_kes >= 2),
  quoted_multiplier numeric NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','refund')),
  payout_kes numeric NOT NULL DEFAULT 0,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS poly_bets_market_idx ON public.poly_bets(market_id);
CREATE INDEX IF NOT EXISTS poly_bets_user_created_idx ON public.poly_bets(user_id, created_at DESC);

GRANT SELECT ON public.poly_bets TO authenticated;
GRANT ALL ON public.poly_bets TO service_role;

ALTER TABLE public.poly_bets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'poly_bets'
      AND policyname = 'own poly bets select'
  ) THEN
    CREATE POLICY "own poly bets select"
      ON public.poly_bets
      FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;
