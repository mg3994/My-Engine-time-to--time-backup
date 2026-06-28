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
    verifiedLocation: null
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

  public ProductRenderer = new ProductRenderer();
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
      const path = window.location.pathname;
      const searchParams = new URLSearchParams(window.location.search);

      if (path.includes('/search/label/')) {
          const label = path.split('/search/label/')[1].split('?')[0];
          if (label) this.currentLabels.push(decodeURIComponent(label));
      }

      const q = searchParams.get('q');
      if (q) {
          this.currentSearchQuery = q;

          // Patterns for Location cleaning
          const patterns = [
              /"postalCode":\s*"([^"]+)"/,
              /postalCode:\s*([^|\s]+)/,
              /"addressLocality":\s*"([^"]+)"/,
              /addressLocality:\s*([^|\s]+)/
          ];

          let cleanedQ = q;
          patterns.forEach(p => {
              cleanedQ = cleanedQ.replace(p, '').trim();
          });

          this.displaySearchQuery = cleanedQ;
          this.searchKeywordsOnly = cleanedQ.replace(/label:[^|\s]+/g, '').trim();

          const labelRegex = /label:([^|\s]+)/g;
          let match;
          while ((match = labelRegex.exec(q)) !== null) {
              if (match[1]) {
                  const labelName = decodeURIComponent(match[1].replace(/_/g, ' '));
                  if (!this.currentLabels.includes(labelName)) {
                      this.currentLabels.push(labelName);
                  }
              }
          }
      }
  }

  private formatLocationQuery(): string {
      const loc = this.LocationManager.getData();
      if (loc.pin) {
          return `"postalCode": "${loc.pin}"`;
      }
      if (loc.city) {
          return `"addressLocality": "${loc.city}"`;
      }
      return "";
  }

  private exposeGlobals(): void {
    (window as any).AntinnaEngine = this;
    (window as any).CartManager = this.CartManager;
    (window as any).LocationManager = this.LocationManager;
    (window as any).CartRenderer = this.CartRenderer;
    (window as any).LocationRenderer = this.LocationRenderer;
    (window as any).GooglePayService = this.GooglePayService;
    (window as any).UIManager = UIManager;

    (window as any).nextSlide = () => this.goToSlide(this.state.currentSlide + 1);
    (window as any).prevSlide = () => this.goToSlide(this.state.currentSlide - 1);
    (window as any).goToSlide = (i: number) => this.goToSlide(i);
    (window as any).syncDots = (el: HTMLElement) => this.syncDots(el);
    (window as any).showToast = (m: string, t: 'success' | 'error') => UIManager.showToast(m, t);
    (window as any).loadMorePosts = () => this.loadMorePosts();
    (window as any).refreshCartData = () => this.refreshCartData();
    (window as any).startCheckout = () => this.startCheckout();
    (window as any).showOrderSummary = () => this.showOrderSummary();
    (window as any).showGeoVerification = () => this.showGeoVerification();
    (window as any).setVerifiedLocation = (loc: any) => { this.state.verifiedLocation = loc; };
    (window as any).handleAddToCart = () => this.handleAddToCart();
    (window as any).setQuantity = (q: number) => { this.state.quantity = q; };
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

  private updateCategoryLinks(): void {
      const keywords = this.searchKeywordsOnly.trim();
      const locString = this.formatLocationQuery();

      if (!keywords && !locString) return;

      const catLinks = document.querySelectorAll<HTMLAnchorElement>('.cat-link');
      catLinks.forEach(link => {
          const text = link.textContent?.trim() || '';
          let finalQuery = '';

          if (text.toUpperCase() === 'ALL') {
              finalQuery = `${keywords} ${locString}`.trim();
          } else {
              finalQuery = `label:${text} ${keywords} ${locString}`.trim();
          }

          const prettyQuery = encodeURIComponent(finalQuery)
            .replace(/%20/g, ' ')
            .replace(/%3A/g, ':');

          link.href = `/search?q=${prettyQuery}`;
      });
  }

  private highlightActiveLabels(): void {
      const catLinks = document.querySelectorAll('.cat-link');
      if (this.currentLabels.length > 0) {
          catLinks.forEach(link => {
              const text = link.textContent?.trim();
              if (text?.toUpperCase() === 'ALL') {
                  link.classList.remove('active');
                  return;
              }

              const isMatch = this.currentLabels.some(label => {
                  return text === label;
              });
              if (isMatch) link.classList.add('active');
          });
      }
  }

  private setupEventListeners(): void {
    const qtyPlus = UIManager.el("qty-plus");
    const qtyMinus = UIManager.el("qty-minus");
    const addBtn = UIManager.el("add-to-cart-btn");
    const searchForm = UIManager.el<HTMLFormElement>("search-form");

    if (qtyPlus) qtyPlus.onclick = () => {
      const limits = (window as any).currentQuantityLimits;
      if (limits?.maxValue !== null && this.state.quantity >= limits.maxValue) {
          UIManager.showToast(`Maximum limit of ${limits.maxValue} reached`, "error");
          return;
      }
      this.state.quantity++;
      UIManager.setContent("qty-val", String(this.state.quantity));
      this.ProductRenderer.updateQtyButtons();
    };

    if (qtyMinus) qtyMinus.onclick = () => {
      if (this.state.quantity > 1) {
        this.state.quantity--;
        UIManager.setContent("qty-val", String(this.state.quantity));
        this.ProductRenderer.updateQtyButtons();
      }
    };

    if (addBtn) addBtn.onclick = () => this.handleAddToCart();


    if (searchForm) {
      searchForm.onsubmit = (e) => {
        e.preventDefault();
        const qInput = UIManager.el<HTMLInputElement>("search-q");
        if (!qInput) return;

        const baseQuery = qInput.value.trim();
        const locString = this.formatLocationQuery();

        // Validate: At least one must be present
        if (!baseQuery && !locString) {
            UIManager.showToast("Please enter a query or select location", "error");
            return;
        }

        const combinedQuery = (locString && !baseQuery.includes(locString))
            ? `${baseQuery} ${locString}`.trim()
            : baseQuery;

        const searchUrl = searchForm.getAttribute('action') || '/search';

        let finalQuery = encodeURIComponent(combinedQuery)
            .replace(/%3A/g, ':')
            .replace(/%7C/g, '|');

        window.location.href = `${searchUrl}?q=${finalQuery}`;
      };
    }
  }

  private loadProductData(): void {
    setTimeout(() => {
      const rawBody = UIManager.el("post-body-raw");
      if (rawBody) {
        const data = SchemaExtractor.extractJsonLd<any>(rawBody.textContent || "");
        if (data) {
          this.state.product = data;
          this.ProductRenderer.render(data, this.state, (attr, val) => {
            this.state.selectedVariants[attr] = val;
            this.state.lastClickedAttribute = attr;
            this.ProductRenderer.render(this.state.product!, this.state, () => {});
          });
          if (data.offers?.seller || data.seller || data.provider) {
              this.ProductRenderer.renderSeller(data.offers?.seller || data.seller || data.provider);
          }
        }
      }
      UIManager.toggleClass("#initializing-state", "hidden", true);
      UIManager.toggleClass("#carousel-section", "hidden", false);
      UIManager.toggleClass("#details-section", "hidden", false);
    }, 100);
  }

  private async loadGridData(): Promise<void> {
    const grid = UIManager.el("app-grid");
    if (!grid) return;

    const { entries } = await this.BloggerDataService.fetchFeedData(50, 1, this.currentLabels, this.currentSearchQuery);

    if (grid.children.length === 0) {
        this.renderEntriesToGrid(entries, grid);
    } else {
        const cards = grid.querySelectorAll<HTMLAnchorElement>(".card");
        cards.forEach(card => {
          const url = card.href.split("?")[0].split("#")[0];
          const entry = entries.find(e => {
              const alternateLink = e.link.find((l: any) => l.rel === "alternate")?.href || "";
              return alternateLink.toLowerCase().includes(url.toLowerCase());
          });
          const data = entry
            ? this.BloggerDataService.extractSchemaFromEntry(entry)
            : SchemaExtractor.extractJsonLd<any>(card.querySelector(".grid-data")?.textContent || "");

          if (data) {
            this.renderGridCard(card, data);
          }
        });
    }
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

  private renderEntriesToGrid(entries: any[], grid: HTMLElement): void {
      entries.forEach(entry => {
        const data = this.BloggerDataService.extractSchemaFromEntry(entry);
        if (data) {
          const url = entry.link.find((l: any) => l.rel === "alternate")?.href || "#";
          const card = document.createElement("a");
          card.className = "card";
          card.href = url;
          const firstImage = SchemaExtractor.getFirst(data.image);
          const imageUrl = (firstImage as any)?.url || firstImage || 'https://via.placeholder.com/400x300?text=Antinna';
          card.innerHTML = `
            <div class="card-img-wrapper">
               <div class="card-img-scroll" onscroll="AntinnaEngine.syncDots(this)">
                  <img class="card-img" src="${imageUrl}" loading="lazy"/>
               </div>
               <div class="card-dots"></div>
            </div>
            <div class="card-body">
              <div class="card-badge">Loading...</div>
              <h3 class="card-title">${SchemaExtractor.getFirst(data.name) || "Untitled"}</h3>
              <div class="card-price">--</div>
            </div>
          `;
          grid.appendChild(card);
          this.renderGridCard(card, data);
        }
      });
  }

  public async refreshCartData(): Promise<void> {
    this.CartRenderer.setLoading(true);
    try {
        const order = this.CartManager.getOrder();
        const { entries } = await this.BloggerDataService.fetchFeedData(100, 1);

        SchemaExtractor.getArray(order.orderedItem).forEach((item: any, idx) => {
          const url = SchemaExtractor.getFirst(item.orderedItem?.url);
          if (!url) return;

          const entry = entries.find(e => {
              const alternateLink = e.link.find((l: any) => l.rel === "alternate")?.href || "";
              return alternateLink.toLowerCase().includes(url.toLowerCase().split('?')[0].split('#')[0]);
          });

          const data = entry ? this.BloggerDataService.extractSchemaFromEntry(entry) : null;
          this.CartManager.updateItemDetails(idx, data);
        });
    } catch (e) {
        console.error("Refresh failed", e);
    } finally {
        this.CartRenderer.setLoading(false);
        this.CartRenderer.showModal();
    }
  }

  private renderGridCard(card: HTMLElement, data: any): void {
    const badge = card.querySelector(".card-badge");
    const price = card.querySelector(".card-price");
    const scroll = card.querySelector(".card-img-scroll");
    const dots = card.querySelector(".card-dots");

    const types = SchemaExtractor.getArray(data["@type"]);
    const isBusiness = types.some(t => t === "LocalBusiness" || t === "Store" || t === "Organization");

    if (badge) {
        if (isBusiness) badge.textContent = 'Business';
        else if (types.some(t => t === 'ProductGroup' || t === 'Product')) badge.textContent = 'Product';
        else badge.textContent = 'Service';
    }

    if (price) {
        if (isBusiness) {
            price.textContent = SchemaExtractor.getFirst(data.telephone) || "Contact Us";
        } else {
            const variants = SchemaExtractor.getArray(data.hasVariant);
            const variant = variants.length > 0 ? variants[0] : data;
            const { price: p, currency } = SchemaExtractor.extractPrice(variant.offers || variant);
            price.textContent = `${currency} ${p}`;
        }
    }

    const imgs = SchemaExtractor.getArray(data.image);
    if (imgs[0] && scroll) {
      scroll.innerHTML = imgs.map((img: any) => `<img class="card-img" src="${img.url || img}" loading="lazy"/>`).join('');
      if (dots && imgs.length > 1) {
        dots.innerHTML = imgs.map((_: any, i: number) => `<div class="dot ${i === 0 ? 'active' : ''}"></div>`).join('');
      }
    }
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

    for (let i = 0; i < this.state.quantity; i++) {
      this.CartManager.addItem(itemToStore, itemToStore.offers?.seller || p.seller || p.provider, this.state.selectedVariants);
    }
    this.CartRenderer.updateUI();
    UIManager.showToast("Added to Bag", "success");
  }

  public goToSlide(i: number): void {
    const inner = UIManager.el("carousel-inner");
    const items = document.querySelectorAll(".carousel-item");
    if (!inner || items.length === 0) return;

    if (i < 0) i = items.length - 1;
    if (i >= items.length) i = 0;

    this.state.currentSlide = i;
    inner.style.transform = `translateX(-${i * 100}%)`;

    document.querySelectorAll(".thumb").forEach((t, x) => t.classList.toggle("active", x === i));
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

  public showOrderSummary(): void {
      if (!(window as any).isLoggedIn) {
          this.showLoginPrompt();
          return;
      }
      UIManager.el('antinna-geo-modal')?.classList.remove('active');
      this.OrderSummaryRenderer.render(this.state.verifiedLocation);
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
  }
}

new App();
