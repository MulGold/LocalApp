/**
 * Utility functions for currency and price formatting across the application.
 * Formats Philippine Peso prices with ₱ symbol, comma thousands separator, and exactly 2 decimal places.
 * E.g., 120 -> ₱120.00, 1200 -> ₱1,200.00, 12000 -> ₱12,000.00, 120000 -> ₱120,000.00, 1200.50 -> ₱1,200.50
 */
export const formatPrice = (amount: number | string | null | undefined): string => {
  if (amount === null || amount === undefined || amount === '') {
    return '₱0.00';
  }
  const num = Number(amount);
  if (isNaN(num)) {
    return '₱0.00';
  }
  return `₱${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatNumber = (amount: number | string | null | undefined): string => {
  if (amount === null || amount === undefined || amount === '') {
    return '0.00';
  }
  const num = Number(amount);
  if (isNaN(num)) {
    return '0.00';
  }
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
