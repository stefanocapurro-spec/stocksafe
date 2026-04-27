-- ============================================================
-- StockSafe – Migrazione 005: OAuth helpers + eliminazione account
-- ============================================================

-- ── Assicura categorie default (idempotente, per utenti OAuth) ───────────────
CREATE OR REPLACE FUNCTION public.ensure_default_categories()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  -- Crea la riga crypto_config se manca (per utenti OAuth)
  INSERT INTO public.user_crypto_config (user_id, salt_hex, iv_base_hex)
  VALUES (auth.uid(), '', '')
  ON CONFLICT (user_id) DO NOTHING;

  -- Crea categorie solo se l'utente non ne ha già
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

-- ── Eliminazione account completa (self-service) ─────────────────────────────
-- Eliminare un utente da auth.users richiede SECURITY DEFINER.
-- L'utente deve essere autenticato (via magic link inviato dalla schermata login).
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non autenticato';
  END IF;

  -- 1. Elimina dati applicativi
  DELETE FROM public.reminders          WHERE user_id = v_uid;
  DELETE FROM public.items              WHERE user_id = v_uid;
  DELETE FROM public.categories         WHERE user_id = v_uid;
  DELETE FROM public.user_crypto_config WHERE user_id = v_uid;

  -- 2. Elimina l'utente dall'auth (richiede SECURITY DEFINER con accesso a auth schema)
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

-- Permetti a qualsiasi utente autenticato di chiamare queste funzioni
GRANT EXECUTE ON FUNCTION public.ensure_default_categories()  TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.setup_first_crypto_authenticated(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_crypto_config(TEXT, TEXT)          TO authenticated;

COMMENT ON FUNCTION public.delete_my_account()
  IS 'Elimina account completo (dati + auth.users). Richiede sessione attiva via magic link.';
COMMENT ON FUNCTION public.ensure_default_categories()
  IS 'Crea categorie default e riga crypto_config per utenti OAuth (idempotente).';
