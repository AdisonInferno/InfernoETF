import type { Lesson, Level, SectionId } from "./types";

export const LEVELS: { level: Level; title: string; blurb: string }[] = [
  { level: 1, title: "Foundations", blurb: "Start here: what investing and ETFs are, and what they cost." },
  { level: 2, title: "Build a portfolio", blurb: "Mix asset classes, sectors and currencies — and keep the mix in shape." },
  { level: 3, title: "Returns & risk", blurb: "Measure how a portfolio did and how bumpy the ride was." },
  { level: 4, title: "Advanced", blurb: "Benchmarks, index tracking, bonds and tail risk." },
];

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "basics", label: "Basics" },
  { id: "etf", label: "The ETF" },
  { id: "costs", label: "Costs & liquidity" },
  { id: "dividends", label: "Dividends" },
  { id: "portfolio", label: "Portfolio building" },
  { id: "sectors", label: "Sectors & regions" },
  { id: "currency", label: "Currency" },
  { id: "rebalancing", label: "Rebalancing" },
  { id: "returns", label: "Returns" },
  { id: "risk", label: "Risk" },
  { id: "benchmark", label: "Vs. benchmark" },
  { id: "tracking", label: "Index tracking" },
  { id: "bonds", label: "Bonds" },
];

export const LESSONS: Lesson[] = [
  // ── Level 1 · Foundations
  { id: "investing", n: 1, level: 1, title: "What investing is", minutes: 5,
    blurb: "Stocks, bonds and indexes — and why time is your best friend.",
    terms: ["stock", "bond", "index", "compound-interest", "inflation", "diversification"] },
  { id: "what-is-etf", n: 2, level: 1, title: "What an ETF is", minutes: 6,
    blurb: "How a basket of hundreds of companies trades like one share.",
    terms: ["etf", "ticker", "isin", "issuer", "ucits", "aum", "nav"] },
  { id: "costs", n: 3, level: 1, title: "What an ETF costs", minutes: 5,
    blurb: "The visible and the hidden costs that eat into returns.",
    terms: ["ter", "spread", "commission", "tracking-difference", "withholding-tax"] },
  { id: "dividends", n: 4, level: 1, title: "Dividends: reinvest or pay out", minutes: 4,
    blurb: "Accumulating vs. distributing ETFs and how dividends are paid.",
    terms: ["dividend", "acc-dist", "dividend-yield", "ex-dividend-date", "share-class"] },

  // ── Level 2 · Build a portfolio
  { id: "asset-classes", n: 5, level: 2, title: "Asset classes & allocation", minutes: 6,
    blurb: "Stocks, bonds, commodities — and how much of each suits you.",
    terms: ["asset-class", "equity-etf", "bond-etf", "commodity-etf", "asset-allocation", "risk-tolerance"] },
  { id: "sectors-regions", n: 6, level: 2, title: "Sectors & regions", minutes: 5,
    blurb: "Where your money really sits: which industries and which countries.",
    terms: ["sector", "cyclical", "defensive", "market-cap-weighting", "developed-emerging", "home-bias"] },
  { id: "currency", n: 7, level: 2, title: "Currency & hedging", minutes: 4,
    blurb: "Why a fund in dollars can win or lose just from exchange rates.",
    terms: ["base-currency", "trading-currency", "currency-risk", "currency-hedging"] },
  { id: "rebalancing", n: 8, level: 2, title: "Rebalancing & regular investing", minutes: 5,
    blurb: "Keeping your mix on target and investing a little every month.",
    terms: ["rebalancing", "calendar-rebalancing", "threshold-rebalancing", "cashflow-rebalancing", "dca"] },

  // ── Level 3 · Returns & risk
  { id: "returns", n: 9, level: 3, title: "Measuring returns", minutes: 6,
    blurb: "Total, yearly, time-weighted and money-weighted returns.",
    terms: ["total-return", "cagr", "twr", "xirr", "real-return"] },
  { id: "volatility", n: 10, level: 3, title: "Volatility & drawdown", minutes: 6,
    blurb: "How bumpy the ride is — and how deep the worst dip went.",
    terms: ["volatility", "max-drawdown", "recovery-time", "risk-free-rate"] },
  { id: "risk-adjusted", n: 11, level: 3, title: "Return per unit of risk", minutes: 5,
    blurb: "Was the return worth the stress? Sharpe, Sortino, Calmar.",
    terms: ["sharpe", "sortino", "calmar"] },
  { id: "correlation", n: 12, level: 3, title: "Correlation & overlap", minutes: 4,
    blurb: "Do your funds really diversify — or hold the same companies?",
    terms: ["correlation", "etf-overlap", "concentration-risk"] },

  // ── Level 4 · Advanced
  { id: "benchmark", n: 13, level: 4, title: "Comparing with a benchmark", minutes: 7,
    blurb: "Beta, alpha and friends: how a fund behaves against its yardstick.",
    terms: ["benchmark", "beta", "alpha", "r-squared", "tracking-error", "information-ratio", "capture-ratio"] },
  { id: "tracking", n: 14, level: 4, title: "How an ETF tracks its index", minutes: 6,
    blurb: "Physical, sampled and synthetic replication — and special ETFs.",
    terms: ["physical-replication", "sampling", "synthetic-replication", "securities-lending", "active-etf", "leveraged-inverse"] },
  { id: "bonds", n: 15, level: 4, title: "Bonds up close", minutes: 6,
    blurb: "Coupons, yields and why bond prices fall when rates rise.",
    terms: ["coupon", "maturity", "ytm", "duration", "credit-rating", "interest-rate-risk"] },
  { id: "tail-risk", n: 16, level: 4, title: "Tail risk & bad scenarios", minutes: 5,
    blurb: "The rare, painful years that averages hide.",
    terms: ["tail-risk", "var-cvar", "skewness", "kurtosis"] },
  { id: "withdrawals", n: 17, level: 4, title: "Living off a portfolio", minutes: 5,
    blurb: "How much you can withdraw each year without running out.",
    terms: ["swr", "four-percent-rule", "sequence-risk"] },
];

export const levelOf = (lessonId: string): Level => LESSONS.find((l) => l.id === lessonId)?.level ?? 1;
