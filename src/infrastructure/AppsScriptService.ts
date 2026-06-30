export class AppsScriptService {
  private static instance: AppsScriptService;
  private url: string = 'YOUR_APPS_SCRIPT_URL_HERE';

  public static getInstance(): AppsScriptService {
    if (!AppsScriptService.instance) {
      AppsScriptService.instance = new AppsScriptService();
    }
    return AppsScriptService.instance;
  }

  public setUrl(url: string): void {
    this.url = url;
  }

  private async callAction<T>(action: string, params: any = {}, extra: any = {}): Promise<T> {
    if (this.url === 'YOUR_APPS_SCRIPT_URL_HERE') {
      console.warn("Apps Script URL not set. Using dummy response.");
      return this.getDummyResponse(action, params) as T;
    }

    const payload = {
      action,
      params,
      authToken: (window as any).firebaseAuthToken,
      ...extra
    };

    try {
      await fetch(this.url, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      // Note: with 'no-cors', we can't actually read the response body in the browser.
      // This is a known limitation of Apps Script Web Apps when called from different origins.
      // Usually, a JSONP approach or a proxy is needed if CORS is required.
      // For this engine, we'll assume the user might use a CORS-friendly proxy or
      // we'll handle the 'no-cors' behavior if appropriate.

      // If we need the data, we actually need to allow CORS on the server or use a redirect trick.
      // Assuming for now the user will provide a URL that handles CORS or we use a different approach.

      // Re-trying with standard fetch if no-cors isn't strictly necessary or if the user handles it.
      const corsResponse = await fetch(this.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
      });
      return await corsResponse.json();

    } catch (e) {
      console.error(`AppsScriptService error [${action}]:`, e);
      throw e;
    }
  }

  public async getPlaceSuggestions(inputToken: string): Promise<string[]> {
    return this.callAction<string[]>('getPlaceSuggestions', { inputToken });
  }

  public async processLocationAndMetrics(originLat: number, originLng: number, destinationQuery: string): Promise<any> {
    return this.callAction<any>('processLocationAndMetrics', { originLat, originLng, destinationQuery });
  }

  public async processPinDropMetrics(originLat: number, originLng: number, pinLat: number, pinLng: number): Promise<any> {
    return this.callAction<any>('processPinDropMetrics', { originLat, originLng, pinLat, pinLng });
  }

  public async createOrder(order: any): Promise<any> {
    return this.callAction<any>('createOrder', {}, { order });
  }

  private getDummyResponse(action: string, params: any): any {
      switch(action) {
          case 'getPlaceSuggestions': return ["123 Main St, New York, NY", "456 Park Ave, New York, NY", "789 Broadway, New York, NY"];
          case 'processLocationAndMetrics':
          case 'processPinDropMetrics':
              return {
                  status: "success",
                  address: params.destinationQuery || "Mock Address, India",
                  lat: params.pinLat || 28.6139,
                  lng: params.pinLng || 77.2090,
                  distance: "15.5 km",
                  duration: "35 mins",
                  addressDetails: {
                      extendedAddress: "3rd Floor, Plot No. 42, ABC Towers",
                      streetAddress: "Sector 14",
                      addressLocality: "Rohtak",
                      addressRegion: "HR",
                      postalCode: "124001",
                      addressCountry: "IN"
                  }
              };
          case 'createOrder': return { status: "success", orderId: "ANT-MOCK-123", message: "Mock order created" };
          default: return { status: "error", message: "Unknown action" };
      }
  }
}
