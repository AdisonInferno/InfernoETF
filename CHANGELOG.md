# INFERNO ETF — Dziennik zmian

_Generowany automatycznie z historii git. Zmiany oddalone o mniej niż godzinę = jedna sesja._

## sobota, 17 października 2026

### Sesja #14 · 14:50–16:20 · 25 zmian · AdisonInferno

- `16:20` Background colour picker, softer glow, white counts
- `16:11` Dziennik zmian
- `16:10` Dziennik zmian
- `16:10` Correct data: XTB import verifies every symbol on the exchange (name + price) and fixes it by name search, non-US tickers keep their exchange suffix (BDX.PL ≠ BDX); Yahoo fundamentals for any stock/ETF (P/E, AUM, TER, holdings); USD-value weights everywhere + real balance tiles; charts PRICE/VALUE vs % axis; local benchmark (WIG20, DAX…); dashboard fits the screen; wider deep-view chart
- `16:08` Dziennik zmian
- `16:01` Dziennik zmian
- `15:59` Dziennik zmian
- `15:59` Every selected/pressed state (nav, tabs, toggles, chips, filters, sort buttons, tiles) uses the OASIS accent + glow (.oasis-on / .oasis-tab) and follows the colour picker
- `15:55` Dziennik zmian
- `15:55` Dziennik zmian
- `15:55` Header ⚙ opens the OASIS accent colour panel
- `15:54` OASIS accent as CSS variables (text/border/bg-oasis, bg-oasis-muted via Tailwind 4 @theme) + live colour scrubber (bottom-right) wired to timeframe rails, active rows, portfolio badges, ruler
- `15:49` Dziennik zmian
- `15:43` Dziennik zmian
- `15:42` Dziennik zmian
- `15:36` Dziennik zmian
- `15:32` Dziennik zmian
- `15:32` Right-click any ticker anywhere: DEEP DIVE / ADD TO FAVORITES; composition map timeframe drives the table return column, brighter chart axes; flip-able sorting (scanner table + market map); market map: blue timeframe rail + colour scale under the map; ★ PORTFOLIO badge on market-moving news
- `15:28` Dziennik zmian
- `15:21` Dziennik zmian
- `15:16` Dziennik zmian
- `15:16` Stock financials: Ctrl+drag Quant Ruler (Δ value / Δ % between quarters), earnings brief as terminal note in the right panel, range selector bottom-left
- `15:09` Dziennik zmian
- `15:09` Charts: tight vertical autoscale, only main + S&P 500 by default with SHOW TOP 5 HOLDINGS / PEERS button, segmented light-blue timeframe rail with glowing sliding block; brand renamed to OASIS
- `14:50` Dziennik zmian

### Sesja #13 · 13:44–13:44 · 2 zmian · AdisonInferno

- `13:44` Dziennik zmian
- `13:44` Stock Deep Dive (/stock/[ticker]): overview, SEC quarterly financials with per-quarter breakdown and WHY, EPS expectations vs actual, seasonality, earnings reaction, news, ETF exposure; stock tickers link to it across the app

## piątek, 16 października 2026

### Sesja #12 · 17:57–18:25 · 5 zmian · AdisonInferno

- `18:25` Dziennik zmian
- `18:25` Real today numbers everywhere: /api/market/snapshot (Yahoo price, 1D, YTD) overlays the static database in scanner, map, pulse, recent bar, ticker tape, ETF page, portfolio, watchlist. Portfolio dashboard: portfolio on top (~3/4), builder + whales below
- `18:17` Dziennik zmian
- `17:57` Dziennik zmian
- `17:57` Watchlist page (ALL / PORTFOLIO / FAVORITES / custom groups) with a shared watchlist store; chart: timeframe rail under the chart, muted comparison lines; NEWS: PORTFOLIO focus; portfolio dashboard 3/4 + 1/4

## czwartek, 15 października 2026

### Sesja #11 · 23:26–01:05 · 20 zmian · AdisonInferno

