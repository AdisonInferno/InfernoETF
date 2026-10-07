/* Realistic PLACEHOLDER compositions for the Deep View.
   Weights / market caps are approximate and illustrative — replace with issuer data from an API.
   Holding line format: "TICKER|Company name|weight %|sub-sector|market cap $B" (cap 0 = n/a). */

export interface Profile {
  holdings: string[];
  geo: [string, number][];
  /** Optional explicit sub-sector split of the whole fund; otherwise computed from holdings. */
  sectors?: [string, number][];
  /** Typical beta vs S&P 500 (before leverage). */
  beta: number;
  /** Total number of positions in the real fund (for labels). */
  positions?: number;
}

/** Sub-sector → parent sector (drives colors and "sector skew"). */
export const SUB_PARENT: Record<string, string> = {
  Semiconductors: "Technology", "Semi Equipment": "Technology", "EDA Software": "Technology", Software: "Technology",
  "Consumer Electronics": "Technology", "IT Hardware": "Technology", "IT Services": "Technology", Cybersecurity: "Technology",
  "Semi Materials": "Materials", Chemicals: "Materials", "Metals & Mining": "Materials", "Copper Mining": "Materials", "Construction Materials": "Materials", Steel: "Materials",
  "Interactive Media": "Communication", Entertainment: "Communication", Telecom: "Communication",
  "E-Commerce": "Consumer Disc.", Automobiles: "Consumer Disc.", "Home Improvement": "Consumer Disc.", Restaurants: "Consumer Disc.",
  "Travel & Leisure": "Consumer Disc.", Apparel: "Consumer Disc.", "Specialty Retail": "Consumer Disc.",
  Retail: "Consumer Staples", Household: "Consumer Staples", Beverages: "Consumer Staples", "Food Products": "Consumer Staples", Tobacco: "Consumer Staples",
  Banks: "Financials", "Regional Banks": "Financials", Insurance: "Financials", Payments: "Financials", "Capital Markets": "Financials", "Asset Management": "Financials", Fintech: "Financials",
  Pharma: "Health Care", Biotech: "Health Care", "Managed Care": "Health Care", "Medical Devices": "Health Care", "Life Sciences Tools": "Health Care",
  "Oil & Gas": "Energy", "Oil & Gas E&P": "Energy", Refining: "Energy", Midstream: "Energy", "Oilfield Services": "Energy", Uranium: "Energy", "Solar & Wind": "Energy",
  "Aerospace & Defense": "Industrials", Machinery: "Industrials", "Electrical Equipment": "Industrials", Transportation: "Industrials", "Industrial Services": "Industrials",
  "Engineering & Construction": "Industrials", Robotics: "Industrials", Space: "Industrials",
  "Electric Utilities": "Utilities", "Multi-Utilities": "Utilities", "Independent Power": "Utilities", "Renewable Utilities": "Utilities",
  "Real Estate": "Real Estate",
  "Precious Metals": "Commodities", "Energy Futures": "Commodities", "Metals Futures": "Commodities", "Agriculture Futures": "Commodities", "Currency Futures": "Commodities",
  "Digital Assets": "Crypto",
  "US Treasuries": "Govt Bonds",
  Quantum: "Technology",
  "Cash & Other": "Cash & Other", "Other Holdings": "Other",
};

const SP500: Profile = {
  beta: 1.0, positions: 503,
  holdings: [
    "NVDA|NVIDIA Corp.|7.62|Semiconductors|4420", "MSFT|Microsoft Corp.|6.71|Software|3780", "AAPL|Apple Inc.|6.48|Consumer Electronics|3810",
    "AMZN|Amazon.com Inc.|3.86|E-Commerce|2340", "META|Meta Platforms|2.84|Interactive Media|1790", "AVGO|Broadcom Inc.|2.71|Semiconductors|1610",
    "GOOGL|Alphabet Inc. Class A|2.45|Interactive Media|2950", "GOOG|Alphabet Inc. Class C|1.98|Interactive Media|2950", "TSLA|Tesla Inc.|2.12|Automobiles|1430",
    "BRK.B|Berkshire Hathaway|1.62|Insurance|1060", "JPM|JPMorgan Chase|1.48|Banks|830", "ORCL|Oracle Corp.|0.92|Software|720",
    "LLY|Eli Lilly|1.12|Pharma|760", "V|Visa Inc.|1.01|Payments|670", "NFLX|Netflix Inc.|0.83|Entertainment|520",
    "XOM|Exxon Mobil|0.84|Oil & Gas|480", "MA|Mastercard|0.78|Payments|520", "WMT|Walmart Inc.|0.79|Retail|830",
    "COST|Costco Wholesale|0.71|Retail|410", "PLTR|Palantir Technologies|0.69|Software|420", "JNJ|Johnson & Johnson|0.66|Pharma|450",
    "HD|Home Depot|0.61|Home Improvement|390", "ABBV|AbbVie Inc.|0.62|Pharma|400", "PG|Procter & Gamble|0.58|Household|360", "BAC|Bank of America|0.56|Banks|390",
  ],
  sectors: [
    ["Semiconductors", 13.4], ["Software", 11.6], ["Consumer Electronics", 6.9], ["IT Hardware", 2.1], ["Interactive Media", 8.6], ["Entertainment", 1.4], ["Telecom", 0.8],
    ["E-Commerce", 4.6], ["Automobiles", 2.3], ["Specialty Retail", 3.4], ["Banks", 4.1], ["Payments", 3.2], ["Insurance", 3.4], ["Capital Markets", 3.1],
    ["Pharma", 4.6], ["Medical Devices", 2.6], ["Managed Care", 1.9], ["Aerospace & Defense", 2.3], ["Machinery", 2.4], ["Industrial Services", 3.6],
    ["Retail", 2.1], ["Household", 1.4], ["Beverages", 1.2], ["Oil & Gas", 2.9], ["Electric Utilities", 2.4], ["Real Estate", 2.0], ["Chemicals", 1.8], ["Cash & Other", 0.3],
  ],
  geo: [["United States", 99.4], ["Ireland", 0.4], ["Other", 0.2]],
};

const NASDAQ100: Profile = {
  beta: 1.18, positions: 101,
  holdings: [
    "NVDA|NVIDIA Corp.|9.82|Semiconductors|4420", "MSFT|Microsoft Corp.|8.61|Software|3780", "AAPL|Apple Inc.|8.03|Consumer Electronics|3810",
    "AVGO|Broadcom Inc.|5.68|Semiconductors|1610", "AMZN|Amazon.com Inc.|5.41|E-Commerce|2340", "META|Meta Platforms|3.71|Interactive Media|1790",
    "NFLX|Netflix Inc.|2.72|Entertainment|520", "TSLA|Tesla Inc.|3.12|Automobiles|1430", "GOOGL|Alphabet Inc. Class A|2.68|Interactive Media|2950",
    "GOOG|Alphabet Inc. Class C|2.51|Interactive Media|2950", "COST|Costco Wholesale|2.38|Retail|410", "PLTR|Palantir Technologies|2.21|Software|420",
    "AMD|Advanced Micro Devices|1.86|Semiconductors|392", "CSCO|Cisco Systems|1.52|IT Hardware|270", "TMUS|T-Mobile US|1.41|Telecom|270",
    "PEP|PepsiCo Inc.|1.18|Beverages|200", "LIN|Linde plc|1.12|Chemicals|220", "INTU|Intuit Inc.|1.09|Software|185",
    "ISRG|Intuitive Surgical|1.04|Medical Devices|175", "SHOP|Shopify Inc.|1.02|Software|190", "AMAT|Applied Materials|0.94|Semi Equipment|168",
    "QCOM|Qualcomm Inc.|0.92|Semiconductors|186", "BKNG|Booking Holdings|0.89|Travel & Leisure|170", "TXN|Texas Instruments|0.86|Semiconductors|171", "MU|Micron Technology|0.84|Semiconductors|192",
  ],
  sectors: [
    ["Semiconductors", 21.8], ["Software", 18.4], ["Consumer Electronics", 8.0], ["IT Hardware", 3.2], ["Interactive Media", 12.1], ["Entertainment", 3.6], ["Telecom", 1.9],
    ["E-Commerce", 6.8], ["Automobiles", 3.1], ["Travel & Leisure", 2.4], ["Retail", 2.9], ["Beverages", 2.3], ["Medical Devices", 2.2], ["Biotech", 3.4],
    ["Industrial Services", 3.1], ["Chemicals", 1.1], ["Electric Utilities", 1.4], ["Payments", 1.3], ["Cash & Other", 0.9],
  ],
  geo: [["United States", 96.8], ["Canada", 1.0], ["Netherlands", 0.8], ["United Kingdom", 0.7], ["China", 0.7]],
};

