ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agent';

ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS non_withdrawable_kes numeric NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.request_withdrawal(p_amount numeric, p_phone text)
RETURNS public.withdrawal_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance numeric;
  v_locked numeric;
  v_ref text := 'wd_' || substr(replace(gen_random_uuid()::text,'-',''),1,16);
  v_req public.withdrawal_requests;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_amount < 1 THEN RAISE EXCEPTION 'Minimum withdrawal is USD 1'; END IF;

  SELECT balance_kes, COALESCE(non_withdrawable_kes, 0)
    INTO v_balance, v_locked
  FROM public.wallets
  WHERE user_id = v_user
  FOR UPDATE;

  IF v_balance IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF GREATEST(v_balance - v_locked, 0) < p_amount THEN
    RAISE EXCEPTION 'Insufficient withdrawable balance';
  END IF;

  UPDATE public.wallets
    SET balance_kes = balance_kes - p_amount, updated_at = now()
  WHERE user_id = v_user;

  INSERT INTO public.withdrawal_requests(user_id, amount_kes, phone, status, reference)
    VALUES (v_user, p_amount, p_phone, 'pending', v_ref)
    RETURNING * INTO v_req;

  INSERT INTO public.transactions(user_id, type, amount_kes, status, reference, meta)
    VALUES (v_user, 'withdraw_hold', -p_amount, 'success', v_ref,
      jsonb_build_object('request_id', v_req.id));

  RETURN v_req;
END; $$;
