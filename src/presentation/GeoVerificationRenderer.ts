import { UIManager } from './UIManager';
import { AppsScriptService } from '../infrastructure/AppsScriptService';
import { LocationManager } from '../core/LocationManager';

export class GeoVerificationRenderer {
  private map: any;
  private targetMarker: any;
  private debounceTimer: any;
  private appsScriptService = AppsScriptService.getInstance();
  private currentDeviceLat: number = 28.6139; // Default (Delhi)
  private currentDeviceLng: number = 77.2090;

  constructor(locationManager: LocationManager) {
    const loc = locationManager.getData();
    if (loc.lat) this.currentDeviceLat = loc.lat;
    if (loc.lon) this.currentDeviceLng = loc.lon;
  }

  public renderPopup(): void {
    let modal = UIManager.el('antinna-geo-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'antinna-geo-modal';
      modal.className = 'antinna-geo-backdrop';
      modal.innerHTML = `
        <div class="antinna-geo-content">
          <div class="antinna-geo-header">
            <h3>Destination Verification</h3>
            <button class="antinna-geo-close" onclick="document.getElementById('antinna-geo-modal').classList.remove('active')">&times;</button>
          </div>
          <p class="antinna-geo-subtitle">
            Type to search, choose from suggestions, <b>OR click directly on the map</b> to drop a custom pinpoint marker.
          </p>

          <div class="antinna-geo-search-container">
            <input id="antinna-geo-search" type="text" placeholder="Start typing address..." autocomplete="off">
            <div id="antinna-geo-dropdown" class="antinna-geo-dropdown"></div>
          </div>

          <div id="antinna-geo-status" class="antinna-geo-status">Detecting position...</div>

          <div id="antinna-geo-map-canvas"></div>

          <div id="antinna-geo-metrics" class="antinna-geo-metrics" style="display: none;">
            <strong>Target Location Context:</strong><br>
            <span id="antinna-geo-clean-address" style="color: #202124; font-weight: 600;"></span><br>

            <div style="margin-top:10px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div>📍 Target: <span class="antinna-geo-tag" id="antinna-geo-tag-target">0.0, 0.0</span></div>
                <div>📱 Current: <span class="antinna-geo-tag" id="antinna-geo-tag-current">0.0, 0.0</span></div>
            </div>
            <div style="margin-top:8px; font-weight:700; color:var(--accent);">
                Distance: <span id="antinna-geo-dist">--</span> | Duration: <span id="antinna-geo-dur">--</span>
            </div>
          </div>

          <div id="antinna-geo-address-form" style="display:none; margin-top:15px; border-top: 1px solid #eee; padding-top:15px;">
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                  <div class="v-group">
                      <span class="v-label">Flat/Plot/Building</span>
                      <input id="geo-extendedAddress" class="antinna-geo-input" placeholder="e.g. 3rd Floor, Plot 42"/>
                  </div>
                  <div class="v-group">
                      <span class="v-label">Street/Sector</span>
                      <input id="geo-streetAddress" class="antinna-geo-input" placeholder="e.g. Sector 14"/>
                  </div>
              </div>
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px;">
                  <div class="v-group">
                      <span class="v-label">City</span>
                      <input id="geo-locality" class="antinna-geo-input" readonly style="background:#f8f9fa;"/>
                  </div>
                  <div class="v-group">
                      <span class="v-label">Postal Code</span>
                      <input id="geo-postalCode" class="antinna-geo-input" placeholder="6-digit PIN"/>
                  </div>
              </div>
          </div>

          <button id="antinna-geo-finalize-btn" class="v-btn active" style="width:100%; margin-top:20px; display:none; align-items:center; justify-content:center; gap:10px;">
            <span class="antinna-spinner"></span>
            <span class="btn-text">Finalize Order</span>
          </button>
        </div>
      `;
      document.body.appendChild(modal);
      UIManager.injectModalStyles();
      this.setupListeners();
    }

    modal.classList.add('active');
    this.initMap();
  }

