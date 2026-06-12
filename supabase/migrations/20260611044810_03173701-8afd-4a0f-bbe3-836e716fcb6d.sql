
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS warnings_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_burned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS force_loss boolean NOT NULL DEFAULT false;
