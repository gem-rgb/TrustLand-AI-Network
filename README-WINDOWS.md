# TrustLand AI Network — Windows Setup Guide

This is the **complete TrustLand project**, packaged for Windows. It includes
every source file plus today's changes (Google Maps integration, navy/orange
dashboard repaint, AI parcel upload, auth/verification page).

---

## Prerequisites (install these first)

### 1. Node.js (required)
- Download LTS from https://nodejs.org
- Run the installer, accept all defaults
- Verify in PowerShell:
  ```powershell
  node --version   # should print v20.x or newer
  npm --version    # should print 10.x or newer
  ```

### 2. VS Code (recommended editor)
- Download from https://code.visualstudio.com
- During install, check the box "Add 'Open with Code' action"

### 3. (Optional) Google Maps API key
- Only needed if you want the **live** Google Maps view
- Without it, the app falls back to a stylized SVG map (still works fine)
- Get a key at https://console.cloud.google.com/google/maps-apis
- Enable: **Maps JavaScript API**, **Places API**, **Geocoding API**

---

## Setup steps

### Step 1 — Extract the project

Right-click the downloaded zip → **Extract All...** → choose a short path like:
```
C:\Projects\trustland
```

⚠️ **Avoid deep paths** — Node.js can hit path-length issues on Windows if the
project is buried in `C:\Users\HomePC\Downloads\folder1\folder2\...`. Keep it
close to the drive root.

### Step 2 — Open in VS Code

Two ways:
- **Method A**: Open the extracted folder in VS Code (`File → Open Folder`)
- **Method B**: In PowerShell:
  ```powershell
  cd C:\Projects\trustland
  code .
  ```

### Step 3 — Install dependencies

In VS Code's integrated terminal (`Ctrl+`` or `Terminal → New Terminal`):

```powershell
npm install
```

This will take 2-5 minutes the first time. It downloads ~400 packages.

If you hit any errors about `sharp` or native modules, run:
```powershell
npm install --legacy-peer-deps
```

### Step 4 — (Optional) Add your Google Maps API key

Open the `.env` file in VS Code and replace the empty value:

```env
DATABASE_URL=file:./dev.db

NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIzaSy...your-key-here
```

Save the file. If you skip this, the map will use the SVG fallback.

### Step 5 — Start the dev server

```powershell
npm run dev
```

You should see:
```
▲ Next.js 16.1.3 (Turbopack)
- Local:        http://localhost:3000
✓ Ready in 1.2s
```

### Step 6 — Open in browser

Click the `http://localhost:3000` link in the terminal (or open your browser
manually). The TrustLand property search page will load with the dark navy
map view.

---

## Stopping the server

In the VS Code terminal where `npm run dev` is running, press **Ctrl+C**.

---

## What's included

```
trustland/
├── .env                            ← Edit to add Google Maps API key
├── .env.example                    ← Template with setup docs
├── package.json                    ← Windows-friendly npm scripts
├── next.config.ts                  ← Next.js 16 config (standalone output)
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── prisma/
│   └── schema.prisma               ← Database schema (reference only — app uses in-memory data)
├── public/                         ← Static assets
├── src/
│   ├── app/
│   │   ├── page.tsx                ← App entry — renders Layout
│   │   ├── layout.tsx              ← Root layout
│   │   └── api/[[...path]]/route.ts ← All API endpoints (catch-all)
│   ├── components/
│   │   ├── ui/                     ← shadcn/ui components (Button, Card, etc.)
│   │   └── trustland/
│   │       ├── Layout.tsx              ← Sidebar shell + dashboard + all views
│   │       ├── PropertySearchView.tsx  ← Map-centric landing page
│   │       ├── GoogleMapsView.tsx      ← NEW: Real Google Maps integration
│   │       ├── AuthView.tsx            ← Verification/auth page
│   │       ├── AiParcelUpload.tsx      ← AI parcel upload modal
│   │       └── ParcelSearchPalette.tsx ← Cmd-K search palette
│   └── lib/
│       ├── store.ts                ← Zustand store (all app state)
│       ├── db.ts                   ← Prisma client
│       ├── backend-data.ts         ← In-memory data initializer (demo data)
│       ├── t3-sdk-client.ts        ← Terminal 3 Agent Auth SDK wrapper
│       ├── t3-crypto.ts            ← Ed25519 / W3C DID / VCs
│       ├── t3-ledger.ts            ← Hash-chained ledger
│       ├── t3-autonomous-purchase.ts ← 7-step autonomous purchase workflow
│       └── t3-tee.ts               ← TEE attestation simulation
└── README.md                       ← This file
```

