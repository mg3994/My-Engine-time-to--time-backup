import { UIManager } from './UIManager';
import { CartManager } from '../core/CartManager';
import { SchemaExtractor } from '../core/SchemaExtractor';

export class OrderSummaryRenderer {
  constructor(private cartManager: CartManager) {}

  public render(verifiedLocation: any, orderDelivery?: any): void {
    let modal = UIManager.el('antinna-summary-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'antinna-summary-modal';
      modal.className = 'antinna-geo-backdrop';
      document.body.appendChild(modal);
      UIManager.injectModalStyles();
    }

    const order = this.cartManager.getOrder() as any;

    const itemsHtml = SchemaExtractor.getArray(order.orderedItem).map((item: any) => {
        const itemOffered = item.orderedItem || item.itemOffered || item;
        const { price, currency } = SchemaExtractor.extractPrice(itemOffered.offers || item.offers);
        const name = SchemaExtractor.getFirst(itemOffered.name) || "Unnamed Item";
        const qty = item.orderQuantity || item.amount?.value || 1;
        const bookingReq = SchemaExtractor.extractAdvanceBookingRequirement(itemOffered.offers || item.offers);

        return `
            <div style="padding:10px 0; border-bottom:1px solid #eee; font-size:0.9rem;">
                <div style="display:flex; justify-content:space-between;">
                    <span style="flex:1;">${name} <b>x${qty}</b></span>
                    <span style="font-weight:700;">${currency} ${(parseFloat(price) * Number(qty)).toFixed(2)}</span>
                </div>
                ${bookingReq ? `<div style="font-size:0.75rem; color:var(--accent); margin-top:2px;">Booking: ${bookingReq}</div>` : ''}
            </div>
        `;
    }).join('');

    modal.innerHTML = `
      <div class="antinna-geo-content">
        <div class="antinna-geo-header">
          <h3>Order Summary</h3>
          <button class="antinna-geo-close" onclick="document.getElementById('antinna-summary-modal').classList.remove('active')">&times;</button>
        </div>

        <div style="margin-bottom:20px; padding:15px; background:var(--bg); border-radius:12px;">
            <div style="font-size:0.75rem; text-transform:uppercase; color:#777; margin-bottom:5px; font-weight:800;">Delivery Destination</div>
            <div style="font-weight:700; font-size:0.95rem;">
                ${orderDelivery ?
                  `${orderDelivery.deliveryAddress.extendedAddress}, ${orderDelivery.deliveryAddress.streetAddress}, ${orderDelivery.deliveryAddress.addressLocality}` :
                  (verifiedLocation?.address || 'Verified Location')}
            </div>
            <div style="font-size:0.8rem; color:var(--accent); margin-top:4px;">
                Distance: ${verifiedLocation?.distance || '--'} | Est. Time: ${verifiedLocation?.duration || '--'}
            </div>
        </div>

        <div style="max-height:200px; overflow-y:auto; margin-bottom:20px;">
            ${itemsHtml}
        </div>

        <div style="display:flex; justify-content:space-between; font-weight:900; font-size:1.2rem; margin:20px 0;">
            <span>Grand Total</span>
            <span>${order.priceCurrency || 'INR'} ${order.totalPrice || 0}</span>
        </div>

        <div id="google-pay-button-container" style="display:flex; justify-content:center; margin-top:20px;"></div>

        <p style="font-size:0.7rem; text-align:center; opacity:0.5; margin-top:15px;">
            By clicking Pay, you agree to our terms and conditions.
        </p>
      </div>
    `;

    modal.classList.add('active');
    this.renderGooglePayButton(order, verifiedLocation);
  }

  private renderGooglePayButton(order: any, verifiedLocation: any): void {
      const container = UIManager.el('google-pay-button-container');
      if (!container) return;

      const isDark = document.documentElement.classList.contains('dark');

      // We use the Google Pay API button creation if available, or a styled button as per guidelines
      const btn = document.createElement('button');
      btn.className = `gpay-button ${isDark ? 'white' : 'black'}`;
      btn.style.cssText = `
          background-image: url('https://www.gstatic.com/instantbuy/svg/dark_gpay.svg');
          background-origin: content-box;
          background-position: center;
          background-repeat: no-repeat;
          background-size: contain;
          border: 0;
          border-radius: 4px;
          box-shadow: 0 1px 1px 0 rgba(60, 64, 67, 0.3), 0 1px 3px 1px rgba(60, 64, 67, 0.15);
          cursor: pointer;
          height: 48px;
          min-width: 160px;
          padding: 12px 24px;
          width: 100%;
          background-color: ${isDark ? '#fff' : '#000'};
      `;
      if (isDark) {
          btn.style.backgroundImage = "url('https://www.gstatic.com/instantbuy/svg/light_gpay.svg')";
      }

      btn.onclick = () => {
          (window as any).GooglePayService.initPayment(order, verifiedLocation);
      };

      container.appendChild(btn);
  }
}
