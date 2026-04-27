-- ============================================================
-- StockSafe – Migrazione 006: Depositi (Locations)
-- Versione idempotente: sicura da eseguire più volte
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Tabella locations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.locations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '📦',
  color       TEXT NOT NULL DEFAULT '#F59E0B',
  description TEXT DEFAULT '',
  sort_order  INTEGER DEFAULT 0,
  is_default  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- Elimina policy se già esiste, poi ricrea
DROP POLICY IF EXISTS "locations_owner" ON public.locations;
CREATE POLICY "locations_owner" ON public.locations
  FOR ALL USING (auth.uid() = user_id);

-- Indice
CREATE INDEX IF NOT EXISTS idx_locations_user ON public.locations(user_id, sort_order);

-- ── Colonna location_id nella tabella items ──────────────────────────────────
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS location_id UUID
  REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_items_location ON public.items(location_id);

-- ── Trigger aggiornato ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_crypto_config (user_id, salt_hex, iv_base_hex)
  VALUES (NEW.id, '', '')
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.locations (user_id, name, icon, color, description, sort_order, is_default)
  VALUES
    (NEW.id, 'Dispensa',        '🏠', '#F59E0B', 'Scorte domestiche', 0, true),
    (NEW.id, 'Zaino emergenza', '🎒', '#EF4444', 'Kit di emergenza',  1, false)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.categories (user_id, name, icon, color, is_default) VALUES
    (NEW.id, 'Alimenti',           '🥫', '#F59E0B', true),
    (NEW.id, 'Medicinali',         '💊', '#EF4444', true),
    (NEW.id, 'Batterie',           '🔋', '#10B981', true),
    (NEW.id, 'Vestiario',          '👕', '#8B5CF6', true),
    (NEW.id, 'Carte elettroniche', '💳', '#3B82F6', true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── ensure_default_categories aggiornata ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_default_categories()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  INSERT INTO public.user_crypto_config (user_id, salt_hex, iv_base_hex)
  VALUES (auth.uid(), '', '')
  ON CONFLICT (user_id) DO NOTHING;

  IF NOT EXISTS (SELECT 1 FROM public.locations WHERE user_id = auth.uid()) THEN
    INSERT INTO public.locations (user_id, name, icon, color, description, sort_order, is_default) VALUES
      (auth.uid(), 'Dispensa',        '🏠', '#F59E0B', 'Scorte domestiche', 0, true),
      (auth.uid(), 'Zaino emergenza', '🎒', '#EF4444', 'Kit di emergenza',  1, false);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.categories WHERE user_id = auth.uid()) THEN
    INSERT INTO public.categories (user_id, name, icon, color, is_default) VALUES
      (auth.uid(), 'Alimenti',           '🥫', '#F59E0B', true),
      (auth.uid(), 'Medicinali',         '💊', '#EF4444', true),
      (auth.uid(), 'Batterie',           '🔋', '#10B981', true),
      (auth.uid(), 'Vestiario',          '👕', '#8B5CF6', true),
      (auth.uid(), 'Carte elettroniche', '💳', '#3B82F6', true);
  END IF;
END;
$$;

COMMENT ON TABLE public.locations IS 'Depositi utente (es. Dispensa, Zaino emergenza)';
COMMENT ON COLUMN public.items.location_id IS 'Deposito di appartenenza dell''articolo';