---

## Navigating the app

When you open `http://localhost:3000`, you'll see the **property search
landing page** with the map-centric layout matching the TrustLand demo video.

Use the bottom nav bar to switch to:
- **Explore Properties** — the map view
- **Dashboard** — KPI cards, agent status, trust ledger (navy/orange themed)
- **AI Agent** — autonomous purchase workflow
- **Transactions** — transaction list

The left sidebar (visible on all pages except Explore Properties) gives you
access to: Dashboard, Agent Marketplace, Trust Ledger, Transactions, Due
Diligence, Trust Score, Messages, Identities, Verification, Trust Engine,
Audit Ledger, Analytics, Autonomous Purchase.

---

## Troubleshooting

### "Cannot find module 'X'"
Run `npm install` again. If still failing:
```powershell
rm -r node_modules -Force
rm package-lock.json -Force
npm install
```

### Port 3000 already in use
Either stop the other process, or start on a different port:
```powershell
npx next dev --port 3001
```

### `npm run dev` fails with PowerShell execution policy error
Run PowerShell as Administrator, then:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Google Maps shows "demo mode" banner
You haven't set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` in `.env`, or you didn't
restart the dev server after setting it. Edit `.env`, save, then press
**Ctrl+C** in the terminal and run `npm run dev` again.

### `NEXT_PUBLIC_*` changes don't take effect
Next.js only reads `NEXT_PUBLIC_*` env vars at build/start time. Always
restart `npm run dev` after editing `.env`.

### Hot reload is slow
Make sure you're running on a SSD, and that your project path is short
(not buried deep in your user folder). Close other heavy apps.

### Native module errors (sharp, etc.)
On Windows, some native modules need build tools:
```powershell
npm install --global windows-build-tools
```
Or use the legacy peer deps flag:
```powershell
npm install --legacy-peer-deps
```

---

## Recommended VS Code extensions

Open Extensions panel (`Ctrl+Shift+X`) and install:
- **Tailwind CSS IntelliSense** — autocomplete for Tailwind classes
- **ES7+ React/Redux snippets** — JSX snippets
- **Prettier - Code formatter** — set as default formatter
- **Error Lens** — inline TS error display
- **Auto Rename Tag** — rename matching HTML tags

---

## Quick command reference

| Command | Purpose |
|---------|---------|
| `npm install` | Install all dependencies |
| `npm run dev` | Start dev server at http://localhost:3000 |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run lint` | Run ESLint |
| `Ctrl+C` | Stop the dev server |
| `Ctrl+`` | Toggle VS Code terminal |
| `Ctrl+P` | Quick-open files in VS Code |

---

## What's new in this version (2026-06-20)

1. **Map-centric property search landing page** — matches the TrustLand demo video layout (dark navy + orange brand)
2. **Google Maps integration** — real interactive map of Nairobi with property markers, search-by-address via Google Places Autocomplete, geolocation, road/satellite toggle. Falls back to stylized SVG when no API key.
3. **Uniform navy/orange brand** — the Dashboard and sidebar shell now wear the same `#0a1f44` + orange/red gradient brand as the landing page
4. **Verification (auth) page** — full-screen authentication flow
5. **AI land parcel upload** — modal for listing new parcels into the agent marketplace
6. **Search palette** — Cmd-K quick-search across all land parcels

---

Enjoy building on TrustLand! 🚀
