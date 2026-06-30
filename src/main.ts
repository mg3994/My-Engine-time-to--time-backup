import { AppState } from './types/app';
import { SchemaExtractor } from './core/SchemaExtractor';
import { CartManager } from './core/CartManager';
import { LocationManager } from './core/LocationManager';
import { BloggerDataService } from './infrastructure/BloggerDataService';
import { GooglePayService } from './infrastructure/GooglePayService';
import { ProductRenderer } from './presentation/ProductRenderer';
import { CartRenderer } from './presentation/CartRenderer';
import { LocationRenderer } from './presentation/LocationRenderer';
import { UIManager } from './presentation/UIManager';
import { GeoVerificationRenderer } from './presentation/GeoVerificationRenderer';
import { OrderSummaryRenderer } from './presentation/OrderSummaryRenderer';
import { PhoneVerificationRenderer } from './presentation/PhoneVerificationRenderer';

export class App {
  private state: AppState = {
    product: null,
    selectedVariants: {},
    currentSlide: 0,
    quantity: 1,
    lastClickedAttribute: null,
    selectedPackage: null,
    verifiedLocation: null,
    orderDelivery: null
  };

  private gridPageSize = 20;
  private gridStartIndex = 1;
  private currentLabels: string[] = [];
  private currentSearchQuery: string = '';
  private displaySearchQuery: string = '';
  private searchKeywordsOnly: string = '';

  public CartManager = new CartManager();
  public LocationManager = new LocationManager();
  public BloggerDataService = new BloggerDataService();
  public GooglePayService = new GooglePayService();

  public ProductRenderer = new ProductRenderer(this.CartManager);
  public CartRenderer = new CartRenderer(this.CartManager);
  public LocationRenderer = new LocationRenderer(this.LocationManager);
  public GeoVerificationRenderer = new GeoVerificationRenderer(this.LocationManager);
  public OrderSummaryRenderer = new OrderSummaryRenderer(this.CartManager);
  public PhoneVerificationRenderer = new PhoneVerificationRenderer();

  constructor() {
    this.detectContext();
    this.exposeGlobals();
    this.init();
  }

  private detectContext(): void {
    const params = new URLSearchParams(window.location.search);
    const labels = params.get('labels');
    if (labels) this.currentLabels = labels.split(',');

    const query = params.get('q');
    if (query) {
        this.displaySearchQuery = query;
        this.searchKeywordsOnly = query.replace(/^search:/, '').trim();
        this.currentSearchQuery = this.searchKeywordsOnly;
    }
  }

  private exposeGlobals(): void {
    (window as any).AntinnaEngine = this;

    // Core Managers
    (window as any).CartManager = this.CartManager;
    (window as any).LocationManager = this.LocationManager;
    (window as any).CartRenderer = this.CartRenderer;
    (window as any).LocationRenderer = this.LocationRenderer;
    (window as any).GooglePayService = this.GooglePayService;
    (window as any).GeoVerificationRenderer = this.GeoVerificationRenderer;
    (window as any).UIManager = UIManager;

    // Legacy/Template compatibility: expose on window directly
    (window as any).nextSlide = () => this.goToSlide(this.state.currentSlide + 1);
    (window as any).prevSlide = () => this.goToSlide(this.state.currentSlide - 1);
    (window as any).goToSlide = (i: number) => this.goToSlide(i);
    (window as any).syncDots = (el: HTMLElement) => this.syncDots(el);
    (window as any).showToast = (m: string, t: any) => UIManager.showToast(m, t);
    (window as any).loadMorePosts = () => this.loadMorePosts();
    (window as any).refreshCartData = () => this.refreshCartData();

    (window as any).addItem = (item: any, seller: any, variants: any, quantity: any, parentKey: any) => {
        this.CartManager.addItem(item, seller, variants, quantity, parentKey);
        this.refreshProductUI();
        this.CartRenderer.updateUI();
    };
    (window as any).removeItem = (idx: number) => {
        this.CartManager.removeItem(idx);
        this.refreshProductUI();
        this.CartRenderer.updateUI();
    };
    (window as any).updateQty = (idx: number, delta: number) => {
        this.CartManager.updateQty(idx, delta);
        this.refreshProductUI();
        this.CartRenderer.updateUI();
    };

    (window as any).startCheckout = () => this.startCheckout();
    (window as any).showOrderSummary = () => this.showOrderSummary();
    (window as any).showGeoVerification = () => this.showGeoVerification();
    (window as any).handleAddToCart = () => this.handleAddToCart();
    (window as any).setQuantity = (q: number) => { this.state.quantity = q; };
    (window as any).loadProductData = () => this.loadProductData();
  }

  private init(): void {
    document.addEventListener("DOMContentLoaded", () => {
      this.LocationRenderer.init();
      this.CartRenderer.renderFab();
      this.setupEventListeners();
      this.loadProductData();
      this.loadGridData();
      this.updateCategoryLinks();
      this.highlightActiveLabels();
      this.initSearchInput();
    });
  }

