
-- 1) Market overrides drive price across all users and trade settlement
CREATE TABLE public.market_overrides (
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
CREATE INDEX market_overrides_symbol_active_idx ON public.market_overrides(symbol, active, end_at);

GRANT SELECT ON public.market_overrides TO authenticated, anon;
GRANT ALL  ON public.market_overrides TO service_role;
ALTER TABLE public.market_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone read overrides" ON public.market_overrides FOR SELECT USING (true);

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
  IF p_duration NOT IN (15, 30, 60, 120, 300) THEN RAISE EXCEPTION 'Invalid duration'; END IF;

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
  IF p_duration NOT IN (15, 30, 60, 120, 300) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
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
