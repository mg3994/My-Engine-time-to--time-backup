import { Product, ProductGroup, Service, Offer, Organization } from '../types/schema';
import { AppState } from '../types/app';
import { UIManager } from './UIManager';
import { SchemaExtractor } from '../core/SchemaExtractor';

export class ProductRenderer {
  render(p: Product | ProductGroup | Service | any, state: AppState, onVariantChange: (attr: string, val: string) => void): void {
    const isBusiness = p["@type"] === "LocalBusiness" || p["@type"] === "Store" || p["@type"] === "Organization";
    const isPrimaryService = p["@type"] === "Service";

    if (isBusiness) {
        this.renderBusinessView(p);
    } else {
        const variant = SchemaExtractor.findMatchingVariant(p, state.selectedVariants, state.lastClickedAttribute);

        if (variant && (p as any).variesBy) {
            SchemaExtractor.getArray((p as any).variesBy).forEach((u: any) => {
              const uStr = typeof u === 'string' ? u : SchemaExtractor.getFirst(u.url) || SchemaExtractor.getFirst(u.name) || '';
              const a = uStr.split(/[\/#]/).pop() || '';
              const variantVal = SchemaExtractor.getFirst(variant[a]);
              if (variantVal) state.selectedVariants[a] = String(variantVal);
            });
        }

        UIManager.setContent("p-name", SchemaExtractor.getFirst(variant.name) || SchemaExtractor.getFirst(p.name));
        UIManager.setContent("p-desc", SchemaExtractor.getFirst(variant.description) || SchemaExtractor.getFirst(p.description));
        UIManager.setContent("p-sku", variant.sku ? "SKU: " + SchemaExtractor.getFirst(variant.sku) : "");

        const variantBrand = SchemaExtractor.getFirst(variant.brand || p.brand);
        const brand = typeof variantBrand === "string"
          ? variantBrand
          : SchemaExtractor.getFirst((variantBrand as Organization)?.name);
        UIManager.setContent("p-brand", brand || "");

        const offer = SchemaExtractor.getFirst(variant.offers || p.offers) as Offer;
        const priceEl = UIManager.el("p-price");
        if (priceEl && offer) {
          const { price, currency } = SchemaExtractor.extractPrice(offer);
          priceEl.textContent = `${currency} ${price}`;
          const availability = SchemaExtractor.extractAvailability(offer);
          priceEl.classList.toggle("blurry", availability === "https://schema.org/OutOfStock");
        }

        this.renderStockBadge(offer);
        this.renderAreaServed(p as Service);

        const imgs = Array.isArray(variant.image || p.image) ? (variant.image || p.image) : [variant.image || p.image];
        this.renderCarousel(imgs.filter(Boolean));

        this.renderQuantityConstraints(offer);
        this.renderVariants(p, state, onVariantChange);
        this.renderSpecs(variant, p);

        // Use class selector since it is a class in XML
        UIManager.toggleClass(".qty-controls", "hidden", isPrimaryService);
        UIManager.toggleClass("#add-to-cart-btn", "hidden", false);

        const seller = SchemaExtractor.getFirst(variant.offers)?.seller ||
                       SchemaExtractor.getFirst(p.offers)?.seller ||
                       SchemaExtractor.getFirst(p.seller) ||
                       (p as Service).provider;

        this.renderOtherServices(seller, variant);
    }
  }

  private renderBusinessView(b: any): void {
      UIManager.setContent("p-name", SchemaExtractor.getFirst(b.name));
      UIManager.setContent("p-desc", SchemaExtractor.getFirst(b.description) || "");
      UIManager.setContent("p-brand", SchemaExtractor.getFirst(b["@type"]));

      const priceEl = UIManager.el("p-price");
      if (priceEl) priceEl.textContent = "Service Provider";

      UIManager.toggleClass("#p-sku", "hidden", true);
      UIManager.toggleClass("#stock-badge-container", "hidden", true);
      UIManager.toggleClass("#p-variants", "hidden", true);
      UIManager.toggleClass(".qty-controls", "hidden", true);
      UIManager.toggleClass("#add-to-cart-btn", "hidden", true);

      this.renderCarousel(Array.isArray(b.image) ? b.image : [b.image]);
      this.renderSeller(b);
      this.renderOtherServices(b, b);
  }

  private renderStockBadge(offer: Offer): void {
    const st = UIManager.el("stock-badge-container");
    if (st && offer) {
      UIManager.toggleClass("#stock-badge-container", "hidden", false);
      const av = SchemaExtractor.extractAvailability(offer);
      let label = 'Out of Stock', css = 'out-stock', available = false;
      if (av === 'https://schema.org/InStock' || av === 'https://schema.org/OnlineOnly') {
        label = 'In Stock'; css = 'in-stock'; available = true;
      } else if (av === 'https://schema.org/InStoreOnly') {
        label = 'In-Store Only'; css = 'instore-only'; available = false;
      } else if (av === 'https://schema.org/PreOrder') {
        label = 'Pre-Order'; css = 'pre-order'; available = true;
      }
      st.innerHTML = `<span class="stock-badge ${css}">${label}</span>`;
      const addBtn = UIManager.el<HTMLButtonElement>("add-to-cart-btn");
      if (addBtn) {
          UIManager.toggleClass("#add-to-cart-btn", "hidden", false);
          addBtn.disabled = !available;
      }
    }
  }

  private renderAreaServed(s: Service): void {
    const pDesc = UIManager.el('p-desc');
    const areaServed = SchemaExtractor.getFirst(s.areaServed);
    if (s && areaServed && pDesc) {
      const area = typeof areaServed === 'string' ? areaServed : (SchemaExtractor.getFirst((areaServed as any).name) || SchemaExtractor.getFirst((areaServed as any)['@type']));
      const existing = UIManager.el('svc-area-badge');
      if (existing) existing.remove();
      const ab = document.createElement('div');
      ab.id = 'svc-area-badge';
      ab.className = 'geo-badge';
      ab.style.background = '#e8f5e9';
      ab.style.color = '#2e7d32';
      ab.style.marginBottom = '15px';
      ab.innerHTML = `&#127760; <b>Area Served:</b> ${area}`;
      pDesc.before(ab);
    }
  }

  private renderQuantityConstraints(offer: Offer): void {
      const { minValue, maxValue } = SchemaExtractor.extractEligibleQuantity(offer);
      const container = UIManager.query('.qty-controls');
      if (!container) return;

      const existingHint = UIManager.el('qty-constraints-hint');
      if (existingHint) existingHint.remove();

      if (minValue !== null || maxValue !== null) {
          const hint = document.createElement('div');
          hint.id = 'qty-constraints-hint';
          hint.style.fontSize = '0.75rem';
          hint.style.color = '#777';
          hint.style.marginTop = '8px';
          hint.style.fontWeight = '600';

          let text = '';
          if (minValue !== null && maxValue !== null) text = `Min: ${minValue}, Max: ${maxValue}`;
          else if (minValue !== null) text = `Minimum order: ${minValue}`;
          else if (maxValue !== null) text = `Maximum order: ${maxValue}`;

          hint.textContent = text;
          container.after(hint);
      }

      // Update actual buttons via App state (handled in main.ts)
      (window as any).currentQuantityLimits = { minValue, maxValue };
      this.updateQtyButtons();
  }

  public updateQtyButtons(): void {
      const limits = (window as any).currentQuantityLimits;
      const qtyPlus = UIManager.el<HTMLButtonElement>("qty-plus");
      const currentQty = parseInt(UIManager.el("qty-val")?.textContent || "1");

      if (qtyPlus && limits?.maxValue !== null) {
          qtyPlus.disabled = currentQty >= limits.maxValue;
          qtyPlus.style.opacity = qtyPlus.disabled ? '0.5' : '1';
      }
  }

  private renderCarousel(imgs: any[]): void {
    const inner = UIManager.el("carousel-inner");
    const thumbRow = UIManager.el("thumbnail-row");
    if (!inner) return;
    inner.innerHTML = "";
    if (thumbRow) thumbRow.innerHTML = "";

    imgs.forEach((s, i) => {
      const url = s.url || s;
      const d = document.createElement("div");
      d.className = "carousel-item";
      d.innerHTML = `<img src="${url}"/>`;
      inner.appendChild(d);
      if (thumbRow && imgs.length > 1) {
        const t = document.createElement("img") as HTMLImageElement;
        t.className = "thumb" + (i === 0 ? " active" : "");
        t.src = url;
        t.onclick = () => (window as any).AntinnaEngine.goToSlide(i);
        thumbRow.appendChild(t);
      }
    });
    inner.style.transform = "translateX(0)";
  }

  private renderVariants(p: any, state: AppState, onVariantChange: (attr: string, val: string) => void): void {
    const vc = UIManager.el("p-variants");
    if (vc && !vc.children.length) {
      if (p.variesBy) {
        UIManager.toggleClass("#p-variants", "hidden", false);
        SchemaExtractor.getArray(p.variesBy).forEach((u: any) => {
          const uStr = typeof u === 'string' ? u : SchemaExtractor.getFirst(u.url) || SchemaExtractor.getFirst(u.name) || '';
          const a = uStr.split(/[\/#]/).pop() || '';
          const variants = SchemaExtractor.getArray(p.hasVariant);
          const vals = [...new Set(variants.map((x: any) => SchemaExtractor.getFirst(x[a])).filter(Boolean))];
          if (vals.length === 0) return;
          const g = document.createElement("div");
          g.className = "v-group";
          g.innerHTML = `<span class="v-label">Select ${a}</span>`;
          const os = document.createElement("div");
          os.className = "v-options";
          vals.forEach((vl: any) => {
            const btn = document.createElement("button");
            btn.className = "v-btn";
            btn.dataset.attr = a;
            btn.dataset.val = String(vl);
            if (a.toLowerCase() === "color") {
              btn.classList.add("v-color");
              const variants = SchemaExtractor.getArray(p.hasVariant);
              const vm = variants.find((x: any) => String(SchemaExtractor.getFirst(x[a])) === String(vl));
              const vi = vm && SchemaExtractor.getFirst(vm.image);
              if (vi) {
                const url = (vi as any).url || vi;
                btn.style.backgroundImage = `url('${url}')`;
              } else {
                btn.style.backgroundColor = String(vl);
              }
              btn.title = String(vl);
            } else {
              btn.textContent = String(vl);
            }
            btn.onclick = () => onVariantChange(a, String(vl));
            os.appendChild(btn);
          });
          g.appendChild(os);
          vc.appendChild(g);
          if (!state.selectedVariants[a]) state.selectedVariants[a] = String(vals[0]);
        });
      } else if (p.hasOfferCatalog) {
        UIManager.toggleClass("#p-variants", "hidden", false);
        const g = document.createElement("div");
        g.className = "v-group";
        g.innerHTML = `<span class="v-label">Available Packages</span>`;
        const os = document.createElement("div");
        os.className = "v-options";
        const catalog = SchemaExtractor.getFirst(p.hasOfferCatalog);
        SchemaExtractor.getArray(catalog?.itemListElement).forEach((off: any) => {
          const btn = document.createElement("button");
          btn.className = "v-btn";
          const itemName = SchemaExtractor.getFirst(off.itemOffered?.name) || SchemaExtractor.getFirst(off.name);
          const itemPrice = SchemaExtractor.getFirst(off.price);
          const itemCurrency = SchemaExtractor.getFirst(off.priceCurrency);
          btn.innerHTML = `${itemName}<br/><small>${itemCurrency || "INR"} ${itemPrice}</small>`;
          btn.onclick = () => {
            state.selectedPackage = off;
            UIManager.setContent('p-price', `${SchemaExtractor.getFirst(off.priceCurrency)} ${SchemaExtractor.getFirst(off.price)}`);
            this.renderQuantityConstraints(off);
            document.querySelectorAll('.v-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
          };
          os.appendChild(btn);
        });
        g.appendChild(os);
        vc.appendChild(g);
      }
    }

    document.querySelectorAll<HTMLButtonElement>(".v-btn[data-attr]").forEach(btn => {
      const a = btn.dataset.attr || '';
      const vL = btn.dataset.val || btn.textContent;
      btn.classList.toggle("active", state.selectedVariants[a] === vL);
    });

    this.checkAvailability(p, state);
  }

  private checkAvailability(p: any, state: AppState): void {
    const variants = SchemaExtractor.getArray(p.hasVariant);
    if (!p || variants.length === 0) return;
    document.querySelectorAll<HTMLButtonElement>('.v-btn[data-attr]').forEach(btn => {
      const a = btn.dataset.attr || '';
      const v = btn.dataset.val || '';
      const test = { ...state.selectedVariants, [a]: v };
      const match = variants.find((x: any) =>
        Object.entries(test).every(([k, val]) => {
            const fieldVal = SchemaExtractor.getFirst(x[k]);
            return !fieldVal || String(fieldVal) === String(val);
        })
      );
      const availability = match ? SchemaExtractor.extractAvailability(match.offers) : null;
      const out = availability === 'https://schema.org/OutOfStock';
      btn.style.opacity = !match ? '0.3' : (out ? '0.6' : '1');
      btn.style.borderStyle = !match ? 'dashed' : 'solid';
    });
  }

  private renderSpecs(variant: any, p: any): void {
    const sp = UIManager.el("p-specs");
    const sl = UIManager.el("specs-list");
    if (sp && sl) {
      const getVal = (v: any) => {
          if (!v) return null;
          if (typeof v === 'string') return v;
          if (typeof v === 'number') return String(v);
          return SchemaExtractor.getFirst(v.name) || SchemaExtractor.getFirst(v.value) || SchemaExtractor.getFirst(v.text) || null;
      };

      const flds: Record<string, any> = {
        'SKU': getVal(variant.sku || p.sku),
        'MPN': getVal(variant.mpn || p.mpn),
        'Model': getVal(variant.model || p.model),
        'Brand': getVal(variant.brand || p.brand),
        'Manufacturer': getVal(variant.manufacturer || p.manufacturer),
        'Material': getVal(variant.material || p.material),
        'GTIN': variant.gtin13 || variant.gtin8 || variant.gtin14 || variant.gtin || '',
        'Weight': (variant.weight || p.weight)?.value || (variant.weight || p.weight)
      };

      let h = '';
      for (let [l, k] of Object.entries(flds)) {
        if (k) h += `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.05);"><span style="opacity:0.6;">${l}</span><span style="font-weight:700;">${k}</span></div>`;
      }

      // Additional Properties
      const addProps = [
          ...SchemaExtractor.getArray(p.additionalProperty),
          ...SchemaExtractor.getArray(variant.additionalProperty)
      ];
      addProps.forEach(prop => {
          const name = SchemaExtractor.getFirst(prop.name);
          const val = SchemaExtractor.getFirst(prop.value);
          if (name && val) {
              h += `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.05);"><span style="opacity:0.6;">${name}</span><span style="font-weight:700;">${val}</span></div>`;
          }
      });

      if (h) {
        sp.style.display = "block";
        sl.innerHTML = h;
      } else {
        sp.style.display = "none";
      }
    }
  }

  renderSeller(s: Organization | any): void {
    const box = UIManager.el("p-seller");
    const inf = UIManager.el("seller-info");
    const maps = UIManager.el<HTMLAnchorElement>("maps-link");
    if (!box || !inf) return;
    if (!s) {
      box.style.display = "none";
      return;
    }
    box.style.display = "block";
    const address = SchemaExtractor.getFirst(s.address);
    inf.innerHTML = `<strong>${SchemaExtractor.getFirst(s.name) || "Antinna"}</strong><br/>${SchemaExtractor.getFirst(s.telephone) ? `&#128222; ${SchemaExtractor.getFirst(s.telephone)}<br/>` : ""}${SchemaExtractor.getFirst(s.email) ? `&#128231; <a href="mailto:${SchemaExtractor.getFirst(s.email)}">${SchemaExtractor.getFirst(s.email)}</a><br/>` : ""}${address ? `📍 ${SchemaExtractor.getFirst(address.streetAddress) || ""}, ${SchemaExtractor.getFirst(address.addressLocality) || ""}` : ""}`;
    if (maps) {
      const geo = SchemaExtractor.getFirst(s.geo);
      if (SchemaExtractor.getFirst(s.hasMap) || geo) {
        maps.style.display = "inline-flex";
        maps.href = SchemaExtractor.getFirst(s.hasMap) || `https://www.google.com/maps/search/?api=1&query=${geo.latitude},${geo.longitude}`;
      } else {
        maps.style.display = "none";
      }
    }
  }

  private renderOtherServices(s: Organization | any, p: any): void {
    const otherSec = UIManager.el("other-services");
    const otherList = UIManager.el("other-services-list");
    const titleEl = otherSec?.querySelector('.section-title');
    if (!otherSec || !otherList) return;

    if (!s) {
        return;
    }

    const svcs = SchemaExtractor.findAllServices(s);

    // Fallback: search in p as well
    if (p !== s) {
        const pSvcs = SchemaExtractor.findAllServices(p);
        pSvcs.forEach(ps => {
            if (!svcs.find(s => (s.itemOffered?.name || s.name) === (ps.itemOffered?.name || ps.name))) {
                svcs.push(ps);
            }
        });
    }

    if (svcs.length > 0) {
      otherSec.style.display = "block";

      if (titleEl) {
          const isBusiness = p["@type"] === "LocalBusiness" || p["@type"] === "Store" || p["@type"] === "Organization";
          titleEl.textContent = isBusiness ? "Deals In / Our Services" : "Optional Product-Related Services";
      }

      otherList.innerHTML = svcs.map((ser: any) => {
        const rawItem = SchemaExtractor.getFirst(ser.itemOffered) || ser;
        const n = SchemaExtractor.getFirst(rawItem.name) || SchemaExtractor.getFirst(ser.name);
        const { price, currency } = SchemaExtractor.extractPrice(ser);
        const url = SchemaExtractor.getFirst(p.url) || window.location.href.split('?')[0].split('#')[0];
        const { minValue, maxValue } = SchemaExtractor.extractEligibleQuantity(ser);
        const bookingReq = SchemaExtractor.extractAdvanceBookingRequirement(ser);

        const itemWithUrl = {
            ...rawItem,
            name: n,
            "@type": rawItem["@type"] || ser["@type"] || "Service",
            url,
            offers: {
                "@type": "Offer",
                price,
                priceCurrency: currency,
                availability: SchemaExtractor.extractAvailability(ser),
                eligibleQuantity: {
                    "@type": "QuantitativeValue",
                    minValue,
                    maxValue
                }
            }
        };

        let constraintText = '';
        if (minValue !== null || maxValue !== null) {
            if (minValue !== null && maxValue !== null) constraintText = `<div style="font-size:0.7rem; color:#777; margin-bottom:4px;">Min: ${minValue}, Max: ${maxValue}</div>`;
            else if (minValue !== null) constraintText = `<div style="font-size:0.7rem; color:#777; margin-bottom:4px;">Min: ${minValue}</div>`;
            else if (maxValue !== null) constraintText = `<div style="font-size:0.7rem; color:#777; margin-bottom:4px;">Max: ${maxValue}</div>`;
        }

        const bookingText = bookingReq ? `<div style="font-size:0.7rem; color:var(--accent); font-weight:700; margin-bottom:8px;">Booking: ${bookingReq}</div>` : '';

        const itemJson = JSON.stringify(itemWithUrl).replace(/"/g, '&quot;');
        const sellerJson = JSON.stringify(s).replace(/"/g, '&quot;');
        let btnH = `<button class="v-btn" style="width:100%;padding:10px;font-size:0.85rem;" onclick="CartManager.addItem(${itemJson}, ${sellerJson}); CartRenderer.updateUI(); showToast('Service Added', 'success');">Add Service</button>`;

        return `<div class="h-card"><div style="font-weight:700;margin-bottom:10px;height:3em;overflow:hidden;">${n}</div><div class="price" style="font-size:1.2rem;margin-bottom:15px;">${price !== "0" ? currency + ' ' + price : 'Free/Included'}</div>${constraintText}${bookingText}${btnH}</div>`;
      }).join('');
    } else {
      otherSec.style.display = "none";
    }
  }
}
