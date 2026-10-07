# INFERNO ETF

Next.js 16 (App Router) · React 19 · Tailwind 4 · TypeScript

## Uruchomienie na nowym komputerze

1. Zainstaluj **Node.js 20 LTS lub nowszy** (nodejs.org).
2. Otwórz ten folder w VS Code → Terminal → New Terminal.
3. `npm install`
4. Skopiuj `.env.local.example` jako `.env.local` i wpisz swój klucz `GEMINI_API_KEY`.
5. `npm run dev` → otwórz http://localhost:3000

## Struktura

- `app/` — strony (scanner, portfolio, etf/[ticker] = Deep View, chat, api/chat)
- `components/` — nagłówek, pasek tickerów, Table Scanner, Market Map, czat
- `components/deep-view/` — Deep View z Claude Design
- `lib/etfs.ts` — lista ETF-ów (dane przykładowe)
- `lib/fund-profiles.ts` — składy, sektory, kraje, ceny i TER (dane przykładowe)
