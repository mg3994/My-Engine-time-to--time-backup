import { Order, Product, Service, Organization } from '../types/schema';
import { SchemaExtractor } from './SchemaExtractor';

export class CartManager {
  private order: Order & { totalPrice?: number; priceCurrency?: string };
  private storageKey = "antinna_cart_order";

  constructor() {
    this.order = this.loadFromStorage() || {
      "@type": "Order",
      orderedItem: [],
      totalPrice: 0,
      priceCurrency: "INR",
    } as any;
    this.deduplicate();
  }

  private loadFromStorage(): Order | null {
    const data = localStorage.getItem(this.storageKey);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private saveToStorage(): void {
    this.calculateTotal();
    localStorage.setItem(this.storageKey, JSON.stringify(this.order));
  }

  private deduplicate(): void {
      const uniqueItems: Record<string, any> = {};
      const newOrderedItems: any[] = [];
      const orderedItems = SchemaExtractor.getArray(this.order.orderedItem);

      orderedItems.forEach((item: any) => {
          const key = item.itemKey || this.generateItemKey(item.orderedItem, item._selectedVariants);
          if (uniqueItems[key]) {
              uniqueItems[key].orderQuantity += item.orderQuantity;
          } else {
              item.itemKey = key;
              uniqueItems[key] = item;
              newOrderedItems.push(item);
          }
      });

      this.order.orderedItem = newOrderedItems;
      this.calculateTotal();
  }

  private calculateTotal(): void {
    const orderedItems = SchemaExtractor.getArray(this.order.orderedItem);
    this.order.totalPrice = orderedItems.reduce((sum: number, item: any) => {
      if (!this.isItemOrderable(item)) return sum;
      const { price } = SchemaExtractor.extractPrice(item.orderedItem.offers);
      return sum + (parseFloat(price) * (item.orderQuantity || 1));
    }, 0);
  }

  public isItemOrderable(item: any): boolean {
      if (item.isUnavailable) return false;
      const av = SchemaExtractor.extractAvailability(item.orderedItem?.offers);
      if (av === "https://schema.org/OutOfStock" || av === "https://schema.org/SoldOut") return false;
      return true;
  }

  public isItemQuantityValid(item: any): boolean {
      const min = item._constraints?.minValue;
      if (min !== null && min !== undefined && (item.orderQuantity || 1) < min) return false;
      return true;
  }

  public isCartValid(): boolean {
      const items = SchemaExtractor.getArray(this.order.orderedItem);
      if (items.length === 0) return false;
      return items.every(item => this.isItemOrderable(item) && this.isItemQuantityValid(item));
  }

  addItem(item: Product | Service, seller?: Organization, selectedVariants?: Record<string, string>): void {
    const availability = SchemaExtractor.extractAvailability(item.offers);
    if (availability === "https://schema.org/OutOfStock") {
        // Prevent adding if out of stock
        return;
    }

    if (!SchemaExtractor.getFirst(item.url)) {
        item.url = window.location.href.split('?')[0].split('#')[0];
    }

    const itemKey = this.generateItemKey(item, selectedVariants);
    const orderedItems = SchemaExtractor.getArray(this.order.orderedItem);

    const existing = orderedItems.find(
      (oi: any) => oi.itemKey === itemKey
    );

    const { minValue, maxValue } = SchemaExtractor.extractEligibleQuantity(item);

    if (existing) {
      if (maxValue !== null && (existing as any).orderQuantity >= maxValue) {
          const UIManager = (window as any).UIManager;
          if (UIManager) UIManager.showToast(`Maximum limit of ${maxValue} reached for this item`, "error");
          return;
      }
      (existing as any).orderQuantity = ((existing as any).orderQuantity || 0) + 1;
    } else {
      const specs: any = {};
      const fields = [
        'material', 'color', 'size', 'gtin13', 'sku',
        'weight', 'height', 'width', 'depth', 'description'
      ];

      fields.forEach(field => {
        if ((item as any)[field]) specs[field] = (item as any)[field];
      });

      const itemCopy = JSON.parse(JSON.stringify(item));

      orderedItems.push({
        "@type": "OrderItem",
        orderedItem: {
          ...itemCopy,
          url: item.url,
          _selectedVariants: selectedVariants ? { ...selectedVariants } : undefined
        },
        orderQuantity: 1,
        seller: seller ? JSON.parse(JSON.stringify(seller)) : undefined,
        itemKey: itemKey,
        _constraints: { minValue, maxValue }
      } as any);
      this.order.orderedItem = orderedItems;
    }
    this.saveToStorage();
  }

  private generateItemKey(item: Product | Service | any, variants?: Record<string, string>): string {
    let url = SchemaExtractor.getFirst(item.url) || '';
    if (url.includes('?')) url = url.split('?')[0];
    if (url.includes('#')) url = url.split('#')[0];
    url = url.toLowerCase().replace(/\/$/, "");

    const type = SchemaExtractor.getFirst(item["@type"]) || "Product";
    const name = SchemaExtractor.getFirst(item.name) || '';
    const sku = SchemaExtractor.getFirst(item.sku) || '';

    let variantString = '';
    if (variants) {
      const sortedKeys = Object.keys(variants).sort();
      variantString = sortedKeys.map(k => `${k}:${variants[k]}`).join('|');
    }

    return `${url}::${type}::${sku}::${name}::${variantString}`;
  }

  removeItem(index: number): void {
    const orderedItems = SchemaExtractor.getArray(this.order.orderedItem);
    if (index < 0 || index >= orderedItems.length) return;
    orderedItems.splice(index, 1);
    this.order.orderedItem = orderedItems;
    this.saveToStorage();
  }

  updateQty(index: number, delta: number): void {
    const orderedItems = SchemaExtractor.getArray(this.order.orderedItem);
    const item = orderedItems[index] as any;
    if (!item) return;

    const newQty = (item.orderQuantity || 0) + delta;
    const max = item._constraints?.maxValue;

    if (delta > 0 && max !== null && max !== undefined && newQty > max) {
        const UIManager = (window as any).UIManager;
        if (UIManager) UIManager.showToast(`Maximum limit of ${max} reached`, "error");
        return;
    }

    item.orderQuantity = newQty;
    if (item.orderQuantity <= 0) {
      this.removeItem(index);
    } else {
      this.saveToStorage();
    }
  }

  updateItemDetails(index: number, freshBaseData: any | null): void {
    const orderedItems = SchemaExtractor.getArray(this.order.orderedItem);
    const item = orderedItems[index] as any;
    if (!item) return;

    if (!freshBaseData) {
      item.isUnavailable = true;
    } else {
      let freshMatch = null;
      const cartItem = item.orderedItem;
      const dataSources = Array.isArray(freshBaseData) ? freshBaseData : [freshBaseData];

      for (const source of dataSources) {
          const allCatalogs = SchemaExtractor.findAllCatalogs(source);
          for (const catalog of allCatalogs) {
              const matchedPackage = SchemaExtractor.findMatchingServicePackage({ hasOfferCatalog: catalog }, cartItem.name);
              if (matchedPackage) {
                  freshMatch = matchedPackage;
                  break;
              }
          }
          if (freshMatch) break;

          if (cartItem["@type"] === "Product" && source.hasVariant) {
              const variantMatch = SchemaExtractor.findMatchingVariant(source, cartItem._selectedVariants || {});
              if (variantMatch) {
                  freshMatch = variantMatch;
                  break;
              }
          }

          const sourceId = SchemaExtractor.getFirst(source.sku) || SchemaExtractor.getFirst(source.identifier) || SchemaExtractor.getFirst(source.name);
          const cartId = SchemaExtractor.getFirst(cartItem.sku) || SchemaExtractor.getFirst(cartItem.identifier) || SchemaExtractor.getFirst(cartItem.name);
          if (SchemaExtractor.getFirst(source["@type"]) === SchemaExtractor.getFirst(cartItem["@type"]) && sourceId === cartId) {
              freshMatch = source;
              break;
          }
      }

      if (freshMatch) {
          item.isUnavailable = false;
          const { price, currency } = SchemaExtractor.extractPrice(freshMatch);
          const availability = SchemaExtractor.extractAvailability(freshMatch);
          const { minValue, maxValue } = SchemaExtractor.extractEligibleQuantity(freshMatch);

          item._constraints = { minValue, maxValue };
          item.orderedItem.offers = {
              "@type": "Offer",
              price: price,
              priceCurrency: currency,
              availability: availability,
              eligibleQuantity: (minValue !== null || maxValue !== null) ? {
                  "@type": "QuantitativeValue",
                  minValue,
                  maxValue
              } : undefined
          };

          const matchedItem = freshMatch.itemOffered || freshMatch;
          item.orderedItem.image = matchedItem.image || item.orderedItem.image;
          item.orderedItem.name = matchedItem.name || item.orderedItem.name;
          item.orderedItem.description = matchedItem.description || item.orderedItem.description;
      } else {
          item.isUnavailable = true;
      }
    }
    this.saveToStorage();
  }

  getOrder(): Order {
    return this.order;
  }

  getTotalQuantity(): number {
    const orderedItems = SchemaExtractor.getArray(this.order.orderedItem);
    return orderedItems.reduce((sum: number, item: any) => sum + (item.orderQuantity || 0), 0);
  }

  clear(): void {
    this.order.orderedItem = [];
    this.saveToStorage();
  }
}
