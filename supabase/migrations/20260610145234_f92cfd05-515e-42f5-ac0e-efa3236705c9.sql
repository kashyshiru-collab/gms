
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_kes numeric NOT NULL CHECK (amount_kes >= 1),
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | approved | paid | rejected | failed
  admin_note text,
  reference text UNIQUE,
  daraja_response jsonb,
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

CREATE POLICY "own wr select" ON public.withdrawal_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "own wr insert" ON public.withdrawal_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "admin wr update" ON public.withdrawal_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

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
  IF p_amount < 1 THEN RAISE EXCEPTION 'Minimum withdrawal is USD 1'; END IF;
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
