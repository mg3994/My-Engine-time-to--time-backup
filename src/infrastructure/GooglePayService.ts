import { Order } from '../types/schema';
import { SchemaExtractor } from '../core/SchemaExtractor';

export class GooglePayService {
  private merchantId = "BCR2DN5TVPLKL4KZ";
  private merchantName = "Antinna";

  async initPayment(order: Order, verifiedLocation?: any): Promise<void> {
    if (!(window as any).PaymentRequest) {
      alert("Payment Request API not supported in this browser.");
      return;
    }

    // Call dummy backend to create order record
    try {
        const { AppsScriptService } = await import('./AppsScriptService');
        await AppsScriptService.getInstance().createOrder({
            ...order,
            verifiedLocation
        });
    } catch (e) {
        console.error("Failed to record order in backend", e);
    }

    // Google Pay India (UPI) supported methods
    const googlePayUPI = {
      supportedMethods: 'https://tez.google.com/pay',
      data: {
        pa: 'manishsharma3994@okhdfcbank',
        pn: this.merchantName,
        tr: `TR${Date.now()}`,
        url: window.location.href,
        mc: '5251',
        tn: `Order from ${this.merchantName}`,
      },
    };

    // Standard Google Pay (Card) supported methods for Desktop/Global
    const googlePayGlobal = {
      supportedMethods: 'https://google.com/pay',
      data: {
        environment: 'PRODUCTION',
        apiVersion: 2,
        apiVersionMinor: 0,
        merchantInfo: {
          merchantId: this.merchantId,
          merchantName: this.merchantName,
        },
        allowedPaymentMethods: [
          {
            type: 'CARD',
            parameters: {
              allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
              allowedCardNetworks: ['MASTERCARD', 'VISA'],
            },
            tokenizationSpecification: {
              type: 'PAYMENT_GATEWAY',
              parameters: {
                gateway: 'example', // Replace with your gateway name
                gatewayMerchantId: 'exampleGatewayMerchantId', // Replace with your gateway merchant ID
              },
            },
          },
        ],
      },
    };

    const supportedInstruments = [googlePayUPI, googlePayGlobal];

    const orderTyped = order as any;
    const details = {
      total: {
        label: 'Total Amount',
        amount: {
          currency: orderTyped.priceCurrency || 'INR',
          value: String(orderTyped.totalPrice),
        },
      },
      displayItems: SchemaExtractor.getArray(order.orderedItem).map((item: any) => {
        const { price } = SchemaExtractor.extractPrice(item.orderedItem?.offers);
        return {
          label: SchemaExtractor.getFirst(item.orderedItem?.name) || 'Product',
          amount: {
            currency: orderTyped.priceCurrency || 'INR',
            value: String(parseFloat(price) * (item.orderQuantity || 1)),
          },
        };
      }),
    };

    try {
      const request = new (window as any).PaymentRequest(supportedInstruments, details);

      // Attempt to use UPI if available, else fall back to default behavior
      await request.canMakePayment();

      const response = await request.show();
      // Handle the payment response
      console.log("Payment response:", response);
    } catch (e) {
      console.error("Payment Error:", e);
    }
  }
}
