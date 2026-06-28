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

          <button id="antinna-geo-finalize-btn" class="v-btn active" style="width:100%; margin-top:20px; display:none;">Finalize Order</button>
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

    document.addEventListener('click', (e) => {
      const dropdown = UIManager.el('antinna-geo-dropdown');
      if (dropdown && e.target !== input) {
        dropdown.style.display = 'none';
      }
    });

    const finalizeBtn = UIManager.el('antinna-geo-finalize-btn');
    if (finalizeBtn) {
      finalizeBtn.onclick = () => {
        (window as any).AntinnaEngine.showOrderSummary();
      };
    }
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
      UIManager.setContent('antinna-geo-status', "Location verified.");
      UIManager.setContent('antinna-geo-clean-address', response.address);
      UIManager.setContent('antinna-geo-dist', response.distance);
      UIManager.setContent('antinna-geo-dur', response.duration);
      UIManager.setContent('antinna-geo-tag-target', `${response.lat.toFixed(4)}, ${response.lng.toFixed(4)}`);
      UIManager.setContent('antinna-geo-tag-current', `${this.currentDeviceLat.toFixed(4)}, ${this.currentDeviceLng.toFixed(4)}`);

      UIManager.toggleClass("#antinna-geo-metrics", "hidden", false);
      UIManager.el("antinna-geo-metrics")!.style.display = "block";
      UIManager.toggleClass("#antinna-geo-finalize-btn", "hidden", false);
      UIManager.el("antinna-geo-finalize-btn")!.style.display = "block";

      // Save verified location to state
      (window as any).AntinnaEngine.setVerifiedLocation(response);
    }
  }
}
