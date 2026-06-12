-- === FILE: 20260610014655_0f2a3c8b-7e4c-4c9e-b5df-d49fc415639e.sql ===
-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own profile select'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own profile update'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own profile insert'
      AND n.nspname = 'public'
      AND c.relname = 'profiles'
  ) THEN
    CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- wallets
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  balance_kes NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own wallet select'
      AND n.nspname = 'public'
      AND c.relname = 'wallets'
  ) THEN
    CREATE POLICY "own wallet select" ON public.wallets FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'deposit','withdraw','trade_open','trade_close',
    'binary_open','binary_close',
    'withdraw_hold','withdraw_refund','withdraw_paid','admin_withdraw','admin_credit','admin_debit',
    'referral_commission','bonus','fee','reconcile'
  )),
  amount_kes NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  reference TEXT,
  payhero_reference TEXT,
  mpesa_receipt TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON public.transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_ref ON public.transactions(reference);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own tx select'
      AND n.nspname = 'public'
      AND c.relname = 'transactions'
  ) THEN
    CREATE POLICY "own tx select" ON public.transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- positions
CREATE TABLE IF NOT EXISTS public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  pair TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  stake_kes NUMERIC(14,2) NOT NULL,
  entry_price NUMERIC(18,6) NOT NULL,
  exit_price NUMERIC(18,6),
  pnl_kes NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pos_user ON public.positions(user_id, opened_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.positions TO authenticated;
GRANT ALL ON public.positions TO service_role;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own pos select'
      AND n.nspname = 'public'
      AND c.relname = 'positions'
  ) THEN
    CREATE POLICY "own pos select" ON public.positions FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS trg_tx_updated ON public.transactions;
CREATE TRIGGER trg_tx_updated BEFORE UPDATE ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- auto provision profile + wallet on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'phone'
  );
  INSERT INTO public.wallets (user_id, balance_kes) VALUES (NEW.id, 0);
  RETURN NEW;
END; $$;
-- === FILE: 20260610014705_c3f0add3-7f85-4578-a37c-c56c356ca431.sql ===
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- === FILE: 20260610015336_044c0184-10db-4346-b998-1660a3cce98c.sql ===
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own tx insert'
      AND n.nspname = 'public'
      AND c.relname = 'transactions'
  ) THEN
    CREATE POLICY "own tx insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own tx update'
      AND n.nspname = 'public'
      AND c.relname = 'transactions'
  ) THEN
    CREATE POLICY "own tx update" ON public.transactions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own pos insert'
      AND n.nspname = 'public'
      AND c.relname = 'positions'
  ) THEN
    CREATE POLICY "own pos insert" ON public.positions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own pos update'
      AND n.nspname = 'public'
      AND c.relname = 'positions'
  ) THEN
    CREATE POLICY "own pos update" ON public.positions FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own wallet update'
      AND n.nspname = 'public'
      AND c.relname = 'wallets'
  ) THEN
    CREATE POLICY "own wallet update" ON public.wallets FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;


-- === FILE: 20260610134307_1523095c-1c66-4eba-8104-020ba3969952.sql ===
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE n.nspname = 'public' AND t.typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own roles select'
      AND n.nspname = 'public'
      AND c.relname = 'user_roles'
  ) THEN
    CREATE POLICY "own roles select" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Seed admin role for known email if the user already exists
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE email = 'gregtory03@gmail.com'
ON CONFLICT DO NOTHING;

-- Trigger to auto-grant admin on signup for the configured admin email
CREATE OR REPLACE FUNCTION public.assign_admin_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'gregtory03@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created_assign_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_assign_admin
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.assign_admin_on_signup();


-- === FILE: 20260610134322_3e96d65a-fbf7-4718-9c48-2f98acdd0705.sql ===
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.assign_admin_on_signup() FROM PUBLIC, anon, authenticated;


-- === FILE: 20260610135141_1e62a757-3176-4fc0-ab62-7e5d2864377d.sql ===
-- Atomic open: lock wallet, check, debit, insert position, log transaction
CREATE OR REPLACE FUNCTION public.open_position_atomic(
  p_pair text,
  p_side text,
  p_stake numeric,
  p_entry numeric
) RETURNS public.positions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_pos public.positions;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_side NOT IN ('buy','sell') THEN
    RAISE EXCEPTION 'Invalid side';
  END IF;
  IF p_stake <= 0 THEN
    RAISE EXCEPTION 'Stake must be positive';
  END IF;

  SELECT balance_kes INTO v_balance FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Wallet not found';
  END IF;
  IF v_balance < p_stake THEN
    RAISE EXCEPTION 'Insufficient wallet balance';
  END IF;

  UPDATE public.wallets
    SET balance_kes = balance_kes - p_stake, updated_at = now()
    WHERE user_id = v_user;

  INSERT INTO public.positions (user_id, pair, side, stake_kes, entry_price)
    VALUES (v_user, p_pair, p_side, p_stake, p_entry)
    RETURNING * INTO v_pos;

  INSERT INTO public.transactions (user_id, type, amount_kes, status, reference, meta)
    VALUES (v_user, 'trade_open', -p_stake, 'success', 'open_' || v_pos.id,
            jsonb_build_object('position_id', v_pos.id, 'symbol', p_pair, 'side', p_side, 'entry', p_entry));

  RETURN v_pos;
