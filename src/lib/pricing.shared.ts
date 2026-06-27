export type Category = "forex" | "metals" | "synthetic";

export type PairDef = {
  symbol: string;
  label: string;
  kind: "fx" | "synthetic";
  category: Category;
  yahoo?: string;
  seedOffset?: number;
  vol?: number;
  basePrice?: number;
  decimals: number;
};

export const PAIRS: PairDef[] = [
  { symbol: "EURUSD", label: "Euro / US Dollar", kind: "fx", category: "forex", yahoo: "EURUSD=X", decimals: 5 },
  { symbol: "GBPUSD", label: "British Pound / US Dollar", kind: "fx", category: "forex", yahoo: "GBPUSD=X", decimals: 5 },
  { symbol: "USDJPY", label: "US Dollar / Japanese Yen", kind: "fx", category: "forex", yahoo: "JPY=X", decimals: 3 },
  { symbol: "AUDUSD", label: "Australian Dollar / US Dollar", kind: "fx", category: "forex", yahoo: "AUDUSD=X", decimals: 5 },
  { symbol: "USDCHF", label: "US Dollar / Swiss Franc", kind: "fx", category: "forex", yahoo: "CHF=X", decimals: 5 },
  { symbol: "XAUUSD", label: "Gold / US Dollar", kind: "fx", category: "metals", yahoo: "XAUUSD=X", decimals: 3 },
  { symbol: "XAGUSD", label: "Silver / US Dollar", kind: "fx", category: "metals", yahoo: "XAGUSD=X", decimals: 4 },
  { symbol: "XPTUSD", label: "Platinum / US Dollar", kind: "fx", category: "metals", yahoo: "XPTUSD=X", decimals: 3 },
  { symbol: "VOL10", label: "Volatility 10 Index", kind: "synthetic", category: "synthetic", seedOffset: 1011, vol: 0.0006, basePrice: 1.034, decimals: 5 },
  { symbol: "VOL25", label: "Volatility 25 Index", kind: "synthetic", category: "synthetic", seedOffset: 2025, vol: 0.0015, basePrice: 1.185, decimals: 5 },
  { symbol: "VOL50", label: "Volatility 50 Index", kind: "synthetic", category: "synthetic", seedOffset: 3050, vol: 0.003, basePrice: 1.5, decimals: 5 },
  { symbol: "VOL100", label: "Volatility 100 Index", kind: "synthetic", category: "synthetic", seedOffset: 4100, vol: 0.006, basePrice: 1.9, decimals: 5 },
  { symbol: "BOOM500", label: "Boom 500 Index", kind: "synthetic", category: "synthetic", seedOffset: 5500, vol: 0.002, basePrice: 9500, decimals: 4 },
  { symbol: "CRASH500", label: "Crash 500 Index", kind: "synthetic", category: "synthetic", seedOffset: 5501, vol: 0.002, basePrice: 8500, decimals: 4 },
];

export function findPair(symbol: string): PairDef | undefined {
  return PAIRS.find((p) => p.symbol === symbol);
}