const WORLD: Profile = {
  beta: 0.95, positions: 3720,
  holdings: [
    "NVDA|NVIDIA Corp.|4.92|Semiconductors|4420", "MSFT|Microsoft Corp.|4.33|Software|3780", "AAPL|Apple Inc.|4.19|Consumer Electronics|3810",
    "AMZN|Amazon.com Inc.|2.49|E-Commerce|2340", "META|Meta Platforms|1.83|Interactive Media|1790", "AVGO|Broadcom Inc.|1.75|Semiconductors|1610",
    "GOOGL|Alphabet Inc. Class A|1.58|Interactive Media|2950", "GOOG|Alphabet Inc. Class C|1.29|Interactive Media|2950", "TSLA|Tesla Inc.|1.37|Automobiles|1430",
    "TSM|Taiwan Semiconductor|1.21|Semiconductors|1310", "JPM|JPMorgan Chase|0.96|Banks|830", "BRK.B|Berkshire Hathaway|0.82|Insurance|1060",
    "LLY|Eli Lilly|0.72|Pharma|760", "V|Visa Inc.|0.65|Payments|670", "TCEHY|Tencent Holdings|0.52|Interactive Media|640",
    "ASML|ASML Holding|0.49|Semi Equipment|334", "XOM|Exxon Mobil|0.54|Oil & Gas|480", "005930|Samsung Electronics|0.38|Consumer Electronics|390",
    "SAP|SAP SE|0.36|Software|320", "NESN|Nestlé S.A.|0.31|Food Products|250", "NOVO-B|Novo Nordisk|0.27|Pharma|240",
    "ROG|Roche Holding|0.30|Pharma|260", "AZN|AstraZeneca|0.31|Pharma|240", "7203|Toyota Motor|0.26|Automobiles|260", "SHEL|Shell plc|0.25|Oil & Gas|215",
  ],
  sectors: [
    ["Semiconductors", 11.2], ["Software", 9.1], ["Consumer Electronics", 5.4], ["IT Hardware", 2.2], ["Interactive Media", 7.8], ["Entertainment", 1.1], ["Telecom", 1.6],
    ["E-Commerce", 4.1], ["Automobiles", 2.6], ["Specialty Retail", 3.0], ["Banks", 7.2], ["Insurance", 3.4], ["Payments", 2.4], ["Capital Markets", 3.0],
    ["Pharma", 5.6], ["Medical Devices", 2.4], ["Managed Care", 1.0], ["Aerospace & Defense", 2.4], ["Machinery", 3.1], ["Industrial Services", 4.2],
    ["Retail", 2.0], ["Food Products", 2.0], ["Beverages", 1.2], ["Oil & Gas", 3.6], ["Electric Utilities", 2.6], ["Real Estate", 2.1], ["Chemicals", 2.4], ["Metals & Mining", 1.4], ["Cash & Other", 0.4],
  ],
  geo: [["United States", 63.8], ["Japan", 5.4], ["United Kingdom", 3.3], ["China", 2.9], ["Canada", 2.8], ["Other", 21.8]],
};

const WORLD_DEV: Profile = {
  ...WORLD, positions: 1330, beta: 0.97,
  holdings: WORLD.holdings.filter((h) => !/^(TCEHY|005930)\|/.test(h)).map((h) => h.replace(/\|([\d.]+)\|/, (_, w) => `|${(+w * 1.12).toFixed(2)}|`)),
  geo: [["United States", 72.1], ["Japan", 5.8], ["United Kingdom", 3.5], ["Canada", 3.1], ["France", 2.6], ["Other", 12.9]],
};

const EX_US: Profile = {
  beta: 0.82, positions: 3950,
  holdings: [
    "ASML|ASML Holding|1.62|Semi Equipment|334", "SAP|SAP SE|1.31|Software|320", "NESN|Nestlé S.A.|1.02|Food Products|250",
    "ROG|Roche Holding|0.98|Pharma|260", "AZN|AstraZeneca|1.01|Pharma|240", "NOVN|Novartis AG|0.96|Pharma|235",
    "7203|Toyota Motor|0.86|Automobiles|260", "SHEL|Shell plc|0.88|Oil & Gas|215", "HSBA|HSBC Holdings|0.94|Banks|230",
    "NOVO-B|Novo Nordisk|0.82|Pharma|240", "6758|Sony Group|0.66|Consumer Electronics|170", "MC|LVMH|0.62|Apparel|340",
    "RY|Royal Bank of Canada|0.71|Banks|210", "SIE|Siemens AG|0.69|Industrial Services|200", "8306|Mitsubishi UFJ|0.64|Banks|170",
    "ULVR|Unilever plc|0.58|Household|150", "ALV|Allianz SE|0.52|Insurance|160", "CBA|Commonwealth Bank|0.61|Banks|190",
    "SHOP|Shopify Inc.|0.58|Software|190", "SU|Schneider Electric|0.52|Electrical Equipment|150", "TTE|TotalEnergies|0.48|Oil & Gas|140",
    "RHM|Rheinmetall AG|0.31|Aerospace & Defense|95", "BHP|BHP Group|0.46|Metals & Mining|140", "TD|Toronto-Dominion Bank|0.45|Banks|130", "SAN|Banco Santander|0.44|Banks|140",
  ],
  sectors: [
    ["Banks", 13.4], ["Insurance", 4.6], ["Capital Markets", 3.4], ["Industrial Services", 7.2], ["Machinery", 4.9], ["Aerospace & Defense", 2.5], ["Electrical Equipment", 2.7],
    ["Pharma", 7.4], ["Medical Devices", 2.2], ["Semi Equipment", 2.8], ["Semiconductors", 3.6], ["Software", 3.5], ["Consumer Electronics", 2.4], ["Automobiles", 4.1],
    ["Apparel", 2.7], ["Food Products", 3.6], ["Household", 2.4], ["Beverages", 1.6], ["Chemicals", 3.4], ["Metals & Mining", 3.6], ["Oil & Gas", 4.9],
    ["Telecom", 3.3], ["Electric Utilities", 3.2], ["Real Estate", 2.4], ["Cash & Other", 0.3],
  ],
  geo: [["Japan", 21.3], ["United Kingdom", 10.6], ["Canada", 9.4], ["France", 7.2], ["Switzerland", 6.9], ["Germany", 6.7], ["Other", 37.9]],
};

const EM: Profile = {
  beta: 0.88, positions: 1210,
  holdings: [
    "TSM|Taiwan Semiconductor|10.84|Semiconductors|1310", "TCEHY|Tencent Holdings|4.92|Interactive Media|640", "BABA|Alibaba Group|3.21|E-Commerce|360",
    "005930|Samsung Electronics|3.04|Consumer Electronics|390", "HDB|HDFC Bank|1.52|Banks|175", "RELIANCE|Reliance Industries|1.26|Oil & Gas|220",
    "000660|SK Hynix|1.41|Semiconductors|160", "3690|Meituan|1.02|E-Commerce|110", "1810|Xiaomi Corp.|1.18|Consumer Electronics|170",
    "IBN|ICICI Bank|0.98|Banks|115", "INFY|Infosys Ltd.|0.84|IT Services|75", "PDD|PDD Holdings|0.82|E-Commerce|170",
    "2317|Hon Hai Precision|0.91|IT Hardware|95", "939|China Construction Bank|0.86|Banks|240", "BHARTI|Bharti Airtel|0.79|Telecom|135",
    "2222|Saudi Aramco|0.66|Oil & Gas|1650", "NPN|Naspers Ltd.|0.62|Interactive Media|55", "MELI|MercadoLibre|0.58|E-Commerce|110",
    "VALE|Vale S.A.|0.51|Metals & Mining|45", "ITUB|Itaú Unibanco|0.55|Banks|70", "1211|BYD Co.|0.62|Automobiles|130",
    "2454|MediaTek Inc.|0.71|Semiconductors|70", "PKO|PKO Bank Polski|0.21|Banks|25", "TCS|Tata Consultancy|0.55|IT Services|135", "1299|AIA Group|0.48|Insurance|90",
  ],
  sectors: [
    ["Semiconductors", 16.4], ["IT Hardware", 4.8], ["IT Services", 3.1], ["Consumer Electronics", 5.4], ["Banks", 17.6], ["Insurance", 3.2], ["Interactive Media", 9.4],
    ["E-Commerce", 8.9], ["Automobiles", 3.1], ["Oil & Gas", 4.6], ["Metals & Mining", 3.9], ["Chemicals", 2.4], ["Telecom", 3.4], ["Pharma", 3.2],
    ["Industrial Services", 4.9], ["Food Products", 2.6], ["Electric Utilities", 2.6], ["Cash & Other", 0.4],
  ],
  geo: [["China", 26.4], ["Taiwan", 19.7], ["India", 18.9], ["South Korea", 10.2], ["Brazil", 4.4], ["Other", 20.4]],
};

const SMALLCAP: Profile = {
  beta: 1.22, positions: 1970,
  holdings: [
    "CRDO|Credo Technology|0.71|Semiconductors|24", "FN|Fabrinet|0.52|IT Hardware|13", "IONQ|IonQ Inc.|0.61|Quantum|17",
    "SFM|Sprouts Farmers Market|0.49|Retail|15", "HIMS|Hims & Hers Health|0.46|Managed Care|12", "INSM|Insmed Inc.|0.58|Biotech|28",
    "AIT|Applied Industrial Tech.|0.41|Industrial Services|10", "ENSG|Ensign Group|0.38|Managed Care|10", "RKLB|Rocket Lab|0.63|Space|25",
    "FLR|Fluor Corp.|0.37|Engineering & Construction|8", "SPXC|SPX Technologies|0.36|Machinery|9", "MOD|Modine Manufacturing|0.39|Machinery|8",
    "CMC|Commercial Metals|0.33|Steel|7", "UMBF|UMB Financial|0.34|Regional Banks|8", "CVLT|Commvault Systems|0.35|Software|8",
    "KTOS|Kratos Defense|0.44|Aerospace & Defense|11", "TXRH|Texas Roadhouse|0.32|Restaurants|11", "OKLO|Oklo Inc.|0.48|Independent Power|14",
    "BE|Bloom Energy|0.52|Electrical Equipment|17", "QBTS|D-Wave Quantum|0.38|Quantum|9",
  ],
  sectors: [
    ["Regional Banks", 9.4], ["Capital Markets", 3.2], ["Insurance", 3.4], ["Biotech", 9.1], ["Medical Devices", 3.9], ["Managed Care", 3.6],
    ["Machinery", 6.2], ["Industrial Services", 6.4], ["Aerospace & Defense", 3.1], ["Engineering & Construction", 2.9], ["Software", 6.3], ["Semiconductors", 3.8], ["IT Hardware", 3.4],
    ["Specialty Retail", 4.6], ["Restaurants", 2.6], ["Real Estate", 6.2], ["Oil & Gas E&P", 4.4], ["Electric Utilities", 3.1], ["Chemicals", 3.6], ["Food Products", 2.9], ["Cash & Other", 0.9],
  ],
  geo: [["United States", 98.6], ["Other", 1.4]],
};

