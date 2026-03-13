export interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
}

export function calculateSubtotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
}

export function calculateTax(subtotal: number, rate: number = 0.08): number {
  return Math.round(subtotal * rate * 100) / 100
}

export function calculateTotal(items: CartItem[], taxRate?: number): number {
  const subtotal = calculateSubtotal(items)
  const tax = calculateTax(subtotal, taxRate)
  return subtotal + tax
}

export function applyDiscount(
  total: number,
  code: string
): { discountedTotal: number; savings: number } {
  const discounts: Record<string, number> = {
    SAVE10: 0.1,
    SAVE20: 0.2,
    HALF: 0.5,
  }

  const rate = discounts[code.toUpperCase()]
  if (!rate) {
    throw new Error(`Invalid discount code: ${code}`)
  }

  const savings = Math.round(total * rate * 100) / 100
  return { discountedTotal: total - savings, savings }
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount)
}
