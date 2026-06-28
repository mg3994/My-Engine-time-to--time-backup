import { UIManager } from './UIManager';

export class PhoneVerificationRenderer {
  private confirmationResult: any = null;
  private resendTimer: any = null;
  private countdown: number = 60;
  private selectedCountry = { code: '+91', name: 'India', flag: '🇮🇳' };
  private countries = [
    { code: '+91', name: 'India', flag: '🇮🇳' },
    { code: '+1', name: 'USA', flag: '🇺🇸' },
    { code: '+44', name: 'UK', flag: '🇬🇧' },
    { code: '+971', name: 'UAE', flag: '🇦🇪' },
    { code: '+65', name: 'Singapore', flag: '🇸🇬' }
  ];

  public render(): void {
    let modal = UIManager.el('antinna-phone-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'antinna-phone-modal';
      modal.className = 'antinna-geo-backdrop';
      UIManager.injectModalStyles();
      modal.innerHTML = `
        <div class="antinna-geo-content">
          <div class="antinna-geo-header">
            <h3>Phone Verification</h3>
            <button class="antinna-geo-close" onclick="document.getElementById('antinna-phone-modal').classList.remove('active')">&times;</button>
          </div>
          <p class="antinna-geo-subtitle">
            Please link your phone number to continue with the order.
          </p>

          <div id="phone-input-container">
            <div class="antinna-geo-search-container antinna-input-prefixed">
                <div id="antinna-country-trigger" class="antinna-country-selector">
                    <span id="antinna-selected-flag">${this.selectedCountry.flag}</span>
                    <span id="antinna-selected-code">${this.selectedCountry.code}</span>
                    <span class="antinna-country-chevron"></span>
                    <div id="antinna-country-list" class="antinna-country-list">
                        ${this.countries.map(c => `
                            <div class="antinna-country-item" data-code="${c.code}">
                                <span class="antinna-country-flag">${c.flag}</span>
                                <span class="antinna-country-name">${c.name}</span>
                                <span class="antinna-country-code">${c.code}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <input id="antinna-phone-number" type="tel" placeholder="98765 43210" autocomplete="off">
            </div>
            <div id="recaptcha-container" style="margin-top:15px;"></div>
            <button id="antinna-send-otp-btn" class="v-btn active" style="width:100%; margin-top:20px; display: flex; align-items: center; justify-content: center;">
                <span class="antinna-spinner"></span>
                <span class="btn-text">Send OTP</span>
            </button>
          </div>

          <div id="otp-input-container" style="display:none;">
            <div class="antinna-geo-search-container">
                <input id="antinna-otp-code" type="text" placeholder="Enter 6-digit OTP" maxlength="6" autocomplete="off">
            </div>
            <div id="antinna-resend-container" style="margin-top:15px; font-size:0.85rem; text-align:center; color:#777;">
                Didn't receive code? <button id="antinna-resend-btn" disabled style="background:none; border:none; color:var(--accent); font-weight:700; cursor:pointer; opacity:0.5;">Resend (<span id="antinna-countdown">60</span>s)</button>
            </div>
            <button id="antinna-verify-otp-btn" class="v-btn active" style="width:100%; margin-top:20px; display: flex; align-items: center; justify-content: center;">
                <span class="antinna-spinner"></span>
                <span class="btn-text">Verify & Link</span>
            </button>
            <button class="qty-btn" style="border:none; margin-top:10px; background:none; width:100%;" onclick="document.getElementById('phone-input-container').style.display='block'; document.getElementById('otp-input-container').style.display='none';">Back</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      this.setupListeners();
    }

    modal.classList.add('active');
    this.initRecaptcha();
  }

  private setupListeners(): void {
      const sendBtn = UIManager.el('antinna-send-otp-btn');
      const verifyBtn = UIManager.el('antinna-verify-otp-btn');
      const resendBtn = UIManager.el('antinna-resend-btn');
      const trigger = UIManager.el('antinna-country-trigger');
      const list = UIManager.el('antinna-country-list');

      if (sendBtn) sendBtn.onclick = () => this.handleSendOTP();
      if (verifyBtn) verifyBtn.onclick = () => this.handleVerifyOTP();
      if (resendBtn) resendBtn.onclick = () => this.handleSendOTP();

      if (trigger) {
          trigger.onclick = (e) => {
              e.stopPropagation();
              const isActive = list?.classList.toggle('active');
              trigger.classList.toggle('active', isActive);
          };
      }

      document.querySelectorAll('.antinna-country-item').forEach(item => {
          (item as HTMLElement).onclick = (e) => {
              e.stopPropagation();
              const code = (item as HTMLElement).dataset.code;
              if (code) this.setCountry(code);
          };
      });

      document.addEventListener('click', () => {
          list?.classList.remove('active');
      });
  }

  public setCountry(code: string): void {
      const country = this.countries.find(c => c.code === code);
      if (country) {
          this.selectedCountry = country;
          UIManager.setContent('antinna-selected-flag', country.flag);
          UIManager.setContent('antinna-selected-code', country.code);

          const list = UIManager.el('antinna-country-list');
          const trigger = UIManager.el('antinna-country-trigger');
          list?.classList.remove('active');
          trigger?.classList.remove('active');
      }
  }