const DOW: Profile = {
  beta: 0.92, positions: 30,
  holdings: [
    "GS|Goldman Sachs|11.24|Capital Markets|240", "MSFT|Microsoft Corp.|7.12|Software|3780", "CAT|Caterpillar Inc.|6.91|Machinery|230",
    "HD|Home Depot|5.62|Home Improvement|390", "V|Visa Inc.|4.81|Payments|670", "SHW|Sherwin-Williams|4.79|Chemicals|85",
    "AXP|American Express|4.94|Payments|240", "JPM|JPMorgan Chase|4.31|Banks|830", "MCD|McDonald's Corp.|4.36|Restaurants|215",
    "UNH|UnitedHealth Group|4.82|Managed Care|310", "AMGN|Amgen Inc.|4.21|Biotech|160", "TRV|Travelers Cos.|3.86|Insurance|62",
    "IBM|IBM Corp.|4.02|IT Services|260", "AAPL|Apple Inc.|3.61|Consumer Electronics|3810", "CRM|Salesforce Inc.|3.38|Software|235",
    "AMZN|Amazon.com Inc.|3.24|E-Commerce|2340", "HON|Honeywell|3.02|Industrial Services|135", "BA|Boeing Co.|3.14|Aerospace & Defense|165",
    "NVDA|NVIDIA Corp.|2.69|Semiconductors|4420", "JNJ|Johnson & Johnson|2.71|Pharma|450", "MMM|3M Co.|2.21|Industrial Services|85",
    "CVX|Chevron Corp.|2.19|Oil & Gas|310", "PG|Procter & Gamble|2.18|Household|360", "WMT|Walmart Inc.|1.43|Retail|830", "DIS|Walt Disney|1.62|Entertainment|205",
  ],
  geo: [["United States", 100]],
};

const DIVIDEND: Profile = {
  beta: 0.78, positions: 103,
  holdings: [
    "CVX|Chevron Corp.|4.38|Oil & Gas|310", "ABBV|AbbVie Inc.|4.12|Pharma|400", "CSCO|Cisco Systems|4.21|IT Hardware|270",
    "KO|Coca-Cola Co.|4.09|Beverages|300", "PEP|PepsiCo Inc.|3.86|Beverages|200", "MO|Altria Group|4.11|Tobacco|100",
    "VZ|Verizon Communications|4.02|Telecom|185", "HD|Home Depot|3.91|Home Improvement|390", "AMGN|Amgen Inc.|3.84|Biotech|160",
    "TXN|Texas Instruments|3.88|Semiconductors|171", "BMY|Bristol-Myers Squibb|3.79|Pharma|95", "LMT|Lockheed Martin|3.71|Aerospace & Defense|115",
    "COP|ConocoPhillips|3.61|Oil & Gas E&P|115", "PFE|Pfizer Inc.|3.52|Pharma|140", "UPS|United Parcel Service|3.24|Transportation|75",
    "TGT|Target Corp.|2.81|Specialty Retail|45", "EOG|EOG Resources|2.61|Oil & Gas E&P|65", "OKE|ONEOK Inc.|2.12|Midstream|48", "FAST|Fastenal Co.|1.84|Industrial Services|48", "BLK|BlackRock Inc.|1.72|Asset Management|170",
  ],
  geo: [["United States", 100]],
};

const SEMIS_SMH: Profile = {
  beta: 1.52, positions: 25,
  holdings: [
    "NVDA|NVIDIA Corp.|20.14|Semiconductors|4610", "TSM|Taiwan Semiconductor|11.82|Semiconductors|1310", "AVGO|Broadcom Inc.|8.91|Semiconductors|1580",
    "AMD|Advanced Micro Devices|5.24|Semiconductors|392", "ASML|ASML Holding|4.93|Semi Equipment|334", "QCOM|Qualcomm Inc.|4.61|Semiconductors|186",
    "TXN|Texas Instruments|4.42|Semiconductors|171", "MU|Micron Technology|4.30|Semiconductors|192", "AMAT|Applied Materials|4.12|Semi Equipment|168",
    "LRCX|Lam Research|3.87|Semi Equipment|151", "KLAC|KLA Corp.|3.79|Semi Equipment|121", "INTC|Intel Corp.|3.58|Semiconductors|148",
    "ADI|Analog Devices|3.46|Semiconductors|119", "SNPS|Synopsys|3.21|EDA Software|86", "CDNS|Cadence Design|2.98|EDA Software|91",
    "MRVL|Marvell Technology|2.77|Semiconductors|71", "NXPI|NXP Semiconductors|2.36|Semiconductors|58", "MCHP|Microchip Technology|1.92|Semiconductors|36",
    "MPWR|Monolithic Power|1.81|Semiconductors|40", "ON|ON Semiconductor|1.29|Semiconductors|22", "TER|Teradyne|0.91|Semi Equipment|22",
    "STM|STMicroelectronics|0.78|Semiconductors|25", "SWKS|Skyworks Solutions|0.59|Semiconductors|11", "QRVO|Qorvo Inc.|0.41|Semiconductors|8", "OLED|Universal Display|0.28|Semi Materials|7",
  ],
  geo: [["United States", 81.6], ["Taiwan", 11.8], ["Netherlands", 5.2], ["Switzerland", 0.8], ["Other", 0.6]],
};

const SEMIS_SOXX: Profile = {
  beta: 1.55, positions: 30,
  holdings: [
    "AVGO|Broadcom Inc.|9.12|Semiconductors|1610", "NVDA|NVIDIA Corp.|8.74|Semiconductors|4420", "AMD|Advanced Micro Devices|7.96|Semiconductors|392",
    "QCOM|Qualcomm Inc.|6.12|Semiconductors|186", "TXN|Texas Instruments|5.48|Semiconductors|171", "MU|Micron Technology|5.31|Semiconductors|192",
    "LRCX|Lam Research|4.42|Semi Equipment|151", "AMAT|Applied Materials|4.36|Semi Equipment|168", "KLAC|KLA Corp.|4.21|Semi Equipment|121",
    "MRVL|Marvell Technology|4.04|Semiconductors|71", "INTC|Intel Corp.|3.91|Semiconductors|148", "ADI|Analog Devices|3.88|Semiconductors|119",
    "TSM|Taiwan Semiconductor|3.79|Semiconductors|1310", "ASML|ASML Holding|3.42|Semi Equipment|334", "NXPI|NXP Semiconductors|3.31|Semiconductors|58",
    "MPWR|Monolithic Power|3.02|Semiconductors|40", "MCHP|Microchip Technology|2.94|Semiconductors|36", "ON|ON Semiconductor|2.11|Semiconductors|22",
    "TER|Teradyne|1.62|Semi Equipment|22", "ENTG|Entegris Inc.|1.21|Semi Materials|14", "SWKS|Skyworks Solutions|1.08|Semiconductors|11", "MTSI|MACOM Technology|0.92|Semiconductors|9",
  ],
  geo: [["United States", 89.8], ["Taiwan", 3.8], ["Netherlands", 6.1], ["Other", 0.3]],
};

const TECH: Profile = {
  beta: 1.24, positions: 70,
  holdings: [
    "NVDA|NVIDIA Corp.|15.21|Semiconductors|4420", "AAPL|Apple Inc.|13.06|Consumer Electronics|3810", "MSFT|Microsoft Corp.|12.38|Software|3780",
    "AVGO|Broadcom Inc.|5.41|Semiconductors|1610", "ORCL|Oracle Corp.|3.62|Software|720", "PLTR|Palantir Technologies|3.04|Software|420",
    "AMD|Advanced Micro Devices|2.81|Semiconductors|392", "CSCO|Cisco Systems|2.52|IT Hardware|270", "IBM|IBM Corp.|2.28|IT Services|260",
    "CRM|Salesforce Inc.|2.16|Software|235", "MU|Micron Technology|1.98|Semiconductors|192", "INTU|Intuit Inc.|1.61|Software|185",
    "NOW|ServiceNow Inc.|1.59|Software|190", "APP|AppLovin Corp.|1.62|Software|210", "ANET|Arista Networks|1.58|IT Hardware|180",
    "LRCX|Lam Research|1.61|Semi Equipment|151", "AMAT|Applied Materials|1.52|Semi Equipment|168", "QCOM|Qualcomm Inc.|1.49|Semiconductors|186",
    "TXN|Texas Instruments|1.38|Semiconductors|171", "ADBE|Adobe Inc.|1.36|Software|150", "KLAC|KLA Corp.|1.21|Semi Equipment|121",
    "PANW|Palo Alto Networks|1.18|Cybersecurity|135", "ACN|Accenture plc|1.12|IT Services|160", "CRWD|CrowdStrike|1.09|Cybersecurity|120", "ADI|Analog Devices|1.04|Semiconductors|119",
  ],
  geo: [["United States", 98.9], ["Ireland", 1.1]],
};

const SOFTWARE: Profile = {
  beta: 1.28, positions: 118,
  holdings: [
    "ORCL|Oracle Corp.|9.21|Software|720", "MSFT|Microsoft Corp.|8.84|Software|3780", "PLTR|Palantir Technologies|8.62|Software|420",
    "CRM|Salesforce Inc.|7.48|Software|235", "NOW|ServiceNow Inc.|6.51|Software|190", "INTU|Intuit Inc.|6.12|Software|185",
    "ADBE|Adobe Inc.|5.41|Software|150", "APP|AppLovin Corp.|5.02|Software|210", "PANW|Palo Alto Networks|4.11|Cybersecurity|135",
    "CRWD|CrowdStrike|3.98|Cybersecurity|120", "SNPS|Synopsys|3.02|EDA Software|86", "CDNS|Cadence Design|2.98|EDA Software|91",
    "ADSK|Autodesk Inc.|2.41|Software|68", "FTNT|Fortinet Inc.|2.02|Cybersecurity|65", "WDAY|Workday Inc.|1.96|Software|64",
    "SNOW|Snowflake Inc.|1.82|Software|75", "DDOG|Datadog Inc.|1.71|Software|50", "TEAM|Atlassian Corp.|1.21|Software|45", "NET|Cloudflare Inc.|1.48|Software|70", "MDB|MongoDB Inc.|0.92|Software|28",
  ],
  geo: [["United States", 97.4], ["Australia", 1.2], ["Israel", 0.8], ["Other", 0.6]],
};

