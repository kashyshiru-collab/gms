-- Allow the shortest digit/binary contract to resolve after one chart tick.
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
    RAISE EXCEPTION 'Invalid contract';
  END IF;
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

CREATE OR REPLACE FUNCTION public.open_binary_trade(
  p_pair text, p_direction text, p_stake numeric, p_duration integer, p_entry numeric
) RETURNS public.binary_trades
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  UPDATE public.wallets SET balance_kes = balance_kes - p_stake, updated_at = now()
    WHERE user_id = v_user;

  INSERT INTO public.binary_trades (user_id, pair, direction, stake_kes, duration_seconds, entry_price, expires_at)
    VALUES (v_user, p_pair, p_direction, p_stake, p_duration, p_entry, now() + (p_duration || ' seconds')::interval)
    RETURNING * INTO v_trade;

  INSERT INTO public.transactions (user_id, type, amount_kes, status, reference, meta)
    VALUES (v_user, 'binary_open', -p_stake, 'success', 'bopen_' || v_trade.id,
      jsonb_build_object('trade_id', v_trade.id, 'pair', p_pair, 'direction', p_direction, 'entry', p_entry, 'duration', p_duration));
  RETURN v_trade;
END; $$;

REVOKE EXECUTE ON FUNCTION public.open_digit_trade(text, text, text, smallint, numeric, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_digit_trade(text, text, text, smallint, numeric, integer, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.open_binary_trade(text, text, numeric, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_binary_trade(text, text, numeric, integer, numeric) TO authenticated;
