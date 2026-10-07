/* Mock ETF universe shared by the Table Scanner and the header search.
   Replace with real market data later — keep the same shape. */

export type CategoryId =
  | "indexes"
  | "ai-tech"
  | "defense"
  | "commodities"
  | "energy"
  | "financials"
  | "industry"
  | "others";

export type Volatility = "Low" | "Medium" | "High";
export type Leverage = "1x" | "2x" | "3x" | "Inverse";

export interface EtfRow {
  ticker: string;
  name: string;
  issuer: string;
  category: CategoryId;
  sector: string;
  sectorIcon: string;
  /** $ billions */
  aum: number;
  /** % */
  ytd: number;
  /** % */
  chg1d: number;
  volatility: Volatility;
  /** Distribution yield in %; 0 = accumulating / no dividend */
  dividendYield: number;
  leverage: Leverage;
  region: string;
  exchange: string;
  currency: "USD" | "EUR";
  /** Rank in the Trending tab (1 = top); undefined = not trending */
  trending?: number;
}

export const CATEGORIES: { id: CategoryId | "all" | "trending"; label: string; icon: string }[] = [
  { id: "all", label: "ETFS", icon: "∑" },
  { id: "trending", label: "TRENDING", icon: "🔥" },
  { id: "indexes", label: "INDEXES", icon: "📊" },
  { id: "ai-tech", label: "AI & TECH", icon: "🤖" },
  { id: "defense", label: "DEFENSE", icon: "⚔️" },
  { id: "commodities", label: "COMMODITIES", icon: "⛏️" },
  { id: "energy", label: "ENERGY", icon: "⚡" },
  { id: "financials", label: "FINANCIALS", icon: "🏛️" },
  { id: "industry", label: "INDUSTRY", icon: "🏭" },
  { id: "others", label: "OTHERS", icon: "📦" },
];

type Row = [
  ticker: string, name: string, issuer: string, category: CategoryId, sector: string, sectorIcon: string,
  aum: number, ytd: number, chg1d: number, volatility: Volatility, dividendYield: number, leverage: Leverage,
  region: string, exchange: string, currency: "USD" | "EUR", trending?: number,
];

const IDX = "📊";
const CHIP = "🤖";
const DEF = "⚔️";

