# ⬡ StockSafe

**Gestione sicura delle scorte domestiche** — PWA installabile con crittografia end-to-end AES-256-GCM.

---

## 🔐 Architettura di sicurezza

| Layer | Tecnologia |
|---|---|
| Cifratura dati | AES-256-GCM (Web Crypto API) |
| Derivazione chiave | PBKDF2-SHA256, 600.000 iterazioni |
| Salt | 32 byte casuali, unico per utente |
| Auth account | Supabase Auth (email + password) |
| Auth dati | Password di cifratura separata (mai trasmessa) |
| DB isolation | Supabase RLS (Row Level Security) |
| Transport | HTTPS + HSTS |
| Headers | CSP, X-Frame-Options, Referrer-Policy |
| Email blocklist | Domini usa-e-getta bloccati |

> **Importante**: la password di cifratura non lascia mai il dispositivo.  
> I dati su Supabase sono sempre cifrati — neanche Anthropic/Supabase può leggerli.

---

## 🚀 Setup e Deploy

### 1. Prerequisiti

- Node.js 18+
- Account [Supabase](https://supabase.com) (piano Free sufficiente)
- Account [GitHub](https://github.com) per CI/CD
- Account [Vercel](https://vercel.com) o [Netlify](https://netlify.com) per l'hosting

### 2. Crea il progetto Supabase

1. Vai su [supabase.com](https://supabase.com) → New Project
2. Vai su **SQL Editor** e incolla il contenuto di `supabase/migrations/001_initial.sql`
3. Esegui lo script (crea tabelle, RLS, trigger)
4. In **Project Settings > API** copia:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public key` → `VITE_SUPABASE_ANON_KEY`

### 3. Configurazione Auth Supabase

In **Authentication > Settings**:
- Email confirmations: **abilitato**
- Minimum password length: **8**
- Site URL: `https://tuo-dominio.vercel.app`
- Redirect URLs: `https://tuo-dominio.vercel.app/reset-password`

### 4. Installazione locale

```bash
git clone https://github.com/tuo-utente/stocksafe
cd stocksafe
cp .env.example .env
# Compila .env con i tuoi valori Supabase
npm install
npm run dev
```

### 5. Deploy su Vercel (raccomandato)

```bash
# Collega il repo GitHub a Vercel
# Aggiungi le variabili d'ambiente:
#   VITE_SUPABASE_URL
#   VITE_SUPABASE_ANON_KEY
# Deploy automatico ad ogni push su main
```

### 6. Deploy su Netlify

```bash
npm run build
# Upload cartella dist/ su Netlify
# Oppure collega il repo e configura:
#   Build command: npm run build
#   Publish directory: dist
```

---

## 📱 Installazione PWA

### Android
1. Apri l'app in Chrome
2. Tap menu (⋮) → "Aggiungi a schermata Home"

### iOS (Safari)
1. Apri l'app in Safari
2. Tap condividi (□↑) → "Aggiungi a schermata Home"

### Desktop (Chrome/Edge)
1. Clicca l'icona di installazione nella barra indirizzi
2. Oppure: menu → "Installa StockSafe"

---

## 🔑 Gestione password

StockSafe usa **due password distinte**:

| Password | Scopo | Recuperabile? |
|---|---|---|
| Password account | Login Supabase | ✅ Sì (reset via email) |
| Password di cifratura | Decifra i dati | ❌ No — annotala! |

### Compatibilità gestori password
- **Google Password Manager**: salva entrambe le password, usa autocomplete="email/current-password"
- **Apple Keychain**: supportato nativamente su iOS/macOS
- **Bitwarden / 1Password**: copia manuale nel campo password di cifratura

---

## 📅 Promemoria scadenze

Il sistema crea automaticamente un promemoria al **1° del mese precedente** la scadenza.

Esempio:
- Scadenza: 21 luglio → Promemoria: 1 giugno
- Scadenza: 5 marzo → Promemoria: 1 febbraio

Esporta tutte le scadenze come `.ics` da **Impostazioni > Notifiche > Scarica .ics**.

---

## 📦 Struttura progetto

```
stocksafe/
├── src/
│   ├── lib/
│   │   ├── supabase.ts      # Client Supabase + tipi DB
│   │   ├── crypto.ts        # AES-256-GCM, PBKDF2, email blocklist
│   │   ├── barcode.ts       # ZXing scanner + Open Food Facts API
│   │   └── calendar.ts      # Export .ics, promemoria, notifiche
│   ├── stores/
│   │   ├── authStore.ts     # Zustand: auth + cifratura
│   │   └── inventoryStore.ts # Zustand: CRUD articoli + categorie
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── UnlockPage.tsx   # Sblocco dopo refresh sessione
│   │   ├── ResetPasswordPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── InventoryPage.tsx
│   │   ├── AddItemPage.tsx  # Aggiunta/modifica + scanner
│   │   ├── CategoriesPage.tsx
│   │   └── SettingsPage.tsx
│   ├── components/
│   │   └── Layout/
│   │       ├── AppLayout.tsx
│   │       └── AppLayout.module.css
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── supabase/
│   └── migrations/
│       └── 001_initial.sql  # Schema completo + RLS + trigger
├── public/
│   ├── _headers             # CSP + security headers
│   └── icons/               # Aggiungi icon-192.png e icon-512.png
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 🖼️ Icone PWA

Aggiungi nella cartella `public/icons/`:
- `icon-192.png` (192×192 px)
- `icon-512.png` (512×512 px)

Puoi generarle su [favicon.io](https://favicon.io) o [realfavicongenerator.net](https://realfavicongenerator.net).

---

## 📡 API esterne

| Servizio | Uso | Privacy |
|---|---|---|
| Open Food Facts | Lookup barcode prodotti alimentari | Pubblico, anonimo |
| Google Fonts | Font Outfit + JetBrains Mono | Solo CSS, no tracking |
| Supabase | Auth + storage dati cifrati | EU data residency disponibile |

---

## 🛡️ Note di sicurezza aggiuntive

- Non memorizzare la password di cifratura in `localStorage` — viene tenuta solo in memoria
- La sessione di cifratura scade al refresh della pagina (richiede re-inserimento password)
- In produzione, configura Supabase con **EU region** per conformità GDPR
- Abilitare 2FA su Supabase Dashboard è raccomandato