END; $$;

-- Atomic close: lock position+wallet, compute payout, credit, mark closed
CREATE OR REPLACE FUNCTION public.close_position_atomic(
  p_position_id uuid,
  p_exit numeric
) RETURNS public.positions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pos public.positions;
  v_pnl numeric;
  v_payout numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_pos FROM public.positions
    WHERE id = p_position_id AND user_id = v_user FOR UPDATE;
  IF v_pos IS NULL THEN
    RAISE EXCEPTION 'Position not found';
  END IF;
  IF v_pos.status = 'closed' THEN
    RAISE EXCEPTION 'Position already closed';
  END IF;

  v_pnl := v_pos.stake_kes * 50
           * CASE WHEN v_pos.side = 'buy' THEN 1 ELSE -1 END
           * ((p_exit - v_pos.entry_price) / v_pos.entry_price);
  v_payout := GREATEST(0, v_pos.stake_kes + v_pnl);

  -- Lock wallet, credit payout
  PERFORM 1 FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  UPDATE public.wallets
    SET balance_kes = balance_kes + v_payout, updated_at = now()
    WHERE user_id = v_user;

  UPDATE public.positions
    SET status = 'closed',
        exit_price = p_exit,
        pnl_kes = round(v_pnl::numeric, 2),
        closed_at = now()
    WHERE id = v_pos.id
    RETURNING * INTO v_pos;

  INSERT INTO public.transactions (user_id, type, amount_kes, status, reference, meta)
    VALUES (v_user, 'trade_close', round(v_payout::numeric, 2), 'success', 'close_' || v_pos.id,
            jsonb_build_object('position_id', v_pos.id, 'exit', p_exit, 'pnl', round(v_pnl::numeric, 2)));

  RETURN v_pos;
END; $$;

