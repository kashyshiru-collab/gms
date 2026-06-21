CREATE TABLE public.binary_trades (
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

CREATE INDEX idx_binary_trades_user_opened ON public.binary_trades (user_id, opened_at DESC);
CREATE INDEX idx_binary_trades_open_expiry ON public.binary_trades (expires_at) WHERE status = 'open';

GRANT SELECT ON public.binary_trades TO authenticated;
GRANT ALL ON public.binary_trades TO service_role;

ALTER TABLE public.binary_trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own binary select" ON public.binary_trades FOR SELECT TO authenticated USING (auth.uid() = user_id);

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