const CYBER: Profile = {
  beta: 1.12, positions: 33,
  holdings: [
    "AVGO|Broadcom Inc.|8.14|Semiconductors|1610", "CRWD|CrowdStrike|7.61|Cybersecurity|120", "CSCO|Cisco Systems|7.42|IT Hardware|270",
    "PANW|Palo Alto Networks|7.08|Cybersecurity|135", "INFY|Infosys Ltd.|6.02|IT Services|75", "CHKP|Check Point Software|4.11|Cybersecurity|24",
    "FTNT|Fortinet Inc.|3.98|Cybersecurity|65", "ZS|Zscaler Inc.|3.92|Cybersecurity|45", "NET|Cloudflare Inc.|3.91|Software|70",
    "CYBR|CyberArk Software|3.62|Cybersecurity|24", "LDOS|Leidos Holdings|3.21|IT Services|25", "GEN|Gen Digital|3.02|Cybersecurity|18",
    "OKTA|Okta Inc.|2.91|Cybersecurity|16", "AKAM|Akamai Technologies|2.12|Software|12", "BAH|Booz Allen Hamilton|2.02|IT Services|15", "S|SentinelOne|1.52|Cybersecurity|6", "TENB|Tenable Holdings|1.31|Cybersecurity|4",
  ],
  geo: [["United States", 79.6], ["Israel", 11.4], ["India", 6.0], ["Other", 3.0]],
};

const ROBOTICS_AI: Profile = {
  beta: 1.18, positions: 50,
  holdings: [
    "NVDA|NVIDIA Corp.|9.42|Semiconductors|4420", "ISRG|Intuitive Surgical|8.61|Medical Devices|175", "ABBN|ABB Ltd.|7.82|Electrical Equipment|115",
    "6861|Keyence Corp.|6.41|Electrical Equipment|95", "6954|Fanuc Corp.|4.91|Robotics|28", "6273|SMC Corp.|4.02|Machinery|22",
    "6506|Yaskawa Electric|3.42|Robotics|8", "PATH|UiPath Inc.|2.81|Software|7", "6383|Daifuku Co.|2.92|Machinery|9",
    "DT|Dynatrace Inc.|2.61|Software|15", "PEGA|Pegasystems|2.42|Software|9", "CGNX|Cognex Corp.|2.21|Electrical Equipment|7",
    "SYM|Symbotic Inc.|2.12|Robotics|25", "TER|Teradyne|2.08|Semi Equipment|22", "AVAV|AeroVironment|1.84|Aerospace & Defense|12", "6146|Disco Corp.|1.71|Semi Equipment|30",
  ],
  geo: [["United States", 46.2], ["Japan", 31.6], ["Switzerland", 8.4], ["Other", 13.8]],
};

const ARK: Profile = {
  beta: 1.75, positions: 41,
  holdings: [
    "TSLA|Tesla Inc.|11.42|Automobiles|1430", "COIN|Coinbase Global|8.21|Capital Markets|90", "ROKU|Roku Inc.|6.62|Entertainment|14",
    "HOOD|Robinhood Markets|6.41|Capital Markets|110", "RBLX|Roblox Corp.|5.92|Entertainment|85", "PLTR|Palantir Technologies|5.48|Software|420",
    "SHOP|Shopify Inc.|5.12|Software|190", "CRSP|CRISPR Therapeutics|4.61|Biotech|6", "TEM|Tempus AI|4.32|Life Sciences Tools|14",
    "AMD|Advanced Micro Devices|3.21|Semiconductors|392", "BEAM|Beam Therapeutics|2.92|Biotech|3", "DKNG|DraftKings Inc.|2.81|Travel & Leisure|20",
    "PATH|UiPath Inc.|2.42|Software|7", "TER|Teradyne|2.21|Semi Equipment|22", "META|Meta Platforms|2.08|Interactive Media|1790", "CRCL|Circle Internet Group|2.51|Fintech|30",
  ],
  geo: [["United States", 91.4], ["Canada", 5.1], ["Switzerland", 3.5]],
};

const QUANTUM: Profile = {
  beta: 1.35, positions: 71,
  holdings: [
    "IONQ|IonQ Inc.|2.81|Quantum|17", "RGTI|Rigetti Computing|2.62|Quantum|11", "QBTS|D-Wave Quantum|2.48|Quantum|9",
    "NVDA|NVIDIA Corp.|1.92|Semiconductors|4420", "HON|Honeywell|1.71|Industrial Services|135", "IBM|IBM Corp.|1.84|IT Services|260",
    "GOOGL|Alphabet Inc.|1.66|Interactive Media|2950", "MSFT|Microsoft Corp.|1.61|Software|3780", "MU|Micron Technology|1.72|Semiconductors|192",
    "AMD|Advanced Micro Devices|1.69|Semiconductors|392", "ASML|ASML Holding|1.58|Semi Equipment|334", "LRCX|Lam Research|1.62|Semi Equipment|151",
    "TSM|Taiwan Semiconductor|1.55|Semiconductors|1310", "QCOM|Qualcomm Inc.|1.49|Semiconductors|186", "MRVL|Marvell Technology|1.51|Semiconductors|71", "NOK|Nokia Oyj|1.38|IT Hardware|30",
  ],
  sectors: [["Semiconductors", 44.2], ["Semi Equipment", 12.6], ["Quantum", 14.9], ["Software", 12.4], ["IT Services", 6.1], ["IT Hardware", 5.2], ["Industrial Services", 4.1], ["Cash & Other", 0.5]],
  geo: [["United States", 72.4], ["Japan", 8.1], ["Netherlands", 4.6], ["Taiwan", 3.2], ["Other", 11.7]],
};

const DEFENSE_US: Profile = {
  beta: 0.95, positions: 39,
  holdings: [
    "GE|GE Aerospace|18.42|Aerospace & Defense|300", "RTX|RTX Corp.|15.21|Aerospace & Defense|210", "BA|Boeing Co.|8.12|Aerospace & Defense|165",
    "HWM|Howmet Aerospace|5.21|Aerospace & Defense|80", "LMT|Lockheed Martin|4.92|Aerospace & Defense|115", "AXON|Axon Enterprise|4.61|Aerospace & Defense|58",
    "TDG|TransDigm Group|4.48|Aerospace & Defense|78", "LHX|L3Harris Technologies|4.42|Aerospace & Defense|52", "GD|General Dynamics|4.38|Aerospace & Defense|90",
    "NOC|Northrop Grumman|4.21|Aerospace & Defense|85", "TXT|Textron Inc.|2.68|Aerospace & Defense|15", "RKLB|Rocket Lab|2.41|Space|25",
    "HEI|HEICO Corp.|2.52|Aerospace & Defense|40", "CW|Curtiss-Wright|2.21|Aerospace & Defense|20", "WWD|Woodward Inc.|2.18|Aerospace & Defense|18",
    "BWXT|BWX Technologies|1.62|Aerospace & Defense|17", "HII|Huntington Ingalls|1.41|Aerospace & Defense|11", "KTOS|Kratos Defense|1.29|Aerospace & Defense|11", "LDOS|Leidos Holdings|1.12|IT Services|25",
  ],
  geo: [["United States", 100]],
};

const DEFENSE_EU: Profile = {
  beta: 0.85, positions: 28,
  holdings: [
    "RHM|Rheinmetall AG|11.24|Aerospace & Defense|95", "SAF|Safran S.A.|9.86|Aerospace & Defense|140", "BA.|BAE Systems|9.21|Aerospace & Defense|75",
    "AIR|Airbus SE|8.62|Aerospace & Defense|175", "HO|Thales S.A.|7.41|Aerospace & Defense|55", "LDO|Leonardo S.p.A.|6.92|Aerospace & Defense|32",
    "RR.|Rolls-Royce Holdings|6.51|Aerospace & Defense|120", "SAAB-B|Saab AB|6.12|Aerospace & Defense|28", "MTX|MTU Aero Engines|4.82|Aerospace & Defense|22",
    "KOG|Kongsberg Gruppen|4.21|Aerospace & Defense|30", "HAG|Hensoldt AG|3.42|Aerospace & Defense|12", "AM|Dassault Aviation|2.92|Aerospace & Defense|25",
    "R3NK|Renk Group|2.41|Machinery|8", "QQ.|QinetiQ Group|1.52|Aerospace & Defense|3", "CHG|Chemring Group|1.21|Aerospace & Defense|2",
  ],
  geo: [["Germany", 25.4], ["France", 24.2], ["United Kingdom", 18.9], ["Italy", 7.1], ["Sweden", 6.4], ["Other", 18.0]],
};