REVOKE EXECUTE ON FUNCTION public.open_position_atomic(text, text, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_position_atomic(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_position_atomic(text, text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_position_atomic(uuid, numeric) TO authenticated;


-- === FILE: 20260610135241_bc118f94-55a6-44c3-bbb8-4e6e74295080.sql ===
CREATE TABLE IF NOT EXISTS public.binary_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pair text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('up','down')),
  stake_kes numeric NOT NULL CHECK (stake_kes > 0),
  duration_seconds int NOT NULL CHECK (duration_seconds > 0),
  entry_price numeric NOT NULL,
  exit_price numeric,
  payout_kes numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','refund')),
  opened_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_binary_trades_user_opened ON public.binary_trades (user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_binary_trades_open_expiry ON public.binary_trades (expires_at) WHERE status = 'open';

GRANT SELECT ON public.binary_trades TO authenticated;
GRANT ALL ON public.binary_trades TO service_role;

ALTER TABLE public.binary_trades ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own binary select'
      AND n.nspname = 'public'
      AND c.relname = 'binary_trades'
  ) THEN
    CREATE POLICY "own binary select" ON public.binary_trades FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- Atomic open
CREATE OR REPLACE FUNCTION public.open_binary_trade(
  p_pair text,
  p_direction text,
  p_stake numeric,
  p_duration int,
  p_entry numeric
) RETURNS public.binary_trades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_trade public.binary_trades;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_direction NOT IN ('up','down') THEN RAISE EXCEPTION 'Invalid direction'; END IF;
  IF p_stake <= 0 THEN RAISE EXCEPTION 'Stake must be positive'; END IF;
  IF p_duration NOT IN (30, 60, 120, 300) THEN RAISE EXCEPTION 'Invalid duration'; END IF;

  SELECT balance_kes INTO v_balance FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_balance < p_stake THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  UPDATE public.wallets
    SET balance_kes = balance_kes - p_stake, updated_at = now()
    WHERE user_id = v_user;

  INSERT INTO public.binary_trades (
    user_id, pair, direction, stake_kes, duration_seconds, entry_price, expires_at
  ) VALUES (
    v_user, p_pair, p_direction, p_stake, p_duration, p_entry,
    now() + (p_duration || ' seconds')::interval
  ) RETURNING * INTO v_trade;

  INSERT INTO public.transactions (user_id, type, amount_kes, status, reference, meta)
    VALUES (v_user, 'binary_open', -p_stake, 'success', 'bopen_' || v_trade.id,
            jsonb_build_object('trade_id', v_trade.id, 'pair', p_pair, 'direction', p_direction, 'entry', p_entry, 'duration', p_duration));

  RETURN v_trade;
END; $$;

-- Resolver: called by service_role with the trade id and current spot
CREATE OR REPLACE FUNCTION public.resolve_binary_trade(
  p_trade_id uuid,
  p_exit numeric
) RETURNS public.binary_trades
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_t public.binary_trades;
  v_won boolean;
  v_status text;
  v_payout numeric;
BEGIN
  SELECT * INTO v_t FROM public.binary_trades WHERE id = p_trade_id FOR UPDATE;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v_t.status <> 'open' THEN RETURN v_t; END IF;

  IF p_exit = v_t.entry_price THEN
    v_status := 'refund';
    v_payout := v_t.stake_kes;
  ELSIF (v_t.direction = 'up' AND p_exit > v_t.entry_price)
     OR (v_t.direction = 'down' AND p_exit < v_t.entry_price) THEN
    v_status := 'won';
    v_payout := round((v_t.stake_kes * 1.85)::numeric, 2);
  ELSE
    v_status := 'lost';
    v_payout := 0;
  END IF;

  IF v_payout > 0 THEN
    PERFORM 1 FROM public.wallets WHERE user_id = v_t.user_id FOR UPDATE;
    UPDATE public.wallets
      SET balance_kes = balance_kes + v_payout, updated_at = now()
      WHERE user_id = v_t.user_id;
  END IF;

  UPDATE public.binary_trades
    SET status = v_status, exit_price = p_exit, payout_kes = v_payout, resolved_at = now()
    WHERE id = v_t.id
    RETURNING * INTO v_t;

  INSERT INTO public.transactions (user_id, type, amount_kes, status, reference, meta)
    VALUES (v_t.user_id, 'binary_close', v_payout, 'success', 'bclose_' || v_t.id,
            jsonb_build_object('trade_id', v_t.id, 'entry', v_t.entry_price, 'exit', p_exit, 'result', v_status, 'stake', v_t.stake_kes));

  RETURN v_t;
END; $$;

REVOKE EXECUTE ON FUNCTION public.open_binary_trade(text, text, numeric, int, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_binary_trade(text, text, numeric, int, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_binary_trade(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_binary_trade(uuid, numeric) TO service_role;


-- === FILE: 20260610144738_22f86736-93ca-435f-99a8-f29c26849004.sql ===
-- 1. referral_code on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code text UNIQUE;

CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT upper(substr(md5(gen_random_uuid()::text), 1, 8))
$$;

-- Backfill existing rows
UPDATE public.profiles
  SET referral_code = public.gen_referral_code()
  WHERE referral_code IS NULL;

-- Default for new rows + ensure handle_new_user populates it
ALTER TABLE public.profiles
  ALTER COLUMN referral_code SET DEFAULT public.gen_referral_code();

-- 2. referrals table (one row per (referrer, referred) at given level)
CREATE TABLE IF NOT EXISTS public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level int NOT NULL CHECK (level BETWEEN 1 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (referrer_id, referred_id, level)
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS referrals_referred_idx ON public.referrals(referred_id);

GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own referrals select'
      AND n.nspname = 'public'
      AND c.relname = 'referrals'
  ) THEN
    CREATE POLICY "own referrals select" ON public.referrals
  FOR SELECT TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
  END IF;
END $$;

-- 3. referral_commissions: credited rows
CREATE TABLE IF NOT EXISTS public.referral_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_tx_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  level int NOT NULL CHECK (level BETWEEN 1 AND 3),
  profit_kes numeric NOT NULL,
  rate numeric NOT NULL,
  amount_kes numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rc_referrer_idx ON public.referral_commissions(referrer_id, created_at DESC);

GRANT SELECT ON public.referral_commissions TO authenticated;
GRANT ALL ON public.referral_commissions TO service_role;
ALTER TABLE public.referral_commissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own commissions select'
      AND n.nspname = 'public'
      AND c.relname = 'referral_commissions'
  ) THEN
    CREATE POLICY "own commissions select" ON public.referral_commissions
  FOR SELECT TO authenticated USING (auth.uid() = referrer_id);
  END IF;
END $$;

-- 4. Update handle_new_user to set referral_code
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, referral_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'phone',
    public.gen_referral_code()
  );
  INSERT INTO public.wallets (user_id, balance_kes) VALUES (NEW.id, 0);
  RETURN NEW;
END; $$;

-- 5. attach_referrer RPC: given a code, create L1/L2/L3 chain for current user
CREATE OR REPLACE FUNCTION public.attach_referrer(p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_l1 uuid;
  v_l2 uuid;
  v_l3 uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_code IS NULL OR length(p_code) = 0 THEN RETURN; END IF;

  -- Already has any referrer? skip
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = v_user) THEN RETURN; END IF;

  SELECT id INTO v_l1 FROM public.profiles WHERE referral_code = upper(p_code);
  IF v_l1 IS NULL OR v_l1 = v_user THEN RETURN; END IF;

  INSERT INTO public.referrals(referrer_id, referred_id, level) VALUES (v_l1, v_user, 1)
    ON CONFLICT DO NOTHING;

  -- L2: who referred v_l1 (their L1 referrer)
  SELECT referrer_id INTO v_l2 FROM public.referrals WHERE referred_id = v_l1 AND level = 1;
  IF v_l2 IS NOT NULL AND v_l2 <> v_user THEN
    INSERT INTO public.referrals(referrer_id, referred_id, level) VALUES (v_l2, v_user, 2)
      ON CONFLICT DO NOTHING;

    SELECT referrer_id INTO v_l3 FROM public.referrals WHERE referred_id = v_l2 AND level = 1;
    IF v_l3 IS NOT NULL AND v_l3 <> v_user THEN
      INSERT INTO public.referrals(referrer_id, referred_id, level) VALUES (v_l3, v_user, 3)
        ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END; $$;

-- 6. Commission trigger: on winning binary or position close, credit uplines
CREATE OR REPLACE FUNCTION public.credit_referral_commissions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profit numeric := 0;
  v_stake numeric;
  v_rate numeric;
  v_amount numeric;
  v_upline RECORD;
  v_rates numeric[] := ARRAY[0.15, 0.10, 0.05];
BEGIN
  -- Only on successful trade closes
  IF NEW.status <> 'success' THEN RETURN NEW; END IF;

  IF NEW.type = 'binary_close' THEN
    -- amount_kes is payout (0 on loss, stake*1.85 on win, stake on refund)
    v_stake := COALESCE((NEW.meta->>'stake')::numeric, 0);
    v_profit := GREATEST(0, NEW.amount_kes - v_stake);
  ELSIF NEW.type = 'trade_close' THEN
    v_profit := GREATEST(0, COALESCE((NEW.meta->>'pnl')::numeric, 0));
  ELSE
    RETURN NEW;
  END IF;

  IF v_profit <= 0 THEN RETURN NEW; END IF;

  FOR v_upline IN
    SELECT referrer_id, level FROM public.referrals WHERE referred_id = NEW.user_id AND level BETWEEN 1 AND 3
  LOOP
    v_rate := v_rates[v_upline.level];
    v_amount := round((v_profit * v_rate)::numeric, 2);
    IF v_amount <= 0 THEN CONTINUE; END IF;

    -- Credit upline wallet
    PERFORM 1 FROM public.wallets WHERE user_id = v_upline.referrer_id FOR UPDATE;
    UPDATE public.wallets SET balance_kes = balance_kes + v_amount, updated_at = now()
      WHERE user_id = v_upline.referrer_id;

    INSERT INTO public.referral_commissions(referrer_id, referred_id, source_tx_id, level, profit_kes, rate, amount_kes)
      VALUES (v_upline.referrer_id, NEW.user_id, NEW.id, v_upline.level, v_profit, v_rate, v_amount);

    INSERT INTO public.transactions(user_id, type, amount_kes, status, reference, meta)
      VALUES (v_upline.referrer_id, 'referral_commission', v_amount, 'success',
              'refcom_' || NEW.id || '_l' || v_upline.level,
              jsonb_build_object('source_tx', NEW.id, 'referred', NEW.user_id, 'level', v_upline.level, 'rate', v_rate, 'profit', v_profit));
  END LOOP;

  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_credit_referral_commissions ON public.transactions;
CREATE TRIGGER trg_credit_referral_commissions
  AFTER INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.credit_referral_commissions();


-- === FILE: 20260610145048_e2ce8603-5f37-4f4d-bccd-0463fb59444a.sql ===
-- 1. Table
CREATE TABLE IF NOT EXISTS public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,           -- 'win' | 'deposit' | 'withdraw' | 'signup'
  display_name text NOT NULL,   -- masked, e.g. "Mwilu K."
  amount_kes numeric,
  pair text,
  source text NOT NULL DEFAULT 'real',  -- 'real' | 'seed'
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_events_created_idx ON public.activity_events(created_at DESC);

GRANT SELECT ON public.activity_events TO anon, authenticated;
GRANT ALL ON public.activity_events TO service_role;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'anyone can read activity'
      AND n.nspname = 'public'
      AND c.relname = 'activity_events'
  ) THEN
    CREATE POLICY "anyone can read activity" ON public.activity_events
      FOR SELECT TO anon, authenticated USING (true);
  END IF;
END $$;

-- 2. Realtime
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
  AND NOT EXISTS (
    SELECT 1
    FROM pg_publication p
    JOIN pg_publication_rel r ON p.oid = r.prpubid
    JOIN pg_class c ON r.prrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'activity_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_events;
  END IF;
END $$;

-- 3. Helper: mask a display name from a profile
CREATE OR REPLACE FUNCTION public.mask_display_name(p_user uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_first text;
  v_rest text;
BEGIN
  SELECT COALESCE(full_name, split_part(email, '@', 1)) INTO v_name FROM public.profiles WHERE id = p_user;
  IF v_name IS NULL OR length(v_name) = 0 THEN RETURN 'Trader'; END IF;
  v_first := split_part(v_name, ' ', 1);
  v_rest := split_part(v_name, ' ', 2);
  IF length(v_rest) > 0 THEN
    RETURN initcap(v_first) || ' ' || upper(left(v_rest, 1)) || '.';
  END IF;
  RETURN initcap(v_first);
END; $$;

-- 4. Trigger to emit events from transactions
CREATE OR REPLACE FUNCTION public.emit_activity_from_tx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_stake numeric;
  v_profit numeric;
BEGIN
  IF NEW.status <> 'success' THEN RETURN NEW; END IF;
  v_name := public.mask_display_name(NEW.user_id);

  IF NEW.type = 'deposit' THEN
    INSERT INTO public.activity_events(kind, display_name, amount_kes, source, meta)
      VALUES ('deposit', v_name, NEW.amount_kes, 'real', jsonb_build_object('tx', NEW.id));
  ELSIF NEW.type = 'binary_close' THEN
    v_stake := COALESCE((NEW.meta->>'stake')::numeric, 0);
    v_profit := GREATEST(0, NEW.amount_kes - v_stake);
    IF v_profit > 0 THEN
      INSERT INTO public.activity_events(kind, display_name, amount_kes, pair, source, meta)
        VALUES ('win', v_name, v_profit, NEW.meta->>'pair', 'real', jsonb_build_object('tx', NEW.id, 'kind', 'binary'));
    END IF;
  ELSIF NEW.type = 'trade_close' THEN
    v_profit := COALESCE((NEW.meta->>'pnl')::numeric, 0);
    IF v_profit > 0 THEN
      INSERT INTO public.activity_events(kind, display_name, amount_kes, pair, source, meta)
        VALUES ('win', v_name, v_profit, NEW.meta->>'symbol', 'real', jsonb_build_object('tx', NEW.id, 'kind', 'spot'));
    END IF;
  ELSIF NEW.type = 'admin_withdraw' THEN
    INSERT INTO public.activity_events(kind, display_name, amount_kes, source, meta)
      VALUES ('withdraw', v_name, NEW.amount_kes, 'real', jsonb_build_object('tx', NEW.id));
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_emit_activity ON public.transactions;
CREATE TRIGGER trg_emit_activity
  AFTER INSERT OR UPDATE OF status ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.emit_activity_from_tx();

-- 5. Seeder: insert one simulated event
CREATE OR REPLACE FUNCTION public.seed_activity_event()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_first text[] := ARRAY['Mwilu','Wanjiku','Otieno','Achieng','Kamau','Njeri','Kiprop','Chebet','Mutua','Nyambura','Omondi','Auma','Kibet','Mwende','Wafula','Akinyi','Maina','Nyokabi','Onyango','Wairimu'];
  v_last text[] := ARRAY['K','M','O','W','N','A','C','J','L','S'];
  v_pairs text[] := ARRAY['EURUSD','GBPUSD','USDJPY','XAUUSD','USDKES','BTCUSD'];
  v_kinds text[] := ARRAY['win','win','win','deposit','withdraw'];
  v_kind text;
  v_name text;
  v_amount numeric;
  v_pair text;
BEGIN
  v_kind := v_kinds[1 + floor(random() * array_length(v_kinds, 1))::int];
  v_name := v_first[1 + floor(random() * array_length(v_first, 1))::int] || ' ' ||
            v_last[1 + floor(random() * array_length(v_last, 1))::int] || '.';
  IF v_kind = 'win' THEN
    v_amount := round((150 + random() * 9500)::numeric, 0);
    v_pair := v_pairs[1 + floor(random() * array_length(v_pairs, 1))::int];
  ELSIF v_kind = 'deposit' THEN
    v_amount := round((100 + random() * 4900)::numeric, 0);
  ELSE
    v_amount := round((500 + random() * 19500)::numeric, 0);
  END IF;
  INSERT INTO public.activity_events(kind, display_name, amount_kes, pair, source)
    VALUES (v_kind, v_name, v_amount, v_pair, 'seed');

  -- Trim to last 500 rows
  DELETE FROM public.activity_events
    WHERE id IN (SELECT id FROM public.activity_events ORDER BY created_at DESC OFFSET 500);
END; $$;

-- 6. Schedule: one seed every minute
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron is not available; skipping activity event schedule';
END $$;

DO $$ BEGIN
  IF to_regnamespace('cron') IS NOT NULL THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'seed-activity-events') THEN
        PERFORM cron.unschedule('seed-activity-events');
      END IF;
      PERFORM cron.schedule('seed-activity-events', '* * * * *', 'SELECT public.seed_activity_event();');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron schedule skipped: %', SQLERRM;
    END;
  END IF;
END $$;


-- === FILE: 20260610145234_f92cfd05-515e-42f5-ac0e-efa3236705c9.sql ===
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_kes numeric NOT NULL CHECK (amount_kes >= 10),
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | paid | rejected | failed
  admin_note text,
  reference text UNIQUE,
  payhero_response jsonb,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wr_user_idx ON public.withdrawal_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wr_status_idx ON public.withdrawal_requests(status, created_at DESC);

GRANT SELECT, INSERT ON public.withdrawal_requests TO authenticated;
GRANT ALL ON public.withdrawal_requests TO service_role;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own wr select'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawal_requests'
  ) THEN
    CREATE POLICY "own wr select" ON public.withdrawal_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'own wr insert'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawal_requests'
  ) THEN
    CREATE POLICY "own wr insert" ON public.withdrawal_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'admin wr update'
      AND n.nspname = 'public'
      AND c.relname = 'withdrawal_requests'
  ) THEN
    CREATE POLICY "admin wr update" ON public.withdrawal_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_wr_touch ON public.withdrawal_requests;
