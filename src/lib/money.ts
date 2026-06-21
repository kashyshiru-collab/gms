export const APP_CURRENCY = "USD";
export const MIN_DEPOSIT_USD = 3;
export const MIN_WITHDRAWAL_USD = 1;

export function formatMoney(n: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: APP_CURRENCY,
    maximumFractionDigits,
  }).format(n);
}