const DEFENSE_GLOBAL: Profile = {
  beta: 0.9, positions: 45,
  holdings: [
    "PLTR|Palantir Technologies|8.42|Software|420", "RHM|Rheinmetall AG|8.21|Aerospace & Defense|95", "RTX|RTX Corp.|7.42|Aerospace & Defense|210",
    "BA.|BAE Systems|7.12|Aerospace & Defense|75", "LMT|Lockheed Martin|6.62|Aerospace & Defense|115", "SAAB-B|Saab AB|5.41|Aerospace & Defense|28",
    "HO|Thales S.A.|5.12|Aerospace & Defense|55", "GD|General Dynamics|4.81|Aerospace & Defense|90", "NOC|Northrop Grumman|4.62|Aerospace & Defense|85",
    "LDO|Leonardo S.p.A.|4.42|Aerospace & Defense|32", "LHX|L3Harris Technologies|4.21|Aerospace & Defense|52", "KOG|Kongsberg Gruppen|3.12|Aerospace & Defense|30",
    "HAG|Hensoldt AG|2.81|Aerospace & Defense|12", "CACI|CACI International|2.42|IT Services|11", "012450|Hanwha Aerospace|3.41|Aerospace & Defense|30", "ELBIT|Elbit Systems|2.92|Aerospace & Defense|20",
  ],
  geo: [["United States", 46.2], ["Germany", 12.4], ["United Kingdom", 8.6], ["France", 6.2], ["Sweden", 5.4], ["Other", 21.2]],
};

const SPACE: Profile = {
  beta: 1.3, positions: 35,
  holdings: [
    "KTOS|Kratos Defense|9.12|Aerospace & Defense|11", "RKLB|Rocket Lab|8.94|Space|25", "PLTR|Palantir Technologies|6.42|Software|420",
    "IRDM|Iridium Communications|5.21|Telecom|3", "TRMB|Trimble Inc.|5.08|IT Hardware|18", "LHX|L3Harris Technologies|4.42|Aerospace & Defense|52",
    "AVAV|AeroVironment|4.31|Aerospace & Defense|12", "ACHR|Archer Aviation|3.92|Space|7", "GRMN|Garmin Ltd.|3.62|Consumer Electronics|45",
    "AMZN|Amazon.com Inc.|3.41|E-Commerce|2340", "JOBY|Joby Aviation|3.21|Space|12", "ASTS|AST SpaceMobile|3.12|Space|20",
  ],
  geo: [["United States", 88.4], ["Switzerland", 3.6], ["Other", 8.0]],
};

const single = (line: string, beta: number, geo: [string, number][]): Profile => ({ holdings: [line, "CASH|Cash & Equivalents|0.05|Cash & Other|0"], beta, geo, positions: 1 });

const GOLD = single("XAU|Physical Gold Bullion (LBMA)|99.95|Precious Metals|0", 0.12, [["United Kingdom", 96.2], ["United States", 3.8]]);
const SILVER = single("XAG|Physical Silver Bullion (LBMA)|99.95|Precious Metals|0", 0.35, [["United Kingdom", 92.4], ["United States", 7.6]]);
const BITCOIN = single("BTC|Bitcoin|99.95|Digital Assets|2150", 1.6, [["United States", 100]]);
const ETHER = single("ETH|Ether|99.95|Digital Assets|440", 1.9, [["United States", 100]]);
const DOLLAR = single("DX|US Dollar Index Futures (DXZ6)|99.95|Currency Futures|0", -0.1, [["United States", 100]]);

const OIL: Profile = {
  beta: 0.45, positions: 6,
  holdings: ["CLZ6|WTI Crude Oil Futures Dec-26|42.10|Energy Futures|0", "CLF7|WTI Crude Oil Futures Jan-27|28.40|Energy Futures|0", "CLG7|WTI Crude Oil Futures Feb-27|12.20|Energy Futures|0", "TBILL|US Treasury Bills & Cash|17.30|Cash & Other|0"],
  geo: [["United States", 100]],
};

const COMMODITY_BROAD: Profile = {
  beta: 0.4, positions: 14,
  holdings: [
    "CO|Brent Crude Futures|13.21|Energy Futures|0", "CL|WTI Crude Futures|12.41|Energy Futures|0", "XB|RBOB Gasoline Futures|12.18|Energy Futures|0",
    "HO|Heating Oil Futures|12.02|Energy Futures|0", "GC|Gold Futures|9.42|Metals Futures|0", "HG|Copper Futures|6.21|Metals Futures|0",
    "NG|Natural Gas Futures|5.81|Energy Futures|0", "LA|Aluminum Futures|4.82|Metals Futures|0", "LX|Zinc Futures|4.71|Metals Futures|0",
    "C|Corn Futures|4.62|Agriculture Futures|0", "S|Soybean Futures|4.51|Agriculture Futures|0", "W|Wheat Futures|4.38|Agriculture Futures|0",
    "SB|Sugar Futures|3.92|Agriculture Futures|0", "SI|Silver Futures|1.79|Metals Futures|0",
  ],
  geo: [["United States", 76.4], ["United Kingdom", 23.6]],
};

const COPPER_MINERS: Profile = {
  beta: 1.25, positions: 40,
  holdings: [
    "FCX|Freeport-McMoRan|5.62|Copper Mining|65", "SCCO|Southern Copper|5.24|Copper Mining|90", "IVN|Ivanhoe Mines|5.12|Copper Mining|14",
    "LUN|Lundin Mining|5.02|Copper Mining|12", "ANTO|Antofagasta plc|4.91|Copper Mining|28", "FM|First Quantum Minerals|4.86|Copper Mining|17",
    "TECK|Teck Resources|4.62|Metals & Mining|21", "BHP|BHP Group|4.41|Metals & Mining|140", "2899|Zijin Mining|4.32|Metals & Mining|80",
    "GLEN|Glencore plc|4.21|Metals & Mining|55", "KGH|KGHM Polska Miedź|4.08|Copper Mining|8", "0358|Jiangxi Copper|3.82|Copper Mining|12",
    "HBM|Hudbay Minerals|3.61|Copper Mining|5", "CS|Capstone Copper|3.42|Copper Mining|6", "BOL|Boliden AB|3.21|Metals & Mining|10",
  ],
  geo: [["Canada", 31.4], ["United States", 11.2], ["United Kingdom", 10.8], ["China", 9.6], ["Poland", 4.1], ["Other", 32.9]],
};

const ENERGY: Profile = {
  beta: 0.85, positions: 23,
  holdings: [
    "XOM|Exxon Mobil|22.81|Oil & Gas|480", "CVX|Chevron Corp.|16.92|Oil & Gas|310", "COP|ConocoPhillips|6.82|Oil & Gas E&P|115",
    "WMB|Williams Cos.|4.62|Midstream|72", "EOG|EOG Resources|4.18|Oil & Gas E&P|65", "KMI|Kinder Morgan|4.02|Midstream|60",
    "SLB|SLB Ltd.|3.82|Oilfield Services|50", "PSX|Phillips 66|3.84|Refining|55", "MPC|Marathon Petroleum|3.51|Refining|55",
    "VLO|Valero Energy|3.21|Refining|48", "BKR|Baker Hughes|3.18|Oilfield Services|45", "OKE|ONEOK Inc.|2.98|Midstream|48",
    "TRGP|Targa Resources|2.61|Midstream|36", "OXY|Occidental Petroleum|2.48|Oil & Gas E&P|45", "FANG|Diamondback Energy|2.02|Oil & Gas E&P|42",
    "EQT|EQT Corp.|1.98|Oil & Gas E&P|33", "DVN|Devon Energy|1.52|Oil & Gas E&P|22", "HAL|Halliburton|1.41|Oilfield Services|20", "CTRA|Coterra Energy|1.12|Oil & Gas E&P|19", "APA|APA Corp.|0.61|Oil & Gas E&P|8",
  ],
  geo: [["United States", 100]],
};

const OIL_EP: Profile = {
  beta: 1.15, positions: 52,
  holdings: [
    "CNX|CNX Resources|2.71|Oil & Gas E&P|5", "AR|Antero Resources|2.68|Oil & Gas E&P|11", "EQT|EQT Corp.|2.64|Oil & Gas E&P|33",
    "RRC|Range Resources|2.62|Oil & Gas E&P|9", "CTRA|Coterra Energy|2.58|Oil & Gas E&P|19", "EXE|Expand Energy|2.56|Oil & Gas E&P|24",
    "DVN|Devon Energy|2.52|Oil & Gas E&P|22", "FANG|Diamondback Energy|2.51|Oil & Gas E&P|42", "EOG|EOG Resources|2.48|Oil & Gas E&P|65",
    "COP|ConocoPhillips|2.46|Oil & Gas E&P|115", "OXY|Occidental Petroleum|2.42|Oil & Gas E&P|45", "XOM|Exxon Mobil|2.41|Oil & Gas|480",
    "CVX|Chevron Corp.|2.38|Oil & Gas|310", "MPC|Marathon Petroleum|2.36|Refining|55", "VLO|Valero Energy|2.34|Refining|48", "PSX|Phillips 66|2.31|Refining|55",
  ],
  sectors: [["Oil & Gas E&P", 72.4], ["Oil & Gas", 9.8], ["Refining", 17.1], ["Cash & Other", 0.7]],
  geo: [["United States", 100]],
};

const CLEAN: Profile = {
  beta: 1.1, positions: 120,
  holdings: [
    "FSLR|First Solar Inc.|8.12|Solar & Wind|26", "IBE|Iberdrola S.A.|6.81|Renewable Utilities|115", "VWS|Vestas Wind Systems|5.92|Solar & Wind|20",
    "SSE|SSE plc|4.62|Renewable Utilities|28", "ENPH|Enphase Energy|3.81|Solar & Wind|5", "NEE|NextEra Energy|3.62|Electric Utilities|160",
    "EDPR|EDP Renováveis|3.41|Renewable Utilities|12", "6409|China Yangtze Power|3.32|Renewable Utilities|90", "BE|Bloom Energy|3.21|Electrical Equipment|17",
    "ORSTED|Ørsted A/S|3.12|Renewable Utilities|20", "NXT|Nextracker Inc.|2.92|Solar & Wind|12", "SEDG|SolarEdge Technologies|1.81|Solar & Wind|2",
    "PLUG|Plug Power|1.62|Electrical Equipment|2", "RUN|Sunrun Inc.|1.52|Solar & Wind|4",
  ],
  geo: [["United States", 42.6], ["Spain", 9.8], ["Denmark", 9.4], ["China", 8.6], ["United Kingdom", 6.4], ["Other", 23.2]],
};

