CREATE OR REPLACE FUNCTION public.attach_referrer(p_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_l1 uuid;
  v_l2 uuid;
  v_l3 uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = v_user) THEN RETURN; END IF;

  SELECT p.id
    INTO v_l1
  FROM public.profiles p
  WHERE p.referral_code = upper(trim(p_code))
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = p.id
        AND ur.role = 'agent'::public.app_role
    );

  IF v_l1 IS NULL OR v_l1 = v_user THEN RETURN; END IF;

  INSERT INTO public.referrals(referrer_id, referred_id, level)
    VALUES (v_l1, v_user, 1)
  ON CONFLICT DO NOTHING;

  SELECT referrer_id INTO v_l2 FROM public.referrals WHERE referred_id = v_l1 AND level = 1;
  IF v_l2 IS NOT NULL AND v_l2 <> v_user THEN
    INSERT INTO public.referrals(referrer_id, referred_id, level)
      VALUES (v_l2, v_user, 2)
    ON CONFLICT DO NOTHING;

    SELECT referrer_id INTO v_l3 FROM public.referrals WHERE referred_id = v_l2 AND level = 1;
    IF v_l3 IS NOT NULL AND v_l3 <> v_user THEN
      INSERT INTO public.referrals(referrer_id, referred_id, level)
        VALUES (v_l3, v_user, 3)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END; $$;
