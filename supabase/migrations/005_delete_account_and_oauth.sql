-- ============================================================
-- StockSafe – Migrazione 005
-- Eliminazione account + supporto OAuth
-- ============================================================

-- ── Funzione: elimina account completo ───────────────────────────────────────
-- Cancella TUTTO: dati utente + riga in auth.users
-- Richiede sessione attiva (magic link o login normale)
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato';
  END IF;

  -- Elimina tutti i dati utente (le FK CASCADE gestiscono i reminders)
  DELETE FROM public.items            WHERE user_id = v_uid;
  DELETE FROM public.categories       WHERE user_id = v_uid;
  DELETE FROM public.user_crypto_config WHERE user_id = v_uid;

  -- Elimina l'account auth (richiede SECURITY DEFINER con accesso a auth schema)
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ── Funzione: setup crypto per utente OAuth già autenticato ─────────────────
-- Usata al primo accesso con Google quando salt_hex è ancora vuoto
CREATE OR REPLACE FUNCTION public.setup_first_crypto_authenticated(
  p_salt_hex    TEXT,
  p_iv_base_hex TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non autenticato';
  END IF;

  -- Crea la riga se non esiste (utenti OAuth arrivano qui prima del trigger
  -- in alcuni scenari di race condition)
  INSERT INTO public.user_crypto_config (user_id, salt_hex, iv_base_hex)
  VALUES (auth.uid(), p_salt_hex, p_iv_base_hex)
  ON CONFLICT (user_id) DO UPDATE
    SET salt_hex    = EXCLUDED.salt_hex,
        iv_base_hex = EXCLUDED.iv_base_hex,
        updated_at  = NOW()
  WHERE public.user_crypto_config.salt_hex = '' 
     OR public.user_crypto_config.salt_hex IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.setup_first_crypto_authenticated(TEXT, TEXT) TO authenticated;

-- ── Assicura che categorie predefinite vengano create anche per OAuth ─────────
-- Il trigger handle_new_user() già gestisce questo, ma lo rendiamo idempotente
CREATE OR REPLACE FUNCTION public.ensure_default_categories()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  INSERT INTO public.categories (user_id, name, icon, color, is_default)
  SELECT auth.uid(), name, icon, color, true
  FROM (VALUES
    ('Alimenti',           '🥫', '#F59E0B'),
    ('Medicinali',         '💊', '#EF4444'),
    ('Batterie',           '🔋', '#10B981'),
    ('Vestiario',          '👕', '#8B5CF6'),
    ('Carte elettroniche', '💳', '#3B82F6')
  ) AS defaults(name, icon, color)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.user_id = auth.uid() AND c.name = defaults.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_default_categories() TO authenticated;

COMMENT ON FUNCTION public.delete_my_account()          IS 'Elimina account completo incluso auth.users';
COMMENT ON FUNCTION public.setup_first_crypto_authenticated(TEXT,TEXT) IS 'Setup cifratura primo accesso OAuth';
COMMENT ON FUNCTION public.ensure_default_categories()  IS 'Crea categorie default se non esistono';