  private setupListeners(): void {
    const input = UIManager.el<HTMLInputElement>('antinna-geo-search');
    if (input) {
      input.oninput = (e) => this.handleTypeAhead((e.target as HTMLInputElement).value);
    }

    const formInputs = ['geo-extendedAddress', 'geo-streetAddress', 'geo-postalCode'];
    formInputs.forEach(id => {
        const el = UIManager.el(id);
        if (el) el.oninput = () => this.validateAddressForm();
    });

    document.addEventListener('click', (e) => {
      const dropdown = UIManager.el('antinna-geo-dropdown');
      if (dropdown && e.target !== input) {
        dropdown.style.display = 'none';
      }
    });

    const finalizeBtn = UIManager.el('antinna-geo-finalize-btn');
    if (finalizeBtn) {
      finalizeBtn.onclick = async () => {
        try {
            this.setFinalizeLoading(true);
            // Simulate a small delay for API feel
            await new Promise(r => setTimeout(r, 800));

            const deliveryData = this.collectDeliveryData();

            (window as any).AntinnaEngine.setOrderDelivery(deliveryData);

            this.setFinalizeLoading(false);
            (window as any).AntinnaEngine.showOrderSummary();
        } catch (e) {
            console.error("Error in finalizeBtn.onclick:", e);
        }
      };
    }
  }

  private setFinalizeLoading(loading: boolean): void {
      const btn = UIManager.el('antinna-geo-finalize-btn');
      if (btn) btn.classList.toggle('loading', loading);
  }

  private validateAddressForm(): void {
      const extended = UIManager.el<HTMLInputElement>('geo-extendedAddress')?.value.trim();
      const street = UIManager.el<HTMLInputElement>('geo-streetAddress')?.value.trim();
      const pin = UIManager.el<HTMLInputElement>('geo-postalCode')?.value.trim();

      const finalizeBtn = UIManager.el('antinna-geo-finalize-btn');
      if (finalizeBtn) {
          const isValid = !!(extended && street && pin && pin.length >= 6);
          finalizeBtn.style.display = isValid ? 'flex' : 'none';
      }
  }

  private collectDeliveryData(): any {
      const pos = this.targetMarker?.getPosition();
      const lat = pos ? pos.lat() : ((window as any).lastGeoResponse?.lat || 0);
      const lng = pos ? pos.lng() : ((window as any).lastGeoResponse?.lng || 0);

      return {
          "@type": "ParcelDelivery",
          "deliveryName": "Standard Handheld Delivery",
          "deliveryAddress": {
              "@type": "PostalAddress",
              "extendedAddress": UIManager.el<HTMLInputElement>('geo-extendedAddress')?.value,
              "streetAddress": UIManager.el<HTMLInputElement>('geo-streetAddress')?.value,
              "addressLocality": UIManager.el<HTMLInputElement>('geo-locality')?.value,
              "addressRegion": (window as any).lastGeoResponse?.addressDetails?.addressRegion || "HR",
              "postalCode": UIManager.el<HTMLInputElement>('geo-postalCode')?.value,
              "addressCountry": "IN"
          },
          "deliveryStatus": {
              "@type": "DeliveryEvent",
              "name": "Final Destination Drop-off",
              "location": {
                  "@type": "Place",
                  "name": "Exact Delivery Coordinates",
                  "geo": {
                      "@type": "GeoCoordinates",
                      "latitude": String(lat),
                      "longitude": String(lng)
                  }
              }
          }
      };
  }