const URANIUM: Profile = {
  beta: 1.45, positions: 48,
  holdings: [
    "CCJ|Cameco Corp.|22.41|Uranium|38", "NXE|NexGen Energy|6.82|Uranium|5", "KAP|Kazatomprom|5.92|Uranium|11",
    "U.U|Sprott Physical Uranium Trust|5.21|Uranium|5", "UEC|Uranium Energy Corp.|4.81|Uranium|5", "OKLO|Oklo Inc.|4.62|Independent Power|14",
    "DML|Denison Mines|4.21|Uranium|2", "PDN|Paladin Energy|3.92|Uranium|3", "SMR|NuScale Power|3.61|Electrical Equipment|10",
    "UUUU|Energy Fuels|3.12|Uranium|2", "BWXT|BWX Technologies|2.81|Aerospace & Defense|17", "034020|Doosan Enerbility|2.62|Machinery|25",
    "LEU|Centrus Energy|2.51|Uranium|4", "CEG|Constellation Energy|2.21|Independent Power|105",
  ],
  geo: [["Canada", 48.2], ["United States", 26.4], ["Kazakhstan", 5.9], ["Australia", 7.4], ["South Korea", 4.1], ["Other", 8.0]],
};

const FINANCIALS: Profile = {
  beta: 1.05, positions: 74,
  holdings: [
    "BRK.B|Berkshire Hathaway|12.21|Insurance|1060", "JPM|JPMorgan Chase|10.62|Banks|830", "V|Visa Inc.|7.92|Payments|670",
    "MA|Mastercard|6.08|Payments|520", "BAC|Bank of America|4.48|Banks|390", "WFC|Wells Fargo|3.72|Banks|270",
    "GS|Goldman Sachs|3.21|Capital Markets|240", "AXP|American Express|2.68|Payments|240", "MS|Morgan Stanley|2.61|Capital Markets|230",
    "SPGI|S&P Global|2.58|Capital Markets|155", "PGR|Progressive Corp.|2.48|Insurance|145", "C|Citigroup Inc.|2.42|Banks|185",
    "BLK|BlackRock Inc.|2.31|Asset Management|170", "SCHW|Charles Schwab|2.21|Capital Markets|175", "CB|Chubb Ltd.|1.81|Insurance|110",
    "COF|Capital One|1.92|Banks|140", "MMC|Marsh & McLennan|1.48|Insurance|100", "CME|CME Group|1.42|Capital Markets|95", "ICE|Intercontinental Exchange|1.38|Capital Markets|95", "PYPL|PayPal Holdings|1.02|Fintech|65",
  ],
  geo: [["United States", 98.2], ["Switzerland", 1.8]],
};

const BIG_BANKS: Profile = {
  beta: 1.12, positions: 24,
  holdings: [
    "JPM|JPMorgan Chase|8.42|Banks|830", "BAC|Bank of America|8.21|Banks|390", "WFC|Wells Fargo|8.12|Banks|270",
    "GS|Goldman Sachs|8.04|Capital Markets|240", "MS|Morgan Stanley|7.92|Capital Markets|230", "C|Citigroup Inc.|7.41|Banks|185",
    "BK|Bank of New York Mellon|4.32|Banks|75", "STT|State Street Corp.|4.12|Banks|32", "PNC|PNC Financial|4.08|Banks|78",
    "USB|U.S. Bancorp|4.01|Banks|75", "TFC|Truist Financial|3.92|Banks|58", "COF|Capital One|3.88|Banks|140",
    "MTB|M&T Bank|3.42|Regional Banks|31", "FITB|Fifth Third Bancorp|3.38|Regional Banks|29", "NTRS|Northern Trust|3.12|Banks|24", "HBAN|Huntington Bancshares|3.08|Regional Banks|24",
  ],
  geo: [["United States", 100]],
};

const REGIONAL_BANKS: Profile = {
  beta: 1.25, positions: 141,
  holdings: [
    "CFG|Citizens Financial|2.71|Regional Banks|22", "HBAN|Huntington Bancshares|2.68|Regional Banks|24", "RF|Regions Financial|2.62|Regional Banks|23",
    "MTB|M&T Bank|2.58|Regional Banks|31", "FITB|Fifth Third Bancorp|2.56|Regional Banks|29", "KEY|KeyCorp|2.51|Regional Banks|19",
    "TFC|Truist Financial|2.48|Banks|58", "ZION|Zions Bancorp|2.42|Regional Banks|8", "WAL|Western Alliance|2.38|Regional Banks|9",
    "EWBC|East West Bancorp|2.36|Regional Banks|14", "FHN|First Horizon|2.31|Regional Banks|11", "WBS|Webster Financial|2.28|Regional Banks|10",
    "CMA|Comerica Inc.|2.21|Regional Banks|9", "SSB|SouthState Corp.|2.12|Regional Banks|10", "PNFP|Pinnacle Financial|2.08|Regional Banks|9", "VLY|Valley National|1.92|Regional Banks|6",
  ],
  sectors: [["Regional Banks", 88.6], ["Banks", 9.8], ["Insurance", 0.9], ["Cash & Other", 0.7]],
  geo: [["United States", 100]],
};

const INDUSTRIALS: Profile = {
  beta: 1.02, positions: 79,
  holdings: [
    "GE|GE Aerospace|6.12|Aerospace & Defense|300", "CAT|Caterpillar Inc.|5.21|Machinery|230", "RTX|RTX Corp.|4.62|Aerospace & Defense|210",
    "GEV|GE Vernova|3.81|Electrical Equipment|165", "UBER|Uber Technologies|3.58|Transportation|200", "HON|Honeywell|3.12|Industrial Services|135",
    "ETN|Eaton Corp.|3.08|Electrical Equipment|140", "UNP|Union Pacific|3.02|Transportation|135", "BA|Boeing Co.|2.98|Aerospace & Defense|165",
    "DE|Deere & Co.|2.81|Machinery|130", "ADP|Automatic Data Processing|2.62|Industrial Services|120", "PH|Parker-Hannifin|2.31|Machinery|95",
    "LMT|Lockheed Martin|2.21|Aerospace & Defense|115", "TT|Trane Technologies|2.18|Machinery|95", "WM|Waste Management|1.98|Industrial Services|88",
    "GD|General Dynamics|1.92|Aerospace & Defense|90", "MMM|3M Co.|1.81|Industrial Services|85", "UPS|United Parcel Service|1.42|Transportation|75", "PWR|Quanta Services|1.71|Engineering & Construction|60",
  ],
  geo: [["United States", 97.8], ["Ireland", 2.2]],
};

const INFRA: Profile = {
  beta: 1.1, positions: 99,
  holdings: [
    "HWM|Howmet Aerospace|3.62|Aerospace & Defense|80", "TT|Trane Technologies|3.51|Machinery|95", "ETN|Eaton Corp.|3.42|Electrical Equipment|140",
    "PH|Parker-Hannifin|3.38|Machinery|95", "CRH|CRH plc|3.31|Construction Materials|75", "SRE|Sempra|3.12|Multi-Utilities|58",
    "PWR|Quanta Services|3.21|Engineering & Construction|60", "MLM|Martin Marietta|3.04|Construction Materials|38", "VMC|Vulcan Materials|2.98|Construction Materials|38",
    "NUE|Nucor Corp.|2.92|Steel|35", "URI|United Rentals|2.88|Industrial Services|60", "FAST|Fastenal Co.|2.81|Industrial Services|48",
    "EMR|Emerson Electric|2.78|Electrical Equipment|75", "STLD|Steel Dynamics|2.42|Steel|22", "UNP|Union Pacific|2.38|Transportation|135", "CSX|CSX Corp.|2.21|Transportation|65",
  ],
  geo: [["United States", 96.4], ["Ireland", 3.6]],
};

const HEALTH: Profile = {
  beta: 0.72, positions: 61,
  holdings: [
    "LLY|Eli Lilly|12.82|Pharma|760", "JNJ|Johnson & Johnson|8.21|Pharma|450", "ABBV|AbbVie Inc.|7.42|Pharma|400",
    "UNH|UnitedHealth Group|5.12|Managed Care|310", "ABT|Abbott Laboratories|4.61|Medical Devices|225", "MRK|Merck & Co.|4.42|Pharma|215",
    "TMO|Thermo Fisher Scientific|4.12|Life Sciences Tools|185", "ISRG|Intuitive Surgical|3.62|Medical Devices|175", "AMGN|Amgen Inc.|3.38|Biotech|160",
    "BSX|Boston Scientific|3.21|Medical Devices|150", "DHR|Danaher Corp.|2.98|Life Sciences Tools|145", "PFE|Pfizer Inc.|2.92|Pharma|140",
    "GILD|Gilead Sciences|2.91|Biotech|145", "SYK|Stryker Corp.|2.82|Medical Devices|145", "VRTX|Vertex Pharmaceuticals|2.38|Biotech|105",
    "MDT|Medtronic plc|2.31|Medical Devices|120", "BMY|Bristol-Myers Squibb|1.82|Pharma|95", "CVS|CVS Health|1.72|Managed Care|95", "ELV|Elevance Health|1.42|Managed Care|78",
  ],
  geo: [["United States", 97.6], ["Ireland", 2.4]],
};