  private initSearchInput(): void {
      const qInput = UIManager.el<HTMLInputElement>("search-q");
      if (qInput && this.displaySearchQuery) {
          qInput.value = this.displaySearchQuery;
      }
  }

  private setupEventListeners(): void {
    const qtyMinus = UIManager.el("qty-minus");
    const qtyPlus = UIManager.el("qty-plus");
    const addBtn = UIManager.el("add-to-cart-btn");

    if (qtyMinus) qtyMinus.onclick = () => {
        this.state.quantity = Math.max(1, this.state.quantity - 1);
        UIManager.setContent("qty-val", String(this.state.quantity));
        this.ProductRenderer.updateQtyButtons();
    };
    if (qtyPlus) qtyPlus.onclick = () => {
        this.state.quantity++;
        UIManager.setContent("qty-val", String(this.state.quantity));
        this.ProductRenderer.updateQtyButtons();
    };
    if (addBtn) addBtn.onclick = () => this.handleAddToCart();

    const cartFab = UIManager.el("cart-fab");
    if (cartFab) cartFab.onclick = () => this.CartRenderer.showModal();

    const backdrop = UIManager.el("cart-modal-backdrop");
    if (backdrop) backdrop.onclick = () => this.CartRenderer.hideModal();
  }

  public async loadProductData(): Promise<void> {
    const raw = UIManager.el("post-body-raw");
    if (!raw) return;
    const p = SchemaExtractor.extractJsonLd<any>(raw.innerHTML);
    if (p) {
        this.state.product = p;
        this.refreshProductUI();
        UIManager.toggleClass("#initializing-state", "hidden", true);
        UIManager.toggleClass("#carousel-section", "hidden", false);
        UIManager.toggleClass("#details-section", "hidden", false);
    }
  }

  private refreshProductUI(): void {
      if (this.state.product) {
          this.ProductRenderer.render(this.state.product, this.state, (a, v) => {
              this.state.selectedVariants[a] = v;
              this.state.lastClickedAttribute = a;
              this.refreshProductUI();
          });
      }
  }

  public async loadGridData(): Promise<void> {
      const grid = UIManager.el("app-grid");
      if (!grid) return;

      const { entries, totalResults } = await this.BloggerDataService.fetchFeedData(this.gridPageSize, this.gridStartIndex, this.currentLabels, this.currentSearchQuery);
      this.renderEntriesToGrid(entries, grid);

      if (this.gridStartIndex + this.gridPageSize > totalResults) {
          UIManager.el("load-more-btn")?.classList.add("hidden");
      }
  }

  private renderEntriesToGrid(entries: any[], grid: HTMLElement): void {
      entries.forEach(entry => {
          const p = this.BloggerDataService.extractSchemaFromEntry(entry);
          if (p) {
              const link = entry.link.find((l: any) => l.rel === "alternate")?.href || "#";
              const card = document.createElement("a");
              card.className = "card";
              card.href = link;

              const img = SchemaExtractor.getFirst(p.image);
              const imgUrl = img?.url || img || "https://via.placeholder.com/400x300?text=Antinna";

              card.innerHTML = `
                <div class="card-img-container">
                   <div class="card-img-scroll" onscroll="AntinnaEngine.syncDots(this)">
                      <img class="card-img" src="${imgUrl}" loading="lazy"/>
                   </div>
                   <div class="card-dots"></div>
                </div>
                <div class="card-content">
                    <div class="card-brand">${SchemaExtractor.getFirst(p.brand)?.name || SchemaExtractor.getFirst(p.brand) || ""}</div>
                    <div class="card-name">${SchemaExtractor.getFirst(p.name)}</div>
                    <div class="card-price">${SchemaExtractor.extractPrice(SchemaExtractor.getFirst(p.offers)).currency} ${SchemaExtractor.extractPrice(SchemaExtractor.getFirst(p.offers)).price}</div>
                </div>
              `;
              grid.appendChild(card);
              this.initCardCarousel(card, p);
          }
      });
  }

  private initCardCarousel(card: HTMLElement, p: any): void {
    const imgs = SchemaExtractor.getArray(p.image);
    const scroll = card.querySelector('.card-img-scroll');
    const dots = card.querySelector('.card-dots');
    if (imgs[0] && scroll) {
      scroll.innerHTML = imgs.map((img: any) => `<img class="card-img" src="${img.url || img}" loading="lazy"/>`).join('');
      if (dots && imgs.length > 1) {
        dots.innerHTML = imgs.map((_: any, i: number) => `<div class="dot ${i === 0 ? 'active' : ''}"></div>`).join('');
      }
    }
  }

  public syncDots(el: HTMLElement): void {
    const idx = Math.round(el.scrollLeft / el.offsetWidth);
    const dots = el.parentElement?.querySelectorAll('.dot');
    dots?.forEach((d, i) => d.classList.toggle('active', i === idx));
  }

  public startCheckout(): void {
      this.CartRenderer.hideModal();

      if (!(window as any).isLoggedIn) {
          this.showLoginPrompt();
          return;
      }

      if (!(window as any).hasPhoneLinked) {
          this.PhoneVerificationRenderer.render();
          return;
      }

      this.showGeoVerification();
  }