CREATE TRIGGER trg_wr_touch
  BEFORE UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Atomic: lock wallet, check, debit, create pending request
CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric, p_phone text)
RETURNS public.withdrawal_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_req public.withdrawal_requests;
  v_ref text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount < 10 THEN RAISE EXCEPTION 'Minimum withdrawal is KES 10'; END IF;
  IF p_phone IS NULL OR length(p_phone) < 9 THEN RAISE EXCEPTION 'Valid M-Pesa phone required'; END IF;

  SELECT balance_kes INTO v_balance FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  UPDATE public.wallets
    SET balance_kes = balance_kes - p_amount, updated_at = now()
    WHERE user_id = v_user;

  v_ref := 'wd_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.withdrawal_requests(user_id, amount_kes, phone, status, reference)
    VALUES (v_user, p_amount, p_phone, 'pending', v_ref)
    RETURNING * INTO v_req;

  INSERT INTO public.transactions(user_id, type, amount_kes, status, reference, meta)
    VALUES (v_user, 'withdraw_hold', -p_amount, 'success', v_ref,
            jsonb_build_object('request_id', v_req.id, 'phone', p_phone));

  RETURN v_req;
END; $$;

REVOKE EXECUTE ON FUNCTION public.request_withdrawal(numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text) TO authenticated;

