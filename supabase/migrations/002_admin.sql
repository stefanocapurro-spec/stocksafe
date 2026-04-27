-- ============================================================
-- StockSafe – Migrazione 002: Funzioni Admin
-- ============================================================

-- Funzione: lista utenti (solo per admin)
CREATE OR REPLACE FUNCTION admin_list_users()
RETURNS TABLE (
  id              UUID,
  email           TEXT,
  created_at      TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  "itemCount"     BIGINT,
  "hasCryptoConfig" BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  admin_email  TEXT;
BEGIN
  -- Leggi l'email del chiamante
  SELECT au.email INTO caller_email
  FROM auth.users au WHERE au.id = auth.uid();

  -- Leggi admin email dalla configurazione (impostata come variabile Postgres)
  -- Fallback: consenti all'utente autenticato di vedere la lista
  -- In produzione: imposta app.admin_email tramite Supabase Dashboard > Database > Settings
  admin_email := current_setting('app.admin_email', true);

  IF admin_email IS NOT NULL AND admin_email != '' AND caller_email != admin_email THEN
    RAISE EXCEPTION 'Accesso non autorizzato';
  END IF;

  RETURN QUERY
  SELECT
    au.id,
    au.email,
    au.created_at,
    au.last_sign_in_at,
    (SELECT COUNT(*) FROM public.items i WHERE i.user_id = au.id),
    (SELECT EXISTS(SELECT 1 FROM public.user_crypto_config c WHERE c.user_id = au.id))
  FROM auth.users au
  ORDER BY au.created_at DESC;
END;
$$;

-- Funzione: elimina dati utente (non l'account auth)
CREATE OR REPLACE FUNCTION admin_delete_user_data(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  admin_email  TEXT;
BEGIN
  SELECT au.email INTO caller_email FROM auth.users au WHERE au.id = auth.uid();
  admin_email := current_setting('app.admin_email', true);

  IF admin_email IS NOT NULL AND admin_email != '' AND caller_email != admin_email THEN
    RAISE EXCEPTION 'Accesso non autorizzato';
  END IF;

  -- Non permettere di eliminare i propri dati da qui
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Non puoi eliminare il tuo stesso account';
  END IF;

  DELETE FROM public.reminders   WHERE user_id = target_user_id;
  DELETE FROM public.items       WHERE user_id = target_user_id;
  DELETE FROM public.categories  WHERE user_id = target_user_id;
  DELETE FROM public.user_crypto_config WHERE user_id = target_user_id;
END;
$$;

-- Funzione: reset configurazione cifratura utente
CREATE OR REPLACE FUNCTION admin_reset_user_crypto(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  admin_email  TEXT;
BEGIN
  SELECT au.email INTO caller_email FROM auth.users au WHERE au.id = auth.uid();
  admin_email := current_setting('app.admin_email', true);

  IF admin_email IS NOT NULL AND admin_email != '' AND caller_email != admin_email THEN
    RAISE EXCEPTION 'Accesso non autorizzato';
  END IF;

  -- Azzera il token di verifica: l'utente potrà impostare una nuova password di cifratura
  UPDATE public.user_crypto_config
  SET iv_base_hex = '', salt_hex = ''
  WHERE user_id = target_user_id;
END;
$$;

-- Imposta admin email come variabile di configurazione Postgres
-- ESEGUI QUESTO COMANDO SEPARATAMENTE sostituendo la email:
-- ALTER DATABASE postgres SET app.admin_email = 'tua-email-admin@esempio.com';
-- Oppure dalla Supabase Dashboard > SQL Editor esegui il comando sopra.

COMMENT ON FUNCTION admin_list_users()             IS 'Lista utenti — solo admin';
COMMENT ON FUNCTION admin_delete_user_data(UUID)   IS 'Elimina tutti i dati di un utente (non l''account auth)';
COMMENT ON FUNCTION admin_reset_user_crypto(UUID)  IS 'Azzera config cifratura — l''utente può impostarne una nuova';
