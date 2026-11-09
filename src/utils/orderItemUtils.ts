export interface AggregatedOrderItem {
  id?: string | number;
  name: string;
  quantity: number;
  price: number;
  image?: string;
  [key: string]: any;
}

/**
 * Formats a numeric quantity cleanly:
 * - Integer quantities display as whole numbers (e.g. 2 -> "2", 1 -> "1")
 * - Fractional quantities display trimmed decimals (e.g. 1.5 -> "1.5")
 */
export const formatQuantityValue = (qty: number): string => {
  if (Number.isInteger(qty)) {
    return String(qty);
  }
  return String(Number(qty.toFixed(4)));
};

/**
 * 1. getAggregatedOrderItems(items)
 * - Accepts an order items array.
 * - Groups duplicate products by normalized name (case-insensitive trim).
 * - Sums their quantities safely using Number().
 * - Invalid/missing quantity retains the existing application's fallback behavior of 1.
 * - Preserves the first item's image/price metadata when grouping.
 * - Preserves the existing item order based on first occurrence.
 * - Does not mutate the original array.
 */
export const getAggregatedOrderItems = (items: any[]): AggregatedOrderItem[] => {
  if (!Array.isArray(items) || items.length === 0) return [];

  const map = new Map<string, AggregatedOrderItem>();

  for (const item of items) {
    if (!item) continue;
    const rawName = typeof item.name === 'string' ? item.name.trim() : '';
    const name = rawName || 'Special Order';
    const key = name.toLowerCase();

    const rawQty = Number(item.quantity);
    const validQty = !isNaN(rawQty) && rawQty > 0 ? rawQty : 1;

    if (map.has(key)) {
      const existing = map.get(key)!;
      existing.quantity += validQty;
    } else {
      map.set(key, {
        ...item,
        name,
        quantity: validQty,
        price: Number(item.price) || 0,
        image: item.image || undefined,
      });
    }
  }

  return Array.from(map.values());
};

/**
 * 2. formatOrderItemsSummary(items)
 * Returns: "Spicy Tofu Sisig ×2, Sizzling Sisig ×1"
 * Rules:
 * - Include every distinct menu item.
 * - Include its total quantity.
 * - Preserve the existing item order based on first occurrence.
 * - If there are no valid items, return the existing fallback "Special Order".
 * - Do not truncate the actual data.
 */
export const formatOrderItemsSummary = (items: any[]): string => {
  const aggregated = getAggregatedOrderItems(items);
  if (aggregated.length === 0) {
    return 'Special Order';
  }

  return aggregated
    .map((item) => `${item.name} ×${formatQuantityValue(item.quantity)}`)
    .join(', ');
};

/**
 * 3. calculateTotalOrderQuantity(items)
 * Returns the sum of all item quantities.
 * Example:
 * [
 *   { name: "Spicy Tofu Sisig", quantity: 2 },
 *   { name: "Sizzling Sisig", quantity: 1 }
 * ]
 * returns 3.
 * Uses Number(item.quantity) safely so string quantities do not cause string concatenation.
 */
export const calculateTotalOrderQuantity = (items: any[]): number => {
  if (!Array.isArray(items) || items.length === 0) return 0;

  return items.reduce((sum, item) => {
    if (!item) return sum;
    const rawQty = Number(item.quantity);
    const validQty = !isNaN(rawQty) && rawQty > 0 ? rawQty : 1;
    return sum + validQty;
  }, 0);
};