-- Refund: admin-only / service-only path (called by server fn after assertAdmin or after payout failure)
CREATE OR REPLACE FUNCTION public.refund_withdrawal(p_request_id uuid, p_reason text)
RETURNS public.withdrawal_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_req public.withdrawal_requests;
BEGIN
  SELECT * INTO v_req FROM public.withdrawal_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.status IN ('rejected','paid','failed') THEN RETURN v_req; END IF;

  PERFORM 1 FROM public.wallets WHERE user_id = v_req.user_id FOR UPDATE;
  UPDATE public.wallets SET balance_kes = balance_kes + v_req.amount_kes, updated_at = now()
    WHERE user_id = v_req.user_id;

  UPDATE public.withdrawal_requests
    SET status = 'rejected', admin_note = p_reason, reviewed_at = now()
    WHERE id = v_req.id
    RETURNING * INTO v_req;

  INSERT INTO public.transactions(user_id, type, amount_kes, status, reference, meta)
    VALUES (v_req.user_id, 'withdraw_refund', v_req.amount_kes, 'success',
            'refund_' || v_req.id, jsonb_build_object('request_id', v_req.id, 'reason', p_reason));

  RETURN v_req;
END; $$;

REVOKE EXECUTE ON FUNCTION public.refund_withdrawal(uuid, text) FROM PUBLIC, anon, authenticated;