const BIOTECH: Profile = {
  beta: 0.95, positions: 260,
  holdings: [
    "VRTX|Vertex Pharmaceuticals|8.42|Biotech|105", "GILD|Gilead Sciences|8.38|Biotech|145", "AMGN|Amgen Inc.|8.02|Biotech|160",
    "REGN|Regeneron Pharma|5.62|Biotech|62", "ALNY|Alnylam Pharma|4.21|Biotech|58", "ARGX|argenx SE|3.12|Biotech|45",
    "IQV|IQVIA Holdings|3.02|Life Sciences Tools|32", "MTD|Mettler-Toledo|2.62|Life Sciences Tools|28", "INSM|Insmed Inc.|2.48|Biotech|28",
    "BIIB|Biogen Inc.|2.31|Biotech|22", "NTRA|Natera Inc.|2.42|Life Sciences Tools|27", "WAT|Waters Corp.|2.12|Life Sciences Tools|22",
    "UTHR|United Therapeutics|1.91|Biotech|19", "MRNA|Moderna Inc.|1.21|Biotech|11", "EXEL|Exelixis Inc.|1.38|Biotech|11", "BMRN|BioMarin Pharma|1.32|Biotech|11",
  ],
  sectors: [["Biotech", 78.4], ["Life Sciences Tools", 14.2], ["Pharma", 6.8], ["Cash & Other", 0.6]],
  geo: [["United States", 88.6], ["Netherlands", 3.1], ["United Kingdom", 2.4], ["Other", 5.9]],
};

const UTILITIES: Profile = {
  beta: 0.55, positions: 31,
  holdings: [
    "NEE|NextEra Energy|12.12|Electric Utilities|160", "CEG|Constellation Energy|8.21|Independent Power|105", "SO|Southern Co.|7.62|Electric Utilities|100",
    "DUK|Duke Energy|7.12|Electric Utilities|95", "VST|Vistra Corp.|6.21|Independent Power|68", "AEP|American Electric Power|5.62|Electric Utilities|60",
    "SRE|Sempra|4.62|Multi-Utilities|58", "D|Dominion Energy|4.52|Multi-Utilities|50", "EXC|Exelon Corp.|4.12|Electric Utilities|45",
    "XEL|Xcel Energy|4.02|Electric Utilities|45", "PEG|Public Service Enterprise|3.52|Multi-Utilities|42", "ETR|Entergy Corp.|3.42|Electric Utilities|40",
    "PCG|PG&E Corp.|3.12|Electric Utilities|35", "ED|Consolidated Edison|3.02|Multi-Utilities|36", "WEC|WEC Energy Group|2.91|Multi-Utilities|35", "NRG|NRG Energy|2.62|Independent Power|32",
  ],
  geo: [["United States", 100]],
};

const STAPLES: Profile = {
  beta: 0.6, positions: 38,
  holdings: [
    "COST|Costco Wholesale|10.21|Retail|410", "WMT|Walmart Inc.|10.08|Retail|830", "PG|Procter & Gamble|9.12|Household|360",
    "KO|Coca-Cola Co.|6.21|Beverages|300", "PM|Philip Morris International|6.12|Tobacco|250", "PEP|PepsiCo Inc.|5.12|Beverages|200",
    "MO|Altria Group|4.62|Tobacco|100", "MDLZ|Mondelez International|4.21|Food Products|85", "CL|Colgate-Palmolive|4.02|Household|70",
    "MNST|Monster Beverage|3.12|Beverages|65", "TGT|Target Corp.|2.92|Specialty Retail|45", "KR|Kroger Co.|2.98|Retail|45",
    "KDP|Keurig Dr Pepper|2.48|Beverages|45", "KMB|Kimberly-Clark|2.42|Household|42", "SYY|Sysco Corp.|2.38|Food Products|38", "GIS|General Mills|1.98|Food Products|30",
  ],
  geo: [["United States", 100]],
};

const DISCRETIONARY: Profile = {
  beta: 1.18, positions: 51,
  holdings: [
    "AMZN|Amazon.com Inc.|22.12|E-Commerce|2340", "TSLA|Tesla Inc.|17.21|Automobiles|1430", "HD|Home Depot|6.42|Home Improvement|390",
    "MCD|McDonald's Corp.|4.42|Restaurants|215", "BKNG|Booking Holdings|4.31|Travel & Leisure|170", "TJX|TJX Companies|4.02|Specialty Retail|160",
    "LOW|Lowe's Cos.|3.52|Home Improvement|140", "SBUX|Starbucks Corp.|2.62|Restaurants|95", "ORLY|O'Reilly Automotive|2.48|Specialty Retail|85",
    "RCL|Royal Caribbean|2.21|Travel & Leisure|85", "NKE|Nike Inc.|2.02|Apparel|100", "MAR|Marriott International|2.01|Travel & Leisure|75",
    "ABNB|Airbnb Inc.|1.92|Travel & Leisure|80", "GM|General Motors|1.62|Automobiles|55", "CMG|Chipotle Mexican Grill|1.42|Restaurants|55", "AZO|AutoZone Inc.|1.82|Specialty Retail|68",
  ],
  geo: [["United States", 100]],
};

const TREASURY: Profile = {
  beta: -0.15, positions: 42,
  holdings: [
    "T 4.75 05/53|US Treasury 4.75% 15-May-2053|5.62|US Treasuries|0", "T 4.625 05/54|US Treasury 4.625% 15-May-2054|5.48|US Treasuries|0",
    "T 4.25 08/54|US Treasury 4.25% 15-Aug-2054|5.31|US Treasuries|0", "T 4.5 11/54|US Treasury 4.5% 15-Nov-2054|5.18|US Treasuries|0",
    "T 4.125 08/53|US Treasury 4.125% 15-Aug-2053|4.92|US Treasuries|0", "T 4.0 11/52|US Treasury 4.0% 15-Nov-2052|4.71|US Treasuries|0",
    "T 3.625 02/53|US Treasury 3.625% 15-Feb-2053|4.52|US Treasuries|0", "T 4.75 02/55|US Treasury 4.75% 15-Feb-2055|4.48|US Treasuries|0",
    "T 3.0 08/52|US Treasury 3.0% 15-Aug-2052|4.21|US Treasuries|0", "T 2.875 05/52|US Treasury 2.875% 15-May-2052|4.08|US Treasuries|0",
    "T 2.25 02/52|US Treasury 2.25% 15-Feb-2052|3.92|US Treasuries|0", "T 2.0 08/51|US Treasury 2.0% 15-Aug-2051|3.81|US Treasuries|0",
    "T 1.875 11/51|US Treasury 1.875% 15-Nov-2051|3.62|US Treasuries|0", "T 2.375 05/51|US Treasury 2.375% 15-May-2051|3.48|US Treasuries|0",
  ],
  sectors: [["US Treasuries", 99.8], ["Cash & Other", 0.2]],
  geo: [["United States", 100]],
};

const EUROPE: Profile = {
  beta: 0.85, positions: 1270,
  holdings: [
    "ASML|ASML Holding|3.12|Semi Equipment|334", "SAP|SAP SE|2.62|Software|320", "NESN|Nestlé S.A.|2.04|Food Products|250",
    "NOVN|Novartis AG|1.92|Pharma|235", "ROG|Roche Holding|1.96|Pharma|260", "AZN|AstraZeneca|2.01|Pharma|240",
    "HSBA|HSBC Holdings|1.88|Banks|230", "SHEL|Shell plc|1.76|Oil & Gas|215", "NOVO-B|Novo Nordisk|1.62|Pharma|240",
    "MC|LVMH|1.24|Apparel|340", "SIE|Siemens AG|1.38|Industrial Services|200", "ALV|Allianz SE|1.04|Insurance|160",
    "SU|Schneider Electric|1.04|Electrical Equipment|150", "ULVR|Unilever plc|1.16|Household|150", "RHM|Rheinmetall AG|0.62|Aerospace & Defense|95",
    "SAN|Banco Santander|0.88|Banks|140", "TTE|TotalEnergies|0.96|Oil & Gas|140", "AIR|Airbus SE|0.92|Aerospace & Defense|175", "PKO|PKO Bank Polski|0.18|Banks|25",
  ],
  sectors: [
    ["Banks", 13.6], ["Insurance", 5.2], ["Capital Markets", 3.4], ["Pharma", 11.8], ["Medical Devices", 2.4], ["Industrial Services", 8.1], ["Aerospace & Defense", 3.8],
    ["Electrical Equipment", 3.1], ["Machinery", 3.6], ["Semi Equipment", 3.4], ["Software", 3.6], ["Food Products", 4.2], ["Household", 2.6], ["Beverages", 1.8],
    ["Apparel", 3.4], ["Automobiles", 2.6], ["Oil & Gas", 4.6], ["Chemicals", 3.2], ["Metals & Mining", 2.6], ["Telecom", 3.1], ["Electric Utilities", 4.1], ["Cash & Other", 0.3],
  ],
  geo: [["United Kingdom", 22.4], ["France", 15.8], ["Switzerland", 14.6], ["Germany", 14.1], ["Netherlands", 7.2], ["Other", 25.9]],
};

const CHINA: Profile = {
  beta: 0.75, positions: 560,
  holdings: [
    "TCEHY|Tencent Holdings|16.42|Interactive Media|640", "BABA|Alibaba Group|10.21|E-Commerce|360", "1810|Xiaomi Corp.|4.62|Consumer Electronics|170",
    "3690|Meituan|3.81|E-Commerce|110", "939|China Construction Bank|3.62|Banks|240", "PDD|PDD Holdings|3.12|E-Commerce|170",
    "1211|BYD Co.|2.71|Automobiles|130", "1398|ICBC|2.48|Banks|300", "9888|Baidu Inc.|1.92|Interactive Media|38",
    "1299|AIA Group|1.86|Insurance|90", "2318|Ping An Insurance|1.81|Insurance|130", "3988|Bank of China|1.62|Banks|200",
    "9618|JD.com|1.42|E-Commerce|45", "NTES|NetEase Inc.|1.38|Entertainment|80", "TCOM|Trip.com Group|1.21|Travel & Leisure|42", "883|CNOOC Ltd.|0.98|Oil & Gas|110",
  ],
  sectors: [
    ["Interactive Media", 21.6], ["Entertainment", 3.4], ["E-Commerce", 22.8], ["Automobiles", 5.4], ["Travel & Leisure", 2.6], ["Banks", 13.9], ["Insurance", 5.6],
    ["Consumer Electronics", 6.1], ["IT Hardware", 2.1], ["Pharma", 3.2], ["Oil & Gas", 2.6], ["Industrial Services", 3.8], ["Real Estate", 2.1], ["Food Products", 2.4], ["Cash & Other", 0.4],
  ],
  geo: [["China", 100]],
};

