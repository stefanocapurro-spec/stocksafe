-- ============================================================
-- StockSafe – Migrazione 003: Fix RLS registrazione
--
-- PROBLEMA: dopo signUp con conferma email abilitata,
-- auth.uid() è NULL → il policy blocca l'INSERT.
--
-- SOLUZIONE:
-- 1. Trigger su auth.users → crea riga placeholder automaticamente
-- 2. RPC con SECURITY DEFINER → completa il setup senza sessione
-- ============================================================

-- ── 1. Trigger: crea riga placeholder alla creazione utente ─────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Crea placeholder con salt vuoto; verrà completato dalla RPC
  INSERT INTO public.user_crypto_config (user_id, salt_hex, iv_base_hex)
  VALUES (NEW.id, '', '')
  ON CONFLICT (user_id) DO NOTHING;

  -- Crea categorie predefinite
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

-- Rimuovi se esiste e ricrea
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ── 2. RPC: completa setup crypto (non richiede sessione attiva) ─────────────

CREATE OR REPLACE FUNCTION public.setup_new_user_crypto(
  p_user_id    UUID,
  p_salt_hex   TEXT,
  p_iv_base_hex TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sicurezza: funziona SOLO se:
  -- a) la riga esiste (creata dal trigger)
  -- b) il salt è ancora vuoto (setup non ancora completato)
  -- c) l'utente è stato creato negli ultimi 10 minuti
  UPDATE public.user_crypto_config
  SET
    salt_hex    = p_salt_hex,
    iv_base_hex = p_iv_base_hex,
    updated_at  = NOW()
  WHERE user_id = p_user_id
    AND salt_hex = ''
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = p_user_id
        AND created_at > NOW() - INTERVAL '10 minutes'
    );

  IF NOT FOUND THEN
    -- L'utente esiste ma il setup è già stato completato → usa la via normale
    -- Oppure è passato troppo tempo → richiede login completo
    RAISE EXCEPTION 'setup_crypto: condizioni non soddisfatte per user_id=%', p_user_id;
  END IF;
END;
$$;

-- ── 3. RPC: aggiorna crypto config (richiede sessione, chiamata dall'utente) ─

CREATE OR REPLACE FUNCTION public.update_my_crypto_config(
  p_salt_hex    TEXT,
  p_iv_base_hex TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_crypto_config
  SET salt_hex    = p_salt_hex,
      iv_base_hex = p_iv_base_hex,
      updated_at  = NOW()
  WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_crypto: utente non trovato o non autenticato';
  END IF;
END;
$$;

-- ── 4. Aggiorna RLS: aggiungi policy separata per INSERT via trigger ─────────

-- Rimuovi il vecchio policy generico (se esiste)
DROP POLICY IF EXISTS "user_crypto_config_owner" ON public.user_crypto_config;

-- Policy granulari
CREATE POLICY "crypto_select" ON public.user_crypto_config
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "crypto_update" ON public.user_crypto_config
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "crypto_delete" ON public.user_crypto_config
  FOR DELETE USING (auth.uid() = user_id);

-- INSERT è gestito dal trigger (SECURITY DEFINER) e dalla RPC setup_new_user_crypto
-- Non serve policy INSERT per gli utenti normali

COMMENT ON FUNCTION public.handle_new_user()            IS 'Trigger: crea crypto_config placeholder e categorie default alla registrazione';
COMMENT ON FUNCTION public.setup_new_user_crypto(UUID,TEXT,TEXT) IS 'RPC: completa setup crypto al primo accesso (senza sessione attiva)';
COMMENT ON FUNCTION public.update_my_crypto_config(TEXT,TEXT)    IS 'RPC: aggiorna crypto config utente autenticato';
