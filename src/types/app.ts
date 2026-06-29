import { Product, ProductGroup, Service } from './schema';

export interface AppState {
  product: Product | ProductGroup | Service | null;
  selectedVariants: Record<string, string>;
  currentSlide: number;
  quantity: number;
  lastClickedAttribute: string | null;
  selectedPackage: any | null;
  verifiedLocation: any | null;
  orderDelivery: any | null;
}

export interface LocationData {
  lat: number | null;
  lon: number | null;
  pin: string | null;
  city: string | null;
}
