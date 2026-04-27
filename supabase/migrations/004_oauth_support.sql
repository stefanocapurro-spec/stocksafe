-- ============================================================
-- StockSafe – Migrazione 004: Supporto OAuth (Google / Apple)
-- ============================================================

-- RPC: primo setup crypto per utenti OAuth già autenticati
-- (diversa da setup_new_user_crypto che ha limite 10 minuti)
-- Funziona per qualsiasi utente con sessione attiva che
-- non ha ancora configurato la cifratura (salt vuoto).
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
    RAISE EXCEPTION 'Utente non autenticato';
  END IF;

  UPDATE public.user_crypto_config
  SET
    salt_hex    = p_salt_hex,
    iv_base_hex = p_iv_base_hex,
    updated_at  = NOW()
  WHERE user_id = auth.uid()
    AND (salt_hex = '' OR salt_hex IS NULL);

  IF NOT FOUND THEN
    -- La cifratura è già configurata → non fa nulla (idempotente)
    RETURN;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.setup_first_crypto_authenticated(TEXT, TEXT)
  IS 'Setup iniziale cifratura per utenti OAuth (autenticati, salt ancora vuoto)';
