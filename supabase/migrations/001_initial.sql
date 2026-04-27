-- ============================================================
-- StockSafe – Schema Supabase
-- Esegui questo file nella SQL Editor del tuo progetto Supabase
-- ============================================================

-- Abilita estensioni necessarie
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABELLA: user_crypto_config
-- Contiene il salt per derivare la chiave di cifratura.
-- Il salt è pubblico (non è un segreto) ma è necessario
-- per derivare la chiave dalla password.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_crypto_config (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  salt_hex    TEXT NOT NULL,          -- salt per PBKDF2 (hex, 32 byte)
  iv_base_hex TEXT NOT NULL DEFAULT '', -- non usato nella cifratura lato client
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- RLS
ALTER TABLE public.user_crypto_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_crypto_config_owner" ON public.user_crypto_config
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- TABELLA: categories
-- Categorie prodotto per utente
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT DEFAULT '📦',
  color       TEXT DEFAULT '#F59E0B',
  is_default  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "categories_owner" ON public.categories
  FOR ALL USING (auth.uid() = user_id);

-- Indice per ricerche veloci
CREATE INDEX idx_categories_user_id ON public.categories(user_id);

-- ============================================================
-- TABELLA: items
-- Articoli inventario – tutti i campi sensibili sono cifrati
-- lato client (AES-256-GCM) prima di arrivare qui.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id     UUID REFERENCES public.categories(id) ON DELETE SET NULL,

  -- Dati cifrati (AES-256-GCM, base64url)
  -- Contiene: {name, barcode, brand, notes, purchase_price}
  encrypted_data  TEXT NOT NULL,
  -- IV (initialization vector) per questo record
  iv_hex          TEXT NOT NULL,

  -- Campi NON cifrati (necessari per filtrare/ordinare lato DB)
  quantity        NUMERIC(10,3) DEFAULT 1,
  unit            TEXT DEFAULT 'pz',         -- pz, g, kg, ml, l, ...
  purchase_date   DATE,
  expiry_date     DATE,
  reminder_sent   BOOLEAN DEFAULT FALSE,

  -- Valore economico (cifrato: calcolato = qty * purchase_price)
  encrypted_value TEXT,
  iv_value_hex    TEXT,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "items_owner" ON public.items
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_items_user_id    ON public.items(user_id);
CREATE INDEX idx_items_expiry     ON public.items(user_id, expiry_date);
CREATE INDEX idx_items_category   ON public.items(category_id);

-- ============================================================
-- TABELLA: reminders
-- Promemoria scadenze (1° del mese precedente la scadenza)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.reminders (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  remind_date DATE NOT NULL,      -- 1° del mese precedente
  expiry_date DATE NOT NULL,      -- data di scadenza dell'articolo
  notified    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(item_id)
);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reminders_owner" ON public.reminders
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_reminders_user_date ON public.reminders(user_id, remind_date);

-- ============================================================
-- FUNZIONE: trigger updated_at automatico
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_crypto_updated_at
  BEFORE UPDATE ON public.user_crypto_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- FUNZIONE: calcola remind_date (1° del mese precedente)
-- ============================================================
CREATE OR REPLACE FUNCTION public.calc_remind_date(expiry DATE)
RETURNS DATE AS $$
BEGIN
  RETURN DATE_TRUNC('month', expiry) - INTERVAL '1 month';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- TRIGGER: crea/aggiorna reminder automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION public.manage_reminder()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expiry_date IS NOT NULL THEN
    INSERT INTO public.reminders(user_id, item_id, remind_date, expiry_date)
    VALUES (NEW.user_id, NEW.id, public.calc_remind_date(NEW.expiry_date), NEW.expiry_date)
    ON CONFLICT (item_id) DO UPDATE
      SET remind_date = public.calc_remind_date(NEW.expiry_date),
          expiry_date = NEW.expiry_date,
          notified    = FALSE;
  ELSE
    DELETE FROM public.reminders WHERE item_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_items_reminder
  AFTER INSERT OR UPDATE OF expiry_date ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.manage_reminder();

-- ============================================================
-- POLICY Supabase Auth — blocco email usa-e-getta
-- (configurare in Supabase Dashboard > Auth > Hooks se necessario)
-- ============================================================
-- Nota: la lista blocklist domini usa-e-getta viene gestita
-- lato client + lato edge function (vedi README per dettagli)

COMMENT ON TABLE public.items IS 'Inventario articoli. Dati sensibili cifrati AES-256-GCM lato client.';
COMMENT ON TABLE public.user_crypto_config IS 'Config cifratura per utente. Il salt viene usato per derivare la chiave da password via PBKDF2.';
