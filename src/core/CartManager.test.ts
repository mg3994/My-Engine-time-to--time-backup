import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CartManager } from './CartManager';

describe('CartManager', () => {
  let cart: CartManager;

  beforeEach(() => {
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: vi.fn((key: string) => store[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          store[key] = value.toString();
        }),
        clear: vi.fn(() => {
          store = {};
        }),
        removeItem: vi.fn((key: string) => {
          delete store[key];
        }),
      };
    })();

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    });

    window.localStorage.clear();
    cart = new CartManager();
  });

  it('should add item and calculate total', () => {
    cart.addItem({
      "@type": "Product",
      name: 'Item 1',
      offers: { price: 100, priceCurrency: 'INR' },
      url: 'http://test.com/p1'
    } as any);

    expect(cart.getTotalQuantity()).toBe(1);
    expect((cart.getOrder() as any).totalPrice).toBe(100);
  });

  it('should increment quantity for same item with different prices (merging)', () => {
    const item1 = { "@type": "Product", name: 'Item 1', offers: { price: 100 }, url: 'http://test.com/p1' } as any;
    const item2 = { "@type": "Product", name: 'Item 1', offers: { price: 120 }, url: 'http://test.com/p1' } as any;

    cart.addItem(item1);
    cart.addItem(item2);

    expect(Array.isArray(cart.getOrder().orderedItem) ? (cart.getOrder().orderedItem as any[]).length : 1).toBe(1);
    expect(Array.isArray(cart.getOrder().orderedItem) ? (cart.getOrder().orderedItem as any[]).length : 1).toBe(1);
    expect(cart.getTotalQuantity()).toBe(2);
  });

  it('should update price in place and not duplicate during refresh', () => {
    const item = { "@type": "Product", name: 'Item 1', offers: { price: 100 }, url: 'http://test.com/p1' } as any;
    cart.addItem(item);

    const freshData = { "@type": "Product", name: 'Item 1', offers: { price: 150 }, url: 'http://test.com/p1' } as any;
    cart.updateItemDetails(0, freshData);

    expect(Array.isArray(cart.getOrder().orderedItem) ? (cart.getOrder().orderedItem as any[]).length : 1).toBe(1);
    expect((cart.getOrder() as any).totalPrice).toBe(150);
  });

  it('should handle variants correctly and distinguish them', () => {
    const base = { "@type": "Product", name: 'Phone', url: 'http://test.com/phone' };
    const v1 = { ...base, color: 'Red', offers: { price: 500 } } as any;
    const v2 = { ...base, color: 'Blue', offers: { price: 500 } } as any;

    cart.addItem(v1, undefined, { color: 'Red' });
    cart.addItem(v2, undefined, { color: 'Blue' });

    expect(Array.isArray(cart.getOrder().orderedItem) ? (cart.getOrder().orderedItem as any[]).length : 1).toBe(2);
  });
});
