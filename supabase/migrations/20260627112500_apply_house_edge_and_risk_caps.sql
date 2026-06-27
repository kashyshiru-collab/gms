-- Align server-side settlement with the current TronixOption risk model.

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
  IF p_stake <= 0 OR p_stake > 500 THEN
    RAISE EXCEPTION 'Invalid stake';
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
  v_raw_pnl numeric;
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

  v_raw_pnl := v_pos.stake_kes * 12
           * CASE WHEN v_pos.side = 'buy' THEN 1 ELSE -1 END
           * ((p_exit - v_pos.entry_price) / v_pos.entry_price);
  v_pnl := LEAST(v_raw_pnl, v_pos.stake_kes * 0.35);
  v_payout := GREATEST(0, v_pos.stake_kes + v_pnl);

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

CREATE OR REPLACE FUNCTION public.open_binary_trade(
  p_pair text,
  p_direction text,
  p_stake numeric,
  p_duration integer,
  p_entry numeric
) RETURNS public.binary_trades
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_trade public.binary_trades;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_direction NOT IN ('up','down') THEN RAISE EXCEPTION 'Invalid direction'; END IF;
  IF p_stake <= 0 OR p_stake > 500 THEN RAISE EXCEPTION 'Invalid stake'; END IF;
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
  IF p_contract NOT IN ('rise_fall','even','odd','over','under') THEN
    RAISE EXCEPTION 'Invalid contract';
  END IF;
  IF p_prediction NOT IN ('up','down','even','odd','over','under') THEN
    RAISE EXCEPTION 'Invalid prediction';
  END IF;
  IF p_contract IN ('over','under') AND p_barrier IS NULL THEN
    RAISE EXCEPTION 'Barrier is required';
  END IF;
  IF p_stake <= 0 OR p_stake > 500 THEN RAISE EXCEPTION 'Invalid stake'; END IF;
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
    v_payout := round((v_t.stake_kes * 1.72)::numeric, 2);
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

CREATE OR REPLACE FUNCTION public.resolve_digit_trade(p_trade_id uuid, p_exit numeric)
RETURNS public.binary_trades
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t public.binary_trades;
  v_won boolean := false;
  v_status text;
  v_payout numeric;
  v_digit smallint;
  v_payout_mul numeric := 1.72;
BEGIN
  SELECT * INTO v_t FROM public.binary_trades WHERE id = p_trade_id FOR UPDATE;
  IF v_t IS NULL THEN RAISE EXCEPTION 'Trade not found'; END IF;
  IF v_t.status <> 'open' THEN RETURN v_t; END IF;

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
    v_payout_mul := 8.2;
  ELSIF v_t.contract_type = 'differs' THEN
    v_won := (v_digit <> v_t.barrier_digit);
    v_payout_mul := 1.03;
  ELSIF v_t.contract_type = 'even' THEN
    v_won := ((v_digit % 2) = 0);
  ELSIF v_t.contract_type = 'odd' THEN
    v_won := ((v_digit % 2) = 1);
  ELSIF v_t.contract_type = 'over' THEN
    v_won := (v_digit > v_t.barrier_digit);
    v_payout_mul := CASE
      WHEN v_t.barrier_digit = 0 THEN 1.03 WHEN v_t.barrier_digit = 1 THEN 1.10
      WHEN v_t.barrier_digit = 2 THEN 1.18 WHEN v_t.barrier_digit = 3 THEN 1.30
      WHEN v_t.barrier_digit = 4 THEN 1.48 WHEN v_t.barrier_digit = 5 THEN 1.70
      WHEN v_t.barrier_digit = 6 THEN 2.05 WHEN v_t.barrier_digit = 7 THEN 2.55
      WHEN v_t.barrier_digit = 8 THEN 3.20 ELSE 1.03 END;
  ELSIF v_t.contract_type = 'under' THEN
    v_won := (v_digit < v_t.barrier_digit);
    v_payout_mul := CASE
      WHEN v_t.barrier_digit = 9 THEN 1.03 WHEN v_t.barrier_digit = 8 THEN 1.10
      WHEN v_t.barrier_digit = 7 THEN 1.18 WHEN v_t.barrier_digit = 6 THEN 1.30
      WHEN v_t.barrier_digit = 5 THEN 1.48 WHEN v_t.barrier_digit = 4 THEN 1.70
      WHEN v_t.barrier_digit = 3 THEN 2.05 WHEN v_t.barrier_digit = 2 THEN 2.55
      WHEN v_t.barrier_digit = 1 THEN 3.20 ELSE 1.03 END;
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

REVOKE EXECUTE ON FUNCTION public.open_position_atomic(text, text, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.close_position_atomic(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_position_atomic(text, text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_position_atomic(uuid, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.open_binary_trade(text, text, numeric, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_binary_trade(text, text, numeric, integer, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.open_digit_trade(text, text, text, smallint, numeric, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_digit_trade(text, text, text, smallint, numeric, integer, numeric) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_binary_trade(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_binary_trade(uuid, numeric) TO service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_digit_trade(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_digit_trade(uuid, numeric) TO service_role;