const RAW: Row[] = [
  // ── Indexes ──
  ["SPY", "SPDR S&P 500 ETF Trust", "State Street", "indexes", "INDEX", IDX, 612, 14.2, 0.42, "Low", 1.2, "1x", "United States", "NYSE Arca", "USD", 1],
  ["QQQ", "Invesco QQQ Trust", "Invesco", "indexes", "INDEX", IDX, 318, 18.9, 0.87, "Medium", 0.6, "1x", "United States", "Nasdaq", "USD", 2],
  ["VOO", "Vanguard S&P 500 ETF", "Vanguard", "indexes", "INDEX", IDX, 540, 14.1, 0.42, "Low", 1.3, "1x", "United States", "NYSE Arca", "USD"],
  ["IVV", "iShares Core S&P 500 ETF", "BlackRock", "indexes", "INDEX", IDX, 560, 14.1, 0.41, "Low", 1.3, "1x", "United States", "NYSE Arca", "USD"],
  ["VTI", "Vanguard Total Stock Market", "Vanguard", "indexes", "INDEX", IDX, 452, 13.1, 0.36, "Low", 1.4, "1x", "United States", "NYSE Arca", "USD", 11],
  ["IWM", "iShares Russell 2000 ETF", "BlackRock", "indexes", "INDEX", IDX, 67.3, 6.8, -0.92, "Medium", 1.1, "1x", "United States", "NYSE Arca", "USD", 9],
  ["EEM", "iShares MSCI Emerging Markets", "BlackRock", "indexes", "INDEX", IDX, 19.2, 9.4, -0.52, "Medium", 2.3, "1x", "Emerging Markets", "NYSE Arca", "USD", 15],
  ["DIA", "SPDR Dow Jones Industrial Average", "State Street", "indexes", "INDEX", IDX, 34.1, 9.8, 0.21, "Low", 1.6, "1x", "United States", "NYSE Arca", "USD"],
  ["RSP", "Invesco S&P 500 Equal Weight", "Invesco", "indexes", "INDEX", IDX, 71.5, 8.4, 0.18, "Low", 1.5, "1x", "United States", "NYSE Arca", "USD"],
  ["VEA", "Vanguard FTSE Developed Markets", "Vanguard", "indexes", "INDEX", IDX, 134, 11.2, 0.31, "Low", 3.1, "1x", "Developed ex-US", "NYSE Arca", "USD"],
  ["VWO", "Vanguard FTSE Emerging Markets", "Vanguard", "indexes", "INDEX", IDX, 84.6, 10.1, -0.44, "Medium", 3.2, "1x", "Emerging Markets", "NYSE Arca", "USD"],
  ["IEFA", "iShares Core MSCI EAFE", "BlackRock", "indexes", "INDEX", IDX, 128, 11.6, 0.29, "Low", 3.0, "1x", "Developed ex-US", "Cboe BZX", "USD"],
  ["VXUS", "Vanguard Total International Stock", "Vanguard", "indexes", "INDEX", IDX, 82.3, 10.9, 0.12, "Low", 3.0, "1x", "Global ex-US", "Nasdaq", "USD"],
  ["VT", "Vanguard Total World Stock", "Vanguard", "indexes", "INDEX", IDX, 45.2, 12.6, 0.27, "Low", 1.9, "1x", "Global", "NYSE Arca", "USD"],
  ["ACWI", "iShares MSCI ACWI ETF", "BlackRock", "indexes", "INDEX", IDX, 21.4, 12.4, 0.26, "Low", 1.7, "1x", "Global", "Nasdaq", "USD"],
  ["SCHD", "Schwab U.S. Dividend Equity", "Schwab", "indexes", "INDEX", IDX, 68.9, 4.7, 0.11, "Low", 3.6, "1x", "United States", "NYSE Arca", "USD"],
  ["CSPX", "iShares Core S&P 500 UCITS", "BlackRock", "indexes", "INDEX", IDX, 98.4, 14.0, 0.40, "Low", 0, "1x", "United States", "LSE", "USD"],
  ["VWCE", "Vanguard FTSE All-World UCITS (Acc)", "Vanguard", "indexes", "INDEX", IDX, 18.7, 12.1, 0.24, "Low", 0, "1x", "Global", "Xetra", "EUR"],
  ["EUNL", "iShares Core MSCI World UCITS", "BlackRock", "indexes", "INDEX", IDX, 92.1, 13.2, 0.33, "Low", 0, "1x", "Global", "Xetra", "EUR"],
  ["IWDA", "iShares Core MSCI World UCITS", "BlackRock", "indexes", "INDEX", IDX, 92.1, 13.2, 0.34, "Low", 0, "1x", "Global", "Euronext", "EUR"],

  ["VGK", "Vanguard FTSE Europe ETF", "Vanguard", "indexes", "INDEX", IDX, 24.6, 17.8, 0.36, "Low", 3.0, "1x", "Europe", "NYSE Arca", "USD"],
  ["MCHI", "iShares MSCI China ETF", "BlackRock", "indexes", "INDEX", IDX, 7.4, 28.6, -0.84, "High", 1.6, "1x", "China", "Nasdaq", "USD"],
  ["FXI", "iShares China Large-Cap ETF", "BlackRock", "indexes", "INDEX", IDX, 6.1, 24.9, -0.71, "High", 2.3, "1x", "China", "NYSE Arca", "USD"],

  // ── AI & Tech ──
  ["SOXX", "iShares Semiconductor ETF", "BlackRock", "ai-tech", "SEMICONDUCTORS", CHIP, 14.2, 27.4, 2.31, "High", 0.6, "1x", "United States", "Nasdaq", "USD", 3],
  ["SMH", "VanEck Semiconductor ETF", "VanEck", "ai-tech", "SEMICONDUCTORS", CHIP, 24.1, 31.2, 2.64, "High", 0.4, "1x", "United States", "Nasdaq", "USD", 12],
  ["TQQQ", "ProShares UltraPro QQQ", "ProShares", "ai-tech", "CLOUD & SOFTWARE", CHIP, 26.4, 38.1, 2.58, "High", 0, "3x", "United States", "Nasdaq", "USD", 13],
  ["XLK", "Technology Select Sector SPDR", "State Street", "ai-tech", "BIG TECH", CHIP, 78.0, 21.3, 1.65, "Medium", 0.7, "1x", "United States", "NYSE Arca", "USD"],
  ["VGT", "Vanguard Information Technology", "Vanguard", "ai-tech", "BIG TECH", CHIP, 72.0, 20.8, 1.58, "Medium", 0.6, "1x", "United States", "NYSE Arca", "USD"],
  ["IGV", "iShares Expanded Tech-Software", "BlackRock", "ai-tech", "CLOUD & SOFTWARE", CHIP, 11.0, 15.6, 0.27, "High", 0, "1x", "United States", "Cboe BZX", "USD"],
  ["SOXL", "Direxion Daily Semiconductor Bull 3X", "Direxion", "ai-tech", "SEMICONDUCTORS", CHIP, 11.8, 44.6, 6.82, "High", 0.3, "3x", "United States", "NYSE Arca", "USD"],
  ["BOTZ", "Global X Robotics & AI", "Global X", "ai-tech", "ROBOTICS & AI", CHIP, 2.9, 17.2, 1.12, "High", 0.2, "1x", "Global", "Nasdaq", "USD"],
  ["AIQ", "Global X Artificial Intelligence & Tech", "Global X", "ai-tech", "ROBOTICS & AI", CHIP, 3.4, 19.8, 1.31, "High", 0.1, "1x", "Global", "Nasdaq", "USD"],
  ["ARKK", "ARK Innovation ETF", "ARK", "ai-tech", "DISRUPTIVE TECH", CHIP, 6.2, 12.4, 1.94, "High", 0, "1x", "United States", "NYSE Arca", "USD"],
  ["CIBR", "First Trust Nasdaq Cybersecurity", "First Trust", "ai-tech", "CYBERSECURITY", CHIP, 9.1, 16.9, 0.54, "Medium", 0.3, "1x", "Global", "Nasdaq", "USD"],
  ["SKYY", "First Trust Cloud Computing", "First Trust", "ai-tech", "CLOUD & SOFTWARE", CHIP, 3.6, 14.3, 0.62, "High", 0, "1x", "United States", "Nasdaq", "USD"],
  ["QTUM", "Defiance Quantum ETF", "Defiance", "ai-tech", "QUANTUM", CHIP, 1.4, 29.7, 2.12, "High", 0.4, "1x", "Global", "Nasdaq", "USD"],

  // ── Defense ──
  ["ITA", "iShares U.S. Aerospace & Defense", "BlackRock", "defense", "AEROSPACE", DEF, 8.9, 22.7, -0.64, "Medium", 0.7, "1x", "United States", "Cboe BZX", "USD", 8],
  ["XAR", "SPDR S&P Aerospace & Defense", "State Street", "defense", "AEROSPACE", DEF, 3.1, 24.5, -0.41, "Medium", 0.4, "1x", "United States", "NYSE Arca", "USD"],
  ["PPA", "Invesco Aerospace & Defense", "Invesco", "defense", "AEROSPACE", DEF, 5.2, 23.1, -0.38, "Medium", 0.5, "1x", "United States", "NYSE Arca", "USD"],
  ["DFEN", "Direxion Daily Aerospace & Defense Bull 3X", "Direxion", "defense", "AEROSPACE", DEF, 0.4, 58.2, -1.92, "High", 0.2, "3x", "United States", "NYSE Arca", "USD"],
  ["SHLD", "Global X Defense Tech", "Global X", "defense", "DEFENSE TECH", DEF, 2.1, 41.3, 0.88, "Medium", 0.3, "1x", "Global", "Cboe BZX", "USD"],
  ["NATO", "Themes Transatlantic Defense", "Themes", "defense", "DEFENSE TECH", DEF, 0.2, 36.4, 0.52, "Medium", 0.5, "1x", "Global", "Nasdaq", "USD"],
  ["EUAD", "Select STOXX Europe Aerospace & Defense", "Select", "defense", "EU DEFENSE", DEF, 0.9, 52.6, 1.24, "High", 0.6, "1x", "Europe", "Cboe BZX", "USD"],
  ["DFNS", "VanEck Defense UCITS", "VanEck", "defense", "EU DEFENSE", DEF, 3.8, 48.9, 1.06, "High", 0, "1x", "Global", "Xetra", "EUR"],
  ["ARKX", "ARK Space Exploration & Innovation", "ARK", "defense", "SPACE", DEF, 0.4, 18.2, 0.71, "High", 0, "1x", "Global", "Cboe BZX", "USD"],

  // ── Commodities ──
  ["GLD", "SPDR Gold Shares", "State Street", "commodities", "GOLD", "⛏️", 98.0, 24.9, 0.71, "Low", 0, "1x", "Global", "NYSE Arca", "USD", 4],
  ["SLV", "iShares Silver Trust", "BlackRock", "commodities", "SILVER", "⛏️", 15.6, 29.3, 1.44, "Medium", 0, "1x", "Global", "NYSE Arca", "USD", 14],
  ["IAU", "iShares Gold Trust", "BlackRock", "commodities", "GOLD", "⛏️", 36.2, 24.8, 0.70, "Low", 0, "1x", "Global", "NYSE Arca", "USD"],
  ["USO", "United States Oil Fund", "USCF", "commodities", "CRUDE OIL", "🛢️", 1.1, -3.6, -1.18, "High", 0, "1x", "Global", "NYSE Arca", "USD"],
  ["DBC", "Invesco DB Commodity Index", "Invesco", "commodities", "BROAD COMMODITIES", "⛏️", 1.6, 2.4, -0.33, "Medium", 4.1, "1x", "Global", "NYSE Arca", "USD"],
  ["DBA", "Invesco DB Agriculture Fund", "Invesco", "commodities", "AGRICULTURE", "🌾", 0.8, 4.2, 0.18, "Low", 3.9, "1x", "Global", "NYSE Arca", "USD"],
  ["COPX", "Global X Copper Miners", "Global X", "commodities", "COPPER", "⛏️", 2.3, 11.7, 0.92, "High", 1.6, "1x", "Global", "NYSE Arca", "USD"],

  // ── Energy ──
  ["XLE", "Energy Select Sector SPDR", "State Street", "energy", "ENERGY", "⚡", 27.8, -4.2, -1.31, "Medium", 3.4, "1x", "United States", "NYSE Arca", "USD", 7],
  ["VDE", "Vanguard Energy ETF", "Vanguard", "energy", "ENERGY", "⚡", 9.0, -3.8, -1.22, "Medium", 3.3, "1x", "United States", "NYSE Arca", "USD"],
  ["XOP", "SPDR S&P Oil & Gas Exploration", "State Street", "energy", "OIL & GAS", "⚡", 2.4, -7.1, -1.84, "High", 2.6, "1x", "United States", "NYSE Arca", "USD"],
  ["ICLN", "iShares Global Clean Energy", "BlackRock", "energy", "CLEAN ENERGY", "⚡", 1.5, -6.2, 0.47, "High", 1.8, "1x", "Global", "Nasdaq", "USD"],
  ["URA", "Global X Uranium ETF", "Global X", "energy", "URANIUM", "⚡", 3.3, 18.4, 1.61, "High", 3.1, "1x", "Global", "NYSE Arca", "USD"],

  // ── Financials ──
  ["XLF", "Financial Select Sector SPDR", "State Street", "financials", "BIG BANKS", "🏛️", 48.6, 9.7, -0.34, "Medium", 1.5, "1x", "United States", "NYSE Arca", "USD", 6],
  ["VFH", "Vanguard Financials ETF", "Vanguard", "financials", "BIG BANKS", "🏛️", 11.0, 9.4, -0.28, "Medium", 1.8, "1x", "United States", "NYSE Arca", "USD"],
  ["KRE", "SPDR S&P Regional Banking", "State Street", "financials", "REGIONAL BANKS", "🏛️", 3.2, 2.1, -0.82, "High", 3.2, "1x", "United States", "NYSE Arca", "USD"],
  ["KBE", "SPDR S&P Bank ETF", "State Street", "financials", "BANKS", "🏛️", 2.1, 4.6, 0.12, "Medium", 2.7, "1x", "United States", "NYSE Arca", "USD"],
  ["KBWB", "Invesco KBW Bank ETF", "Invesco", "financials", "BIG BANKS", "🏛️", 2.6, 8.8, -0.21, "Medium", 2.9, "1x", "United States", "Nasdaq", "USD"],

  ["FINX", "Global X FinTech ETF", "Global X", "financials", "FINTECH", "💳", 0.3, 11.6, 0.72, "High", 0.5, "1x", "Global", "Nasdaq", "USD"],
  ["ARKF", "ARK Blockchain & Fintech Innovation", "ARK", "financials", "FINTECH", "💳", 1.4, 34.2, 1.88, "High", 0, "1x", "Global", "Cboe BZX", "USD"],
  ["KIE", "SPDR S&P Insurance ETF", "State Street", "financials", "INSURANCE", "🛡️", 0.9, 6.4, 0.22, "Low", 1.6, "1x", "United States", "NYSE Arca", "USD"],

  // ── Industry ──
  ["XLI", "Industrial Select Sector SPDR", "State Street", "industry", "INDUSTRIALS", "🏭", 21.7, 11.9, 0.36, "Low", 1.4, "1x", "United States", "NYSE Arca", "USD"],
  ["VIS", "Vanguard Industrials ETF", "Vanguard", "industry", "INDUSTRIALS", "🏭", 6.1, 11.4, 0.33, "Low", 1.3, "1x", "United States", "NYSE Arca", "USD"],
  ["PAVE", "Global X U.S. Infrastructure", "Global X", "industry", "INFRASTRUCTURE", "🏭", 8.4, 13.6, 0.58, "Medium", 0.6, "1x", "United States", "Cboe BZX", "USD"],

  // ── Others ──
  ["IBIT", "iShares Bitcoin Trust", "BlackRock", "others", "BITCOIN", "₿", 71.0, 21.3, -3.42, "High", 0, "1x", "Global", "Nasdaq", "USD", 5],
  ["XLV", "Health Care Select Sector SPDR", "State Street", "others", "BIG PHARMA", "💊", 36.4, -2.1, -0.47, "Low", 1.6, "1x", "United States", "NYSE Arca", "USD", 10],
  ["FBTC", "Fidelity Wise Origin Bitcoin", "Fidelity", "others", "BITCOIN", "₿", 19.8, 21.1, -3.38, "High", 0, "1x", "Global", "Cboe BZX", "USD"],
  ["ETHA", "iShares Ethereum Trust", "BlackRock", "others", "ETHEREUM", "◆", 4.9, -8.4, -4.12, "High", 0, "1x", "Global", "Nasdaq", "USD"],
  ["VHT", "Vanguard Health Care ETF", "Vanguard", "others", "HEALTHCARE", "💊", 16.0, -1.6, 0.14, "Low", 1.4, "1x", "United States", "NYSE Arca", "USD"],
  ["IBB", "iShares Biotechnology ETF", "BlackRock", "others", "BIOTECH", "🧬", 8.0, -3.9, -0.95, "High", 0.3, "1x", "United States", "Nasdaq", "USD"],
  ["XBI", "SPDR S&P Biotech ETF", "State Street", "others", "BIOTECH", "🧬", 6.5, -4.8, -1.38, "High", 0, "1x", "United States", "NYSE Arca", "USD"],
  ["XLU", "Utilities Select Sector SPDR", "State Street", "others", "UTILITIES", "💡", 17.0, 12.8, 0.64, "Low", 3.0, "1x", "United States", "NYSE Arca", "USD"],
  ["XLP", "Consumer Staples Select Sector SPDR", "State Street", "others", "STAPLES", "🛒", 16.0, 3.1, -0.46, "Low", 2.6, "1x", "United States", "NYSE Arca", "USD"],
  ["XLY", "Consumer Discretionary Select SPDR", "State Street", "others", "CONSUMER", "🛍️", 21.0, 7.9, 0.92, "Medium", 0.8, "1x", "United States", "NYSE Arca", "USD"],
  ["TLT", "iShares 20+ Year Treasury Bond", "BlackRock", "others", "TREASURIES", "🏦", 58.3, -1.9, 0.38, "Medium", 4.3, "1x", "United States", "Nasdaq", "USD"],
  ["VCR", "Vanguard Consumer Discretionary ETF", "Vanguard", "others", "CONSUMER", "🛍️", 6.4, 7.4, 0.88, "Medium", 0.8, "1x", "United States", "NYSE Arca", "USD"],
  ["UUP", "Invesco DB US Dollar Index Fund", "Invesco", "others", "US DOLLAR", "💵", 1.9, -6.8, 0.21, "Low", 0, "1x", "United States", "NYSE Arca", "USD"],
  ["SQQQ", "ProShares UltraPro Short QQQ", "ProShares", "others", "HEDGE", "🛡️", 3.2, -39.6, -2.61, "High", 0, "Inverse", "United States", "Nasdaq", "USD"],
];