-- === FILE: 20260610151332_1dd47a49-db9f-4c52-b695-ad52900d5a49.sql ===
-- Ensure trigger exists on auth.users to create profile + wallet + assign admin
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_created_assign_admin ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.assign_admin_on_signup();

-- Backfill missing profiles
INSERT INTO public.profiles (id, email, full_name, phone, referral_code)
SELECT u.id, u.email,
       COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
       u.raw_user_meta_data->>'phone',
       public.gen_referral_code()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Backfill missing wallets
INSERT INTO public.wallets (user_id, balance_kes)
SELECT u.id, 0
FROM auth.users u
LEFT JOIN public.wallets w ON w.user_id = u.id
WHERE w.user_id IS NULL;

-- Backfill admin role for known admin email
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role FROM auth.users u
WHERE u.email = 'gregtory03@gmail.com'
ON CONFLICT DO NOTHING;


-- === FILE: 20260610152834_d58e05ce-f2dc-4777-93cf-66f0ca8b8037.sql ===
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (type IN (
  'deposit','withdraw','trade_open','trade_close',
  'binary_open','binary_close',
  'withdraw_hold','withdraw_refund','withdraw_paid','admin_withdraw','admin_credit','admin_debit',
  'referral_commission','bonus','fee','reconcile'
));


-- === FILE: 20260610191215_20337978-0fc1-4eba-87c9-a1b585c4e745.sql ===
-- 1) Market overrides drive price across all users and trade settlement
CREATE TABLE IF NOT EXISTS public.market_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  start_at timestamptz NOT NULL DEFAULT now(),
  end_at timestamptz NOT NULL,
  revert_seconds integer NOT NULL DEFAULT 300,
  target_price numeric NOT NULL,
  start_price numeric NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS market_overrides_symbol_active_idx ON public.market_overrides(symbol, active, end_at);

GRANT SELECT ON public.market_overrides TO authenticated, anon;
GRANT ALL  ON public.market_overrides TO service_role;
ALTER TABLE public.market_overrides ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies p
    JOIN pg_class c ON p.polrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE p.polname = 'anyone read overrides'
      AND n.nspname = 'public'
      AND c.relname = 'market_overrides'
  ) THEN
    CREATE POLICY "anyone read overrides" ON public.market_overrides FOR SELECT USING (true);
  END IF;