  private initRecaptcha(): void {
      const auth = (window as any).firebaseAuth;
      if (!auth) return;

      if (!(window as any).recaptchaVerifier) {
          try {
            // Importing from CDN within the script might be tricky if not pre-loaded.
            // Assuming Firebase Auth JS is already available via the auth-engine script.
            const { RecaptchaVerifier } = (window as any).firebaseAuthInternal || {};
            if (RecaptchaVerifier) console.log("RecaptchaVerifier ready");
            // Fallback: if we can't find RecaptchaVerifier on window, we might need the user to have it.
            // Typically it's available if firebase-auth.js is loaded.

            // For IIFE/CDN usage, it is often under firebase.auth.RecaptchaVerifier or similar.
            // Since we used ESM in auth-engine, we'll try to get it from the global scope if exposed.
          } catch(e) {}
      }
  }

  private setBtnLoading(btnId: string, isLoading: boolean): void {
      const btn = UIManager.el(btnId);
      if (btn) btn.classList.toggle('loading', isLoading);
  }

  private startResendTimer(): void {
      if (this.resendTimer) clearInterval(this.resendTimer);
      this.countdown = 60;

      UIManager.setHtml('antinna-resend-container', `Didn't receive code? <button id="antinna-resend-btn" disabled style="background:none; border:none; color:var(--accent); font-weight:700; cursor:pointer; opacity:0.5;">Resend (<span id="antinna-countdown">60</span>s)</button>`);

      const btn = UIManager.el<HTMLButtonElement>('antinna-resend-btn');
      if (btn) console.log("Resend btn ready");
      const countEl = UIManager.el('antinna-countdown');

      this.resendTimer = setInterval(() => {
          this.countdown--;
          if (countEl) countEl.textContent = String(this.countdown);

          if (this.countdown <= 0) {
              clearInterval(this.resendTimer);
              const container = UIManager.el('antinna-resend-container');
              if (container) {
                  UIManager.setHtml('antinna-resend-container', `Didn't receive code? <button id="antinna-resend-btn" style="background:none; border:none; color:var(--accent); font-weight:700; cursor:pointer;">Resend Now</button>`);
                  const newBtn = UIManager.el('antinna-resend-btn');
                  if (newBtn) newBtn.onclick = () => this.handleSendOTP();
              }
          }
      }, 1000);
  }

  private async handleSendOTP(): Promise<void> {
    const phoneInput = UIManager.el<HTMLInputElement>('antinna-phone-number');
    let phone = phoneInput?.value.trim().replace(/\D/g, '');

    if (!phone || phone.length < 7) {
        UIManager.showToast("Enter a valid phone number", "error");
        return;
    }

    phone = this.selectedCountry.code + phone;

    const auth = (window as any).firebaseAuth;
    const user = auth?.currentUser;
    if (!user) {
        UIManager.showToast("Authentication required", "error");
        return;
    }

    const RecaptchaVerifier = (window as any).RecaptchaVerifier;
    const linkWithPhoneNumber = (window as any).linkWithPhoneNumber;

    if (!RecaptchaVerifier || !linkWithPhoneNumber) {
        UIManager.showToast("Auth engine not fully loaded", "error");
        return;
    }

    const activeBtnId = UIManager.el('phone-input-container')!.style.display !== 'none' ? 'antinna-send-otp-btn' : 'antinna-resend-btn';
    this.setBtnLoading(activeBtnId, true);

    try {
        if (!(window as any).recaptchaVerifier) {
            (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
                'size': 'invisible'
            });
        }

        this.confirmationResult = await linkWithPhoneNumber(user, phone, (window as any).recaptchaVerifier);

        UIManager.el('phone-input-container')!.style.display = 'none';
        UIManager.el('otp-input-container')!.style.display = 'block';
        UIManager.showToast("OTP sent successfully!", "success");
        this.startResendTimer();
    } catch (error: any) {
        console.error("Phone linking failed", error);
        UIManager.showToast(error.message || "Failed to send OTP", "error");
    } finally {
        this.setBtnLoading(activeBtnId, false);
    }
  }

  private async handleVerifyOTP(): Promise<void> {
    const otpInput = UIManager.el<HTMLInputElement>('antinna-otp-code');
    const code = otpInput?.value.trim();
    if (!code || code.length !== 6) {
        UIManager.showToast("Enter a valid 6-digit OTP", "error");
        return;
    }

    if (!this.confirmationResult) return;

    this.setBtnLoading('antinna-verify-otp-btn', true);

    try {
        await this.confirmationResult.confirm(code);
        UIManager.showToast("Phone linked successfully!", "success");
        UIManager.el('antinna-phone-modal')?.classList.remove('active');
        (window as any).hasPhoneLinked = true;

        if (this.resendTimer) clearInterval(this.resendTimer);

        // Proceed to next step
        (window as any).AntinnaEngine.showGeoVerification();
    } catch (error: any) {
        console.error("OTP Verification failed", error);
        const errorMsg = error.message || error.toString();
        UIManager.showToast(`OTP Verification failed: ${errorMsg}`, "error");
    } finally {
        this.setBtnLoading('antinna-verify-otp-btn', false);
    }
  }
}