  private initMap(): void {
    if (!(window as any).google || !(window as any).google.maps) {
        console.warn("Google Maps not loaded yet.");
        return;
    }

    const google = (window as any).google;
    const center = new google.maps.LatLng(this.currentDeviceLat, this.currentDeviceLng);

    if (!this.map) {
      const options = {
        zoom: 13,
        center: center,
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        disableDefaultUI: true,
        zoomControl: true
      };
      this.map = new google.maps.Map(UIManager.el("antinna-geo-map-canvas"), options);

      this.targetMarker = new google.maps.Marker({
        position: center,
        map: this.map,
        draggable: true,
        animation: google.maps.Animation.DROP,
        title: "Delivery Location"
      });

      google.maps.event.addListener(this.map, 'click', (event: any) => {
        this.handleManualPinPosition(event.latLng.lat(), event.latLng.lng());
      });

      google.maps.event.addListener(this.targetMarker, 'dragend', (event: any) => {
        this.handleManualPinPosition(event.latLng.lat(), event.latLng.lng());
      });
    } else {
        this.map.setCenter(center);
        this.targetMarker.setPosition(center);
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        this.currentDeviceLat = pos.coords.latitude;
        this.currentDeviceLng = pos.coords.longitude;
        const loc = new google.maps.LatLng(this.currentDeviceLat, this.currentDeviceLng);
        this.map.setCenter(loc);
        this.targetMarker.setPosition(loc);
        UIManager.setContent('antinna-geo-status', "Position synchronized.");
      });
    }
  }

  private async handleManualPinPosition(lat: number, lng: number): Promise<void> {
    const google = (window as any).google;
    this.targetMarker.setPosition(new google.maps.LatLng(lat, lng));
    UIManager.setContent('antinna-geo-status', "Pin dropped. Computing metrics...");

    try {
      const response = await this.appsScriptService.processPinDropMetrics(this.currentDeviceLat, this.currentDeviceLng, lat, lng);
      this.updateTelemetryUI(response);
    } catch (e) {
      UIManager.setContent('antinna-geo-status', "Error computing metrics.");
    }
  }

  private handleTypeAhead(value: string): void {
    clearTimeout(this.debounceTimer);
    const dropdown = UIManager.el('antinna-geo-dropdown');
    if (!dropdown) return;

    if (value.length < 3) {
      dropdown.innerHTML = "";
      dropdown.style.display = 'none';
      return;
    }

    this.debounceTimer = setTimeout(async () => {
      try {
        const suggestions = await this.appsScriptService.getPlaceSuggestions(value);
        this.populateDropdown(suggestions);
      } catch (e) {}
    }, 400);
  }

  private populateDropdown(suggestions: string[]): void {
    const dropdown = UIManager.el('antinna-geo-dropdown');
    if (!dropdown) return;
    dropdown.innerHTML = "";

    if (suggestions.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    suggestions.forEach(text => {
      const item = document.createElement('div');
      item.className = "antinna-geo-dropdown-item";
      item.innerText = text;
      item.onclick = async () => {
        const input = UIManager.el<HTMLInputElement>('antinna-geo-search');
        if (input) input.value = text;
        dropdown.style.display = 'none';
        UIManager.setContent('antinna-geo-status', "Resolving coordinates...");

        try {
          const response = await this.appsScriptService.processLocationAndMetrics(this.currentDeviceLat, this.currentDeviceLng, text);
          if (response.status === "success") {
            const google = (window as any).google;
            const newPos = new google.maps.LatLng(response.lat, response.lng);
            this.map.setCenter(newPos);
            this.map.setZoom(15);
            this.targetMarker.setPosition(newPos);
            this.updateTelemetryUI(response);
          }
        } catch (e) {}
      };
      dropdown.appendChild(item);
    });
    dropdown.style.display = 'block';
  }

  private updateTelemetryUI(response: any): void {
    if (response.status === "success") {
      (window as any).lastGeoResponse = response;
      UIManager.setContent('antinna-geo-status', "Location verified.");
      UIManager.setContent('antinna-geo-clean-address', response.address);
      UIManager.setContent('antinna-geo-dist', response.distance);
      UIManager.setContent('antinna-geo-dur', response.duration);
      UIManager.setContent('antinna-geo-tag-target', `${response.lat.toFixed(4)}, ${response.lng.toFixed(4)}`);
      UIManager.setContent('antinna-geo-tag-current', `${this.currentDeviceLat.toFixed(4)}, ${this.currentDeviceLng.toFixed(4)}`);

      UIManager.toggleClass("#antinna-geo-metrics", "hidden", false);
      UIManager.el("antinna-geo-metrics")!.style.display = "block";

      const form = UIManager.el("antinna-geo-address-form");
      if (form) {
          form.style.display = "block";
          if (response.addressDetails) {
              const d = response.addressDetails;
              UIManager.el<HTMLInputElement>('geo-extendedAddress')!.value = d.extendedAddress || "";
              UIManager.el<HTMLInputElement>('geo-streetAddress')!.value = d.streetAddress || "";
              UIManager.el<HTMLInputElement>('geo-locality')!.value = d.addressLocality || "";
              UIManager.el<HTMLInputElement>('geo-postalCode')!.value = d.postalCode || "";
          }
          this.validateAddressForm();
      }

      // Save verified location to state
      (window as any).AntinnaEngine.setVerifiedLocation(response);
    }
  }
}