END $$;

-- 2) Extend binary_trades to carry digit-contract variants
ALTER TABLE public.binary_trades
  ADD COLUMN IF NOT EXISTS contract_type text NOT NULL DEFAULT 'rise_fall',
  ADD COLUMN IF NOT EXISTS barrier_digit smallint;

-- Replace constraint on direction to allow new prediction tokens
ALTER TABLE public.binary_trades
  DROP CONSTRAINT IF EXISTS binary_trades_direction_check;
ALTER TABLE public.binary_trades
  ADD CONSTRAINT binary_trades_direction_check
  CHECK (direction IN ('up','down','matches','differs','even','odd','over','under'));

-- 3) Open digit trade RPC (reuses wallet locking pattern)
CREATE OR REPLACE FUNCTION public.open_digit_trade(
  p_pair text, p_contract text, p_prediction text,
  p_barrier smallint, p_stake numeric, p_duration integer, p_entry numeric
) RETURNS public.binary_trades
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_trade public.binary_trades;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_contract NOT IN ('rise_fall','matches','differs','even','odd','over','under') THEN
    RAISE EXCEPTION 'Invalid contract'; END IF;
  IF p_stake <= 0 THEN RAISE EXCEPTION 'Stake must be positive'; END IF;
  IF p_duration < 1 OR p_duration > 300 THEN RAISE EXCEPTION 'Invalid duration'; END IF;

  SELECT balance_kes INTO v_balance FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_balance < p_stake THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;

  UPDATE public.wallets SET balance_kes = balance_kes - p_stake, updated_at = now()
    WHERE user_id = v_user;

  INSERT INTO public.binary_trades (
    user_id, pair, direction, stake_kes, duration_seconds, entry_price, expires_at,
    contract_type, barrier_digit
  ) VALUES (
    v_user, p_pair, p_prediction, p_stake, p_duration, p_entry,
    now() + (p_duration || ' seconds')::interval,
    p_contract, p_barrier
  ) RETURNING * INTO v_trade;

  INSERT INTO public.transactions (user_id, type, amount_kes, status, reference, meta)
    VALUES (v_user, 'binary_open', -p_stake, 'success', 'bopen_' || v_trade.id,
      jsonb_build_object('trade_id', v_trade.id, 'pair', p_pair, 'contract', p_contract,
        'prediction', p_prediction, 'barrier', p_barrier, 'entry', p_entry, 'duration', p_duration));
  RETURN v_trade;
END; $$;

REVOKE EXECUTE ON FUNCTION public.open_digit_trade(text, text, text, smallint, numeric, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_digit_trade(text, text, text, smallint, numeric, integer, numeric) TO authenticated;

-- 4) Resolve digit trade RPC — handles all contract types
CREATE OR REPLACE FUNCTION public.resolve_digit_trade(p_trade_id uuid, p_exit numeric)
RETURNS public.binary_trades
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t public.binary_trades;
  v_won boolean := false;
  v_status text;
  v_payout numeric;
  v_digit smallint;
  v_payout_mul numeric := 1.85;