- `01:05` Dziennik zmian
- `00:59` AI news insight: also fall back to the next model on 503 overload
- `00:59` Dziennik zmian
- `00:59` XTB import: retry + fall back to the next Gemini model when one is overloaded (503)
- `00:52` Dziennik zmian
- `00:52` Portfolio: DELETE PORTFOLIO (with confirm) clears positions, lots and imported instruments; start again from scratch
- `00:51` Dziennik zmian
- `00:51` Dziennik zmian
- `00:51` Portfolio deep view: look-through news feed (newest / weight-adjusted, why-it-matters badges), risk telemetry tags, PnL attribution, tabs OVERVIEW/COMPOSITION MAP/CHARTS/NEWS/ANALYZE/TOOLS
- `00:44` Dziennik zmian
- `00:44` ETF Tools: Sector Split master/detail (sub-sector table ↔ ETF vs parent-benchmark cockpit: relative chart, beta, spread, correlation, top holding)
- `00:38` Dziennik zmian
- `00:37` Dziennik zmian
- `00:37` One chart everywhere (InfernoChart): timeframe rail that follows scroll/zoom, 2y history (no gaps), LINE/BARS, legend toggles, top-5 + any-ticker comparisons. Portfolio deep view tabs (Overview / Composition map / Charts / News), XTB import adds to the portfolio, table column order
- `00:19` Dziennik zmian
- `00:10` Dziennik zmian
- `00:10` Portfolio holdings in the analytical tools: ★ PORTFOLIO tab in the scanner table, MY PORTFOLIO sector on the market map, holdings as nodes + MY PORTFOLIO filter in Macro Nexus
- `00:01` Dziennik zmian
- `00:01` Portfolio deep view: live USD prices (FX auto-conversion), sortable/filterable positions table with timeframes, interactive chart with vertical timeframe slider, PORTFOLIO / DEEP VIEW breadcrumb, nav resets to overview, import opens deep view
- `23:26` Changelog grouped into work sessions (<60 min gap), auto-refreshed by AKTUALIZUJ.bat

### Sesja #10 · 15:29–16:02 · 6 zmian · AdisonInferno

- `16:02` Holdings news: importance 1-3 badge, cyan glow for filings
- `16:01` Market map: COUNTRIES universe (3 main indices per country)
- `15:53` Market map: timeframe scrubber (1Y…1D, drag to scrub) + bigger sector titles
- `15:46` ETF Deep-Dive Cockpit in the scanner CHARTS view
- `15:34` Scanner: row click opens CHARTS (chart + what-it-is note + top 5 holdings, list on the right); bigger 7D chart; drop footer labels
- `15:29` Market map zoom/compare on full ETF DB; Market Pulse: volume bars, impact-coloured tickers, cached AI news read

## środa, 14 października 2026

### Sesja #9 · 22:18–23:28 · 7 zmian · AdisonInferno

- `23:28` Scanner: cleaner Market Pulse headers, full-width recent-ticker bar with tactile buttons
- `22:57` NEWS: 'Market is waiting for' impact ranking + price charts under every news item
- `22:44` Scanner table: spread extra width evenly over columns, taller two-line fund rows
- `22:38` Scanner: fill the full width on wide monitors
- `22:36` Scanner: cap/centre layout on wide screens, Recent tickers glued under the table
- `22:28` Market map sector quick-jump + persistent Recent Tickers bar
- `22:18` Scanner: denser table + Market Pulse rail

### Sesja #8 · 17:49–19:35 · 7 zmian · Claude, AdisonInferno

- `19:35` XTB import: fall back to other Gemini models on daily quota (429), Polish quota message
- `19:17` Zmiany lokalne
- `19:03` NEWS: Event Calendar jako osobna sekcja pod MACRO
- `18:39` NEWS: kalendarz wydarzeń pod sekcją MACRO
- `18:03` Macro Nexus: camera — drag to pan, wheel zoom at cursor, right/Shift-drag rotate
- `17:55` ETF Tools: Macro Nexus cross-asset correlation network
- `17:49` Usuń napis ETF z loga

### Sesja #7 · 13:00–13:00 · 1 zmian · AdisonInferno

- `13:00` Portfolio: XTB import from header (name→ticker guess, sectors), non-DB stocks, deep view re-layout

## poniedziałek, 12 października 2026

### Sesja #6 · 21:29–21:40 · 2 zmian · AdisonInferno

- `21:40` Scanner: PRICE / CHARTS split view with collapsible chart and list
- `21:29` Sync: ResizableSplit, XTB import, scanner changes

## niedziela, 11 października 2026

### Sesja #5 · 22:00–22:20 · 2 zmian · AdisonInferno

- `22:20` checkpoint przed zmianami
- `22:00` Intel: SEC filings + commodities (WIP)

### Sesja #4 · 00:04–00:04 · 1 zmian · AdisonInferno

- `00:04` SEC filings: direction arrows + hover insight

## sobota, 10 października 2026

### Sesja #3 · 03:29–04:00 · 2 zmian · AdisonInferno

- `04:00` news archive: hourly collector + 1y backfill
- `03:29` Market Map: Surface-Elevation styling, remove shadows and extra labels

## czwartek, 8 października 2026

### Sesja #2 · 15:24–15:24 · 1 zmian · AdisonInferno

- `15:24` composition map: map → table → chart

### Sesja #1 · 01:57–01:57 · 1 zmian · AdisonInferno

- `01:57` wykres portfela vs S&P 500
