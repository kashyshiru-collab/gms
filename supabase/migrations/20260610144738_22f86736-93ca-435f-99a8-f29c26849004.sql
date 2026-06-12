
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

CREATE POLICY "own referrals select" ON public.referrals
  FOR SELECT TO authenticated USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

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

CREATE POLICY "own commissions select" ON public.referral_commissions
  FOR SELECT TO authenticated USING (auth.uid() = referrer_id);

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