  public showGeoVerification(): void {
      this.GeoVerificationRenderer.renderPopup();
  }

  public setVerifiedLocation(loc: any): void {
      this.state.verifiedLocation = loc;
  }

  public setOrderDelivery(delivery: any): void {
      this.state.orderDelivery = delivery;
  }

  public showOrderSummary(): void {
      if (!(window as any).isLoggedIn) {
          this.showLoginPrompt();
          return;
      }
      UIManager.el('antinna-geo-modal')?.classList.remove('active');
      this.OrderSummaryRenderer.render(this.state.verifiedLocation, this.state.orderDelivery);
  }

  private showLoginPrompt(): void {
      let loginModal = UIManager.el('antinna-login-modal');
      if (!loginModal) {
          loginModal = document.createElement('div');
          loginModal.id = 'antinna-login-modal';
          loginModal.className = 'antinna-geo-backdrop';
          UIManager.injectModalStyles();
          loginModal.innerHTML = `
            <div class="antinna-geo-content" style="text-align:center;">
                <div class="antinna-geo-header">
                    <h3>Sign in Required</h3>
                    <button class="antinna-geo-close" onclick="document.getElementById('antinna-login-modal').classList.remove('active')">&times;</button>
                </div>
                <p style="margin-bottom:30px; opacity:0.8;">Please sign in to your account to finalize your order and proceed to payment.</p>
                <button class="v-btn active btn-google-login" id="google-login-btn-checkout" style="width:100%; display:flex; align-items:center; justify-content:center; gap:10px; padding:15px;">
                    <svg viewBox="0 0 24 24" style="width:20px; height:20px;">
                      <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    Continue with Google
                </button>
            </div>
          `;
          document.body.appendChild(loginModal);

          const loginBtn = UIManager.el('google-login-btn-checkout');
          if (loginBtn) {
              loginBtn.onclick = () => {
                  const sidebarBtn = UIManager.el('google-login-btn-sidebar');
                  if (sidebarBtn) sidebarBtn.click();
                  else if ((window as any).handleLogin) (window as any).handleLogin();
              };
          }
      }
      loginModal.classList.add('active');

      const checkLogin = setInterval(() => {
          if ((window as any).isLoggedIn) {
              clearInterval(checkLogin);
              loginModal?.classList.remove('active');
              this.startCheckout();
          }
      }, 1000);
  }

  public refreshCartData(): void {
      this.CartRenderer.showModal();
  }

  public async loadMorePosts(): Promise<void> {
    const grid = UIManager.el("app-grid");
    if (!grid) return;
    this.gridStartIndex += this.gridPageSize;
    const { entries, totalResults } = await this.BloggerDataService.fetchFeedData(this.gridPageSize, this.gridStartIndex, this.currentLabels, this.currentSearchQuery);
    this.renderEntriesToGrid(entries, grid);
    if (this.gridStartIndex + this.gridPageSize > totalResults) {
        UIManager.el("load-more-btn")?.classList.add("hidden");
    }
  }

  public goToSlide(i: number): void {
    const inner = UIManager.el("carousel-inner");
    const items = document.querySelectorAll(".carousel-item");
    if (!inner || items.length === 0) return;
    if (i < 0) i = items.length - 1;
    if (i >= items.length) i = 0;
    this.state.currentSlide = i;
    inner.style.transform = `translateX(-${i * 100}%)`;
    document.querySelectorAll(".thumb").forEach((t, idx) => t.classList.toggle("active", idx === i));
  }

  public updateCategoryLinks(): void {
      const links = document.querySelectorAll<HTMLAnchorElement>('.category-link');
      links.forEach(l => {
          const label = l.dataset.label;
          if (label) {
              const current = new URLSearchParams(window.location.search);
              current.set('labels', label);
              l.href = '?' + current.toString();
          }
      });
  }

  public highlightActiveLabels(): void {
      const labels = this.currentLabels;
      document.querySelectorAll<HTMLElement>('.category-link').forEach(l => {
          const lab = l.dataset.label;
          if (lab && labels.includes(lab)) l.classList.add('active');
      });
  }

  private handleAddToCart(): void {
    const p = this.state.product as any;
    if (!p) return;

    let variant = SchemaExtractor.findMatchingVariant(p, this.state.selectedVariants, this.state.lastClickedAttribute);

    if (this.state.selectedPackage) {
      variant = {
        ...variant,
        name: this.state.selectedPackage.itemOffered?.name || this.state.selectedPackage.name,
        offers: {
          price: this.state.selectedPackage.price,
          priceCurrency: this.state.selectedPackage.priceCurrency
        }
      };
    }

    const itemToStore = { ...variant, url: window.location.href.split('?')[0].split('#')[0] };
    const seller = SchemaExtractor.getFirst(itemToStore.offers?.seller) || SchemaExtractor.getFirst(p.seller) || p.provider;

    this.CartManager.addItem(itemToStore, seller, this.state.selectedVariants, this.state.quantity);
    this.refreshProductUI();
    this.CartRenderer.updateUI();
    UIManager.showToast("Added to Bag", "success");
  }
}

new App();