BEGIN
  SELECT * INTO v_t FROM public.binary_trades WHERE id = p_trade_id FOR UPDATE;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v_t.status <> 'open' THEN RETURN v_t; END IF;

  -- last digit = floor(price * 1e5) mod 10 (use 5 decimal precision uniformly)
  v_digit := (floor(p_exit * 100000)::bigint % 10)::smallint;

  IF v_t.contract_type = 'rise_fall' THEN
    IF p_exit = v_t.entry_price THEN
      v_status := 'refund'; v_payout := v_t.stake_kes;
    ELSIF (v_t.direction = 'up' AND p_exit > v_t.entry_price)
       OR (v_t.direction = 'down' AND p_exit < v_t.entry_price) THEN
      v_won := true;
    END IF;
  ELSIF v_t.contract_type = 'matches' THEN
    v_won := (v_digit = v_t.barrier_digit);
    v_payout_mul := 9.5;
  ELSIF v_t.contract_type = 'differs' THEN
    v_won := (v_digit <> v_t.barrier_digit);
    v_payout_mul := 1.10;
  ELSIF v_t.contract_type = 'even' THEN
    v_won := ((v_digit % 2) = 0);
  ELSIF v_t.contract_type = 'odd' THEN
    v_won := ((v_digit % 2) = 1);
  ELSIF v_t.contract_type = 'over' THEN
    v_won := (v_digit > v_t.barrier_digit);
    v_payout_mul := CASE
      WHEN v_t.barrier_digit = 0 THEN 1.10 WHEN v_t.barrier_digit = 1 THEN 1.25
      WHEN v_t.barrier_digit = 2 THEN 1.40 WHEN v_t.barrier_digit = 3 THEN 1.60
      WHEN v_t.barrier_digit = 4 THEN 1.85 WHEN v_t.barrier_digit = 5 THEN 2.20
      WHEN v_t.barrier_digit = 6 THEN 2.80 WHEN v_t.barrier_digit = 7 THEN 3.80
      WHEN v_t.barrier_digit = 8 THEN 7.50 ELSE 1.10 END;
  ELSIF v_t.contract_type = 'under' THEN
    v_won := (v_digit < v_t.barrier_digit);
    v_payout_mul := CASE
      WHEN v_t.barrier_digit = 9 THEN 1.10 WHEN v_t.barrier_digit = 8 THEN 1.25
      WHEN v_t.barrier_digit = 7 THEN 1.40 WHEN v_t.barrier_digit = 6 THEN 1.60
      WHEN v_t.barrier_digit = 5 THEN 1.85 WHEN v_t.barrier_digit = 4 THEN 2.20
      WHEN v_t.barrier_digit = 3 THEN 2.80 WHEN v_t.barrier_digit = 2 THEN 3.80
      WHEN v_t.barrier_digit = 1 THEN 7.50 ELSE 1.10 END;
  END IF;

  IF v_status IS NULL THEN
    IF v_won THEN
      v_status := 'won'; v_payout := round((v_t.stake_kes * v_payout_mul)::numeric, 2);
    ELSE
      v_status := 'lost'; v_payout := 0;
    END IF;
  END IF;

  IF v_payout > 0 THEN
    PERFORM 1 FROM public.wallets WHERE user_id = v_t.user_id FOR UPDATE;
    UPDATE public.wallets SET balance_kes = balance_kes + v_payout, updated_at = now()
      WHERE user_id = v_t.user_id;
  END IF;

  UPDATE public.binary_trades
    SET status = v_status, exit_price = p_exit, payout_kes = v_payout, resolved_at = now()
    WHERE id = v_t.id RETURNING * INTO v_t;

  INSERT INTO public.transactions (user_id, type, amount_kes, status, reference, meta)
    VALUES (v_t.user_id, 'binary_close', v_payout, 'success', 'bclose_' || v_t.id,
      jsonb_build_object('trade_id', v_t.id, 'entry', v_t.entry_price, 'exit', p_exit,
        'result', v_status, 'stake', v_t.stake_kes, 'contract', v_t.contract_type,
        'prediction', v_t.direction, 'digit', v_digit));
  RETURN v_t;
END; $$;

REVOKE EXECUTE ON FUNCTION public.resolve_digit_trade(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_digit_trade(uuid, numeric) TO service_role;

-- 5) Allow new duration values (15s) on existing open_binary_trade
CREATE OR REPLACE FUNCTION public.open_binary_trade(p_pair text, p_direction text, p_stake numeric, p_duration integer, p_entry numeric)
 RETURNS public.binary_trades
 LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_trade public.binary_trades;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_direction NOT IN ('up','down') THEN RAISE EXCEPTION 'Invalid direction'; END IF;
  IF p_stake <= 0 THEN RAISE EXCEPTION 'Stake must be positive'; END IF;
  IF p_duration < 1 OR p_duration > 300 THEN RAISE EXCEPTION 'Invalid duration'; END IF;
  SELECT balance_kes INTO v_balance FROM public.wallets WHERE user_id = v_user FOR UPDATE;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_balance < p_stake THEN RAISE EXCEPTION 'Insufficient wallet balance'; END IF;
  UPDATE public.wallets SET balance_kes = balance_kes - p_stake, updated_at = now() WHERE user_id = v_user;
  INSERT INTO public.binary_trades (user_id, pair, direction, stake_kes, duration_seconds, entry_price, expires_at)
    VALUES (v_user, p_pair, p_direction, p_stake, p_duration, p_entry, now() + (p_duration || ' seconds')::interval)
    RETURNING * INTO v_trade;
  INSERT INTO public.transactions (user_id, type, amount_kes, status, reference, meta)
    VALUES (v_user, 'binary_open', -p_stake, 'success', 'bopen_' || v_trade.id,
      jsonb_build_object('trade_id', v_trade.id, 'pair', p_pair, 'direction', p_direction, 'entry', p_entry, 'duration', p_duration));
  RETURN v_trade;
END; $function$;


-- === FILE: 20260611044810_03173701-8afd-4a0f-bbe3-836e716fcb6d.sql ===
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS warnings_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_burned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_loss boolean NOT NULL DEFAULT false;


-- === FILE: 20260612053000_profile_signup_details.sql ===
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS second_name text,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'KES';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    first_name,
    second_name,
    full_name,
    phone,
    currency,
    referral_code
  )
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'second_name',
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      trim(concat_ws(' ', NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'second_name')),
      NEW.raw_user_meta_data->>'name'
    ),
    NEW.raw_user_meta_data->>'phone',
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'currency', ''), 'KES'),
    public.gen_referral_code()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = COALESCE(EXCLUDED.first_name, public.profiles.first_name),
    second_name = COALESCE(EXCLUDED.second_name, public.profiles.second_name),
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    phone = COALESCE(EXCLUDED.phone, public.profiles.phone),
    currency = COALESCE(EXCLUDED.currency, public.profiles.currency);

  INSERT INTO public.wallets (user_id, balance_kes)
  VALUES (NEW.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END; $$;
