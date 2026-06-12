
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
  IF NOT EXISTS (
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
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'seed-activity-events') THEN
    PERFORM cron.unschedule('seed-activity-events');
  END IF;
END $$;

SELECT cron.schedule('seed-activity-events', '* * * * *', $$SELECT public.seed_activity_event();$$);
