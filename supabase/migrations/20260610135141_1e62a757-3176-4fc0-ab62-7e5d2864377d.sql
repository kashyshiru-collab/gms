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