const AGRICULTURE: Profile = {
  beta: 0.2, positions: 10,
  holdings: [
    "KC|Coffee Futures|14.21|Agriculture Futures|0", "CC|Cocoa Futures|13.62|Agriculture Futures|0", "S|Soybean Futures|12.48|Agriculture Futures|0",
    "SB|Sugar Futures|11.92|Agriculture Futures|0", "C|Corn Futures|11.61|Agriculture Futures|0", "W|Wheat Futures|10.82|Agriculture Futures|0",
    "LC|Live Cattle Futures|10.41|Agriculture Futures|0", "LH|Lean Hogs Futures|7.12|Agriculture Futures|0", "FC|Feeder Cattle Futures|4.81|Agriculture Futures|0", "KW|KC Wheat Futures|3.00|Agriculture Futures|0",
  ],
  geo: [["United States", 100]],
};

const FINTECH: Profile = {
  beta: 1.4, positions: 64,
  holdings: [
    "COIN|Coinbase Global|7.42|Capital Markets|90", "SHOP|Shopify Inc.|7.12|Software|190", "HOOD|Robinhood Markets|6.81|Capital Markets|110",
    "PYPL|PayPal Holdings|5.62|Fintech|65", "XYZ|Block Inc.|5.21|Fintech|45", "FI|Fiserv Inc.|4.92|Payments|90",
    "ADYEN|Adyen N.V.|4.61|Payments|50", "INTU|Intuit Inc.|4.42|Software|185", "SOFI|SoFi Technologies|4.21|Fintech|30",
    "AFRM|Affirm Holdings|3.81|Fintech|22", "NU|Nu Holdings|3.62|Banks|75", "TOST|Toast Inc.|3.12|Software|22",
    "CRCL|Circle Internet Group|2.81|Fintech|30", "SSNC|SS&C Technologies|2.62|Software|21", "GWRE|Guidewire Software|2.42|Software|18",
  ],
  geo: [["United States", 72.4], ["Netherlands", 4.6], ["Brazil", 3.6], ["Canada", 7.1], ["Other", 12.3]],
};

const INSURANCE: Profile = {
  beta: 0.75, positions: 50,
  holdings: [
    "PGR|Progressive Corp.|2.31|Insurance|145", "ALL|Allstate Corp.|2.28|Insurance|52", "TRV|Travelers Cos.|2.26|Insurance|62",
    "CB|Chubb Ltd.|2.24|Insurance|110", "AIG|American International Group|2.22|Insurance|46", "MET|MetLife Inc.|2.21|Insurance|55",
    "PRU|Prudential Financial|2.18|Insurance|40", "HIG|Hartford Insurance|2.16|Insurance|36", "AFL|Aflac Inc.|2.14|Insurance|58",
    "WRB|W. R. Berkley|2.12|Insurance|28", "CINF|Cincinnati Financial|2.09|Insurance|24", "L|Loews Corp.|2.06|Insurance|20",
    "MKL|Markel Group|2.04|Insurance|25", "ERIE|Erie Indemnity|2.01|Insurance|20", "AJG|Arthur J. Gallagher|1.98|Insurance|75",
  ],
  sectors: [["Insurance", 99.2], ["Cash & Other", 0.8]],
  geo: [["United States", 94.2], ["Switzerland", 2.2], ["Other", 3.6]],
};

/** Ticker → composition profile. */
export const PROFILE_OF: Record<string, Profile> = {
  SPY: SP500, VOO: SP500, IVV: SP500, CSPX: SP500, RSP: SP500, VTI: SP500,
  QQQ: NASDAQ100, TQQQ: NASDAQ100, SQQQ: NASDAQ100,
  VT: WORLD, ACWI: WORLD, VWCE: WORLD, EUNL: WORLD_DEV, IWDA: WORLD_DEV,
  VEA: EX_US, IEFA: EX_US, VXUS: EX_US, EEM: EM, VWO: EM,
  IWM: SMALLCAP, DIA: DOW, SCHD: DIVIDEND, VGK: EUROPE, MCHI: CHINA, FXI: CHINA,
  DBA: AGRICULTURE, FINX: FINTECH, ARKF: FINTECH, KIE: INSURANCE,
  SMH: SEMIS_SMH, SOXX: SEMIS_SOXX, SOXL: SEMIS_SOXX,
  XLK: TECH, VGT: TECH, IGV: SOFTWARE, SKYY: SOFTWARE, CIBR: CYBER, BOTZ: ROBOTICS_AI, AIQ: ROBOTICS_AI, ARKK: ARK, QTUM: QUANTUM,
  ITA: DEFENSE_US, XAR: DEFENSE_US, PPA: DEFENSE_US, DFEN: DEFENSE_US, EUAD: DEFENSE_EU, DFNS: DEFENSE_EU, SHLD: DEFENSE_GLOBAL, NATO: DEFENSE_GLOBAL, ARKX: SPACE,
  GLD: GOLD, IAU: GOLD, SLV: SILVER, USO: OIL, DBC: COMMODITY_BROAD, COPX: COPPER_MINERS,
  XLE: ENERGY, VDE: ENERGY, XOP: OIL_EP, ICLN: CLEAN, URA: URANIUM,
  XLF: FINANCIALS, VFH: FINANCIALS, KBWB: BIG_BANKS, KRE: REGIONAL_BANKS, KBE: REGIONAL_BANKS,
  XLI: INDUSTRIALS, VIS: INDUSTRIALS, PAVE: INFRA,
  IBIT: BITCOIN, FBTC: BITCOIN, ETHA: ETHER,
  XLV: HEALTH, VHT: HEALTH, IBB: BIOTECH, XBI: BIOTECH,
  XLU: UTILITIES, XLP: STAPLES, XLY: DISCRETIONARY, VCR: DISCRETIONARY, TLT: TREASURY, UUP: DOLLAR,
};

/** Funds whose index is equal-weighted: every holding gets ~the same weight. */
export const EQUAL_WEIGHT = new Set(["RSP", "XBI", "XOP", "KRE", "KBE", "KIE"]);

/** [price $, TER %] — illustrative. */
export const QUOTE: Record<string, [number, number]> = {
  SPY: [669.21, 0.0945], QQQ: [603.48, 0.2], VOO: [615.33, 0.03], IVV: [672.42, 0.03], VTI: [328.61, 0.03], IWM: [241.72, 0.19], EEM: [52.41, 0.7],
  DIA: [465.83, 0.16], RSP: [189.31, 0.2], VEA: [59.62, 0.03], VWO: [53.12, 0.07], IEFA: [86.24, 0.07], VXUS: [72.38, 0.05], VT: [136.21, 0.06],
  ACWI: [138.92, 0.32], SCHD: [27.41, 0.06], CSPX: [712.38, 0.07], VWCE: [141.62, 0.19], EUNL: [108.31, 0.2], IWDA: [106.94, 0.2],
  SOXX: [287.42, 0.34], SMH: [312.61, 0.35], TQQQ: [98.42, 0.82], XLK: [282.14, 0.08], VGT: [712.53, 0.09], IGV: [112.31, 0.39], SOXL: [34.82, 0.75],
  BOTZ: [35.21, 0.68], AIQ: [46.12, 0.68], ARKK: [82.41, 0.75], CIBR: [74.62, 0.59], SKYY: [128.42, 0.6], QTUM: [98.12, 0.4],
  ITA: [196.31, 0.38], XAR: [228.42, 0.35], PPA: [151.24, 0.58], DFEN: [58.62, 0.95], SHLD: [64.21, 0.5], NATO: [35.82, 0.35], EUAD: [41.24, 0.5], DFNS: [52.61, 0.55], ARKX: [25.71, 0.75],
  GLD: [352.84, 0.4], SLV: [41.22, 0.5], IAU: [72.13, 0.25], USO: [72.41, 0.6], DBC: [22.62, 0.87], COPX: [54.31, 0.65],
  XLE: [89.42, 0.08], VDE: [124.61, 0.09], XOP: [131.52, 0.35], ICLN: [15.31, 0.39], URA: [46.82, 0.69],
  XLF: [53.21, 0.08], VFH: [129.72, 0.09], KRE: [63.12, 0.35], KBE: [59.41, 0.35], KBWB: [76.82, 0.35],
  XLI: [152.61, 0.08], VIS: [293.42, 0.09], PAVE: [46.21, 0.47],
  IBIT: [68.92, 0.25], XLV: [141.21, 0.08], FBTC: [104.32, 0.25], ETHA: [31.42, 0.25], VHT: [258.12, 0.09], IBB: [148.72, 0.44], XBI: [104.21, 0.35],
  VGK: [79.84, 0.06], MCHI: [62.41, 0.59], FXI: [38.62, 0.74], DBA: [26.18, 0.93], FINX: [34.21, 0.68], ARKF: [48.92, 0.75], KIE: [58.31, 0.35],
  XLU: [86.72, 0.08], XLP: [79.61, 0.08], XLY: [238.52, 0.08], TLT: [89.31, 0.15], SQQQ: [15.22, 0.95], VCR: [389.21, 0.09], UUP: [27.12, 0.77],
};