export const ETFS: EtfRow[] = RAW.map(
  ([ticker, name, issuer, category, sector, sectorIcon, aum, ytd, chg1d, volatility, dividendYield, leverage, region, exchange, currency, trending]) => ({
    ticker, name, issuer, category, sector, sectorIcon, aum, ytd, chg1d, volatility, dividendYield, leverage, region, exchange, currency, trending,
  })
);

/* Sub-categories shown under a category tab. An ETF may sit in a sub-category of another tab
   (e.g. URA is Energy, but also Commodities → Uranium); not every ETF needs a sub-category,
   so sub counts do not have to add up to the tab count. */
export interface SubCategory { id: string; label: string; tickers: string[] }

export const SUBCATEGORIES: Partial<Record<CategoryId, SubCategory[]>> = {
  indexes: [
    { id: "usa", label: "USA", tickers: ["SPY", "VOO", "IVV", "VTI", "QQQ", "IWM", "DIA", "RSP", "SCHD", "CSPX"] },
    { id: "europe", label: "EUROPE", tickers: ["VGK"] },
    { id: "china", label: "CHINA", tickers: ["MCHI", "FXI"] },
    { id: "world", label: "ALL WORLD", tickers: ["VT", "ACWI", "VWCE", "EUNL", "IWDA"] },
  ],
  "ai-tech": [
    { id: "semis", label: "SEMICONDUCTORS", tickers: ["SOXX", "SMH", "SOXL"] },
    { id: "ai-infra", label: "AI & ROBOTICS", tickers: ["BOTZ", "AIQ"] },
    { id: "software", label: "SOFTWARE & CLOUD", tickers: ["IGV", "SKYY"] },
    { id: "cyber", label: "CYBERSECURITY", tickers: ["CIBR"] },
    { id: "bigtech", label: "BIG TECH", tickers: ["XLK", "VGT", "TQQQ"] },
  ],
  defense: [
    { id: "aerospace", label: "AEROSPACE", tickers: ["ITA", "XAR", "PPA", "DFEN"] },
    { id: "space", label: "SPACE TECH", tickers: ["ARKX"] },
    { id: "cyber-def", label: "CYBER DEFENSE", tickers: ["SHLD", "CIBR"] },
  ],
  commodities: [
    { id: "precious", label: "PRECIOUS METALS", tickers: ["GLD", "IAU", "SLV"] },
    { id: "base", label: "BASE METALS", tickers: ["COPX"] },
    { id: "uranium", label: "URANIUM", tickers: ["URA"] },
    { id: "agri", label: "AGRICULTURE", tickers: ["DBA"] },
  ],
  energy: [
    { id: "oilgas", label: "OIL & GAS", tickers: ["XLE", "VDE", "XOP"] },
    { id: "clean", label: "CLEAN ENERGY", tickers: ["ICLN"] },
    { id: "nuclear", label: "NUCLEAR", tickers: ["URA"] },
  ],
  financials: [
    { id: "banks", label: "BIG BANKS", tickers: ["XLF", "VFH", "KBWB"] },
    { id: "fintech", label: "FINTECH", tickers: ["FINX", "ARKF"] },
    { id: "insurance", label: "INSURANCE", tickers: ["KIE"] },
  ],
};

/** Is this ETF part of a category tab (its own category, or listed in one of its sub-categories)? */
export const inCategory = (e: EtfRow, cat: CategoryId) =>
  e.category === cat || (SUBCATEGORIES[cat]?.some((s) => s.tickers.includes(e.ticker)) ?? false);

export const fmtPct = (c: number) => (c > 0 ? "+" : c < 0 ? "-" : "") + Math.abs(c).toFixed(2) + "%";
export const fmtAum = (b: number) => (b >= 100 ? `$${b.toFixed(0)}B` : `$${b.toFixed(1)}B`);
