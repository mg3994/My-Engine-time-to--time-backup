import { CartManager } from '../core/CartManager';
import { UIManager } from './UIManager';
import { SchemaExtractor } from '../core/SchemaExtractor';

export class CartRenderer {
  constructor(private cartManager: CartManager) {}

  renderFab(): void {
    const container = UIManager.el("cart-fab-container");
    if (!container) return;

    let fab = UIManager.el("cart-fab");
    if (!fab) {
      fab = document.createElement("div");
      fab.id = "cart-fab";
      fab.className = "cart-fab";
      fab.onclick = () => (window as any).AntinnaEngine.refreshCartData();

      const style = document.createElement('style');
      style.textContent = `
        .cart-fab { position: fixed; bottom: 30px; right: 30px; z-index: 1000; transition: transform 0.3s; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .cart-fab.loading { pointer-events: none; opacity: 0.8; }
        .cart-spinner {
            display: none; width: 24px; height: 24px; border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%; border-top-color: #fff; animation: cart-spin 1s ease-in-out infinite;
        }
        .cart-fab.loading .cart-spinner { display: block; }
        .cart-fab.loading .cart-icon { display: none; }
        .cart-fab.loading .cart-count { display: none; }
        @keyframes cart-spin { to { transform: rotate(360deg); } }
      `;
      document.head.appendChild(style);

      fab.innerHTML = `<span class="cart-icon">🛒</span><span class="cart-spinner"></span><span class="cart-count">0</span>`;
      container.appendChild(fab);
    }
    this.updateUI();
  }

  setLoading(loading: boolean): void {
      const fab = UIManager.el("cart-fab");
      if (fab) fab.classList.toggle("loading", loading);
  }

  updateUI(): void {
    const count = this.cartManager.getTotalQuantity();
    const fab = UIManager.el("cart-fab");
    if (fab) {
      const countEl = fab.querySelector(".cart-count");
      if (countEl) countEl.textContent = String(count);
      fab.style.transform = count > 0 ? "scale(1)" : "scale(0)";
    }
    const proceedBtn = UIManager.el<HTMLButtonElement>("cart-proceed-btn");
    if (proceedBtn) {
        const isCartValid = this.cartManager.isCartValid();
        proceedBtn.disabled = count === 0 || !isCartValid;
        proceedBtn.style.opacity = proceedBtn.disabled ? '0.5' : '1';
    }
  }

  showModal(): void {
    const backdrop = UIManager.el("cart-modal-backdrop");
    const drawer = UIManager.el("cart-drawer");
    const list = UIManager.el("cart-items-list");
    if (!list) return;

    // Ensure footer has correct button
    const footer = UIManager.query('.cart-footer');
    if (footer && !UIManager.el('cart-proceed-btn')) {
        footer.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-weight:900; font-size:1.2rem; margin-bottom:20px;"><span>Total</span><span id="cart-total-price">--</span></div>
            <button class="v-btn active" id="cart-proceed-btn" onclick="AntinnaEngine.startCheckout()" style="width:100%; padding:18px; font-size:1.1rem; border-radius:12px;">Proceed</button>
        `;
    }

    const order = this.cartManager.getOrder() as any;
    const orderedItems = SchemaExtractor.getArray(order.orderedItem);
    list.innerHTML = orderedItems.map((item: any, idx: number) => {
      const isUnavailable = item.isUnavailable;
      const availability = SchemaExtractor.extractAvailability(item.orderedItem?.offers);
      const isOutOfStock = availability === "https://schema.org/OutOfStock" || availability === "https://schema.org/SoldOut";

      const isOrderable = !isUnavailable && !isOutOfStock;
      const isQuantityValid = this.cartManager.isItemQuantityValid(item);
      const opacity = (isOrderable && isQuantityValid) ? '1' : '0.5';

      let statusText = '';
      if (isUnavailable) statusText = '<div style="color:red; font-size:0.7rem; font-weight:800;">Currently Unavailable</div>';
      else if (isOutOfStock) statusText = '<div style="color:orange; font-size:0.7rem; font-weight:800;">Out of Stock</div>';
      else if (!isQuantityValid) statusText = `<div style="color:#ef4444; font-size:0.7rem; font-weight:800;">Minimum ${item._constraints?.minValue} required</div>`;

      const { price, currency } = SchemaExtractor.extractPrice(item.orderedItem?.offers);
      const bookingReq = SchemaExtractor.extractAdvanceBookingRequirement(item.orderedItem?.offers);

      return `
        <div style="display:flex; gap:15px; padding:15px; border-bottom:1px solid rgba(0,0,0,0.05); align-items:center; opacity:${opacity};">
           <img src="${this.getItemImage(item.orderedItem)}" style="width:60px; height:60px; border-radius:10px; object-fit:cover;"/>
           <div style="flex:1;">
              <div style="font-weight:700;font-size:0.9rem;">${SchemaExtractor.getFirst(item.orderedItem?.name)}</div>
              ${statusText}
              ${bookingReq ? `<div style="color:var(--accent); font-size:0.7rem; font-weight:700;">Booking: ${bookingReq}</div>` : ''}
              <div style="color:var(--accent); font-weight:800; font-size:0.85rem; margin-top:4px;">${currency} ${price}</div>
              <div style="display:flex; align-items:center; gap:12px; margin-top:10px;">
                 <button class="qty-btn" style="width:24px; height:24px; font-size:0.8rem;" ${!isOrderable ? 'disabled' : ''} onclick="updateQty(${idx},-1); CartRenderer.showModal();">-</button>
                 <span style="font-weight:800;">${item.orderQuantity || 1}</span>
                 <button class="qty-btn" style="width:24px; height:24px; font-size:0.8rem;" ${(!isOrderable || (item._constraints?.maxValue !== null && (item.orderQuantity || 1) >= item._constraints.maxValue)) ? 'disabled' : ''} onclick="updateQty(${idx},1); CartRenderer.showModal();">+</button>
              </div>
           </div>
           <button onclick="removeItem(${idx}); CartRenderer.showModal();" style="background:none;border:none;color:#ff3b30;cursor:pointer;font-size:1.2rem; padding:10px;">×</button>
        </div>
      `;
    }).join("") || '<div style="text-align:center; padding:50px; opacity:0.5; font-weight:700;">Bag is empty</div>';

    const totalEl = UIManager.el("cart-total-price");
    if (totalEl) totalEl.textContent = `${order.priceCurrency || 'INR'} ${order.totalPrice || 0}`;

    backdrop?.classList.add("active");
    drawer?.classList.add("active");
    this.updateUI();
  }

  hideModal(): void {
    UIManager.el("cart-modal-backdrop")?.classList.remove("active");
    UIManager.el("cart-drawer")?.classList.remove("active");
  }

  private getItemImage(item: any): string {
    if (Array.isArray(item.image)) return item.image[0]?.url || item.image[0] || '';
    return item.image?.url || item.image || '';
  }
}
