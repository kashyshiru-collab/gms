export const ACTIVE_BROKER = "DERIV_INHOUSE_TRADING" as const;
export const ACTIVE_BROKER_NAME = "DERIV INHOUSE TRADING";

export const MAX_TRADE_STAKE_USD = 500;
export const SPOT_LEVERAGE = 12;
export const SPOT_MAX_PROFIT_RATE = 0.35;
export const BINARY_PAYOUT_MULTIPLIER = 1.72;

export const DIGIT_OVER_PAYOUTS = [1.03, 1.1, 1.18, 1.3, 1.48, 1.7, 2.05, 2.55, 3.2, 1.03] as const;
export const DIGIT_UNDER_PAYOUTS = [1.03, 3.2, 2.55, 2.05, 1.7, 1.48, 1.3, 1.18, 1.1, 1.03] as const;
