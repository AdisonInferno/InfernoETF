/* One place for the short metric explanations shown on hover across the Deep View
   (Overview metric strip, Charts risk / income panels; live chart stats explain themselves in InfernoChart). Definitions describe how the numbers are meant — they do not
   change any calculation. */

export const METRIC_INFO = {
  AUM: "Assets under management — total value of the fund's holdings, USD.",
  TER: "Total expense ratio — yearly fund costs as % of assets, taken out of the NAV.",
  DIV_YIELD: "Distribution yield — yearly distributions as % of price. 0% = accumulating (income reinvested).",
  NAV_PREM: "Premium (+) or discount (−) of the market price vs the fund's net asset value, %.",
  BETA: "Sensitivity to the S&P 500. 1.00 = moves with the market; 1.30 ≈ 30% bigger swings. Ratio, not %.",
  VOL_30D: "Annualised standard deviation of daily returns over the last 30 days, %.",
  SHARPE: "Return above cash per unit of volatility. Higher = better risk-adjusted return. Ratio.",
  MAX_DD: "Largest peak-to-trough fall in price, %.",
} as const;

/** Values derived by the placeholder fund model (buildFund), not from a market data feed. */
export const MODEL_NOTE = "Model estimate from the placeholder fund profile — not live market data.";
