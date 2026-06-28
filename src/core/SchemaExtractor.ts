export class SchemaExtractor {
  static getFirst<T>(val: T | T[] | undefined): T | undefined {
    if (Array.isArray(val)) return val[0];
    return val;
  }

  static getArray<T>(val: T | T[] | undefined): T[] {
    if (val === undefined || val === null) return [];
    if (Array.isArray(val)) return val;
    return [val];
  }

  static decodeEntities(text: string): string {
    if (!text) return "";
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    let decoded = textarea.value;
    if (decoded.includes("&quot;")) {
        textarea.innerHTML = decoded;
        decoded = textarea.value;
    }
    return decoded;
  }

  static extractJsonLd<T>(input: string): T | null {
    if (!input) return null;

    try {
      const scriptMatch = input.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      let jsonContent = scriptMatch ? scriptMatch[1] : input;

      let decoded = this.decodeEntities(jsonContent);

      const cleaned = decoded
        .replace(/\/\*[\s\S]*?\*\/|([^\\:]|^)\/\/.*$/gm, "$1")
        .trim();

      try {
        return JSON.parse(cleaned) as T;
      } catch (e) {
        const objectMatch = cleaned.match(/\{[\s\S]*\}/);
        if (objectMatch) {
          try { return JSON.parse(objectMatch[0]) as T; } catch(e2) {}
        }
        return null;
      }
    } catch (e) {
      console.error("Failed to extract JSON-LD", e);
      return null;
    }
  }

  static findMatchingVariant(parent: any, selectedAttributes: Record<string, string>, lastClickedAttr: string | null = null): any {
    if (!parent) return null;
    const variants = this.getArray(parent.hasVariant).length > 0 ? this.getArray(parent.hasVariant) : [parent];

    let match = variants.find((v: any) =>
      Object.entries(selectedAttributes).every(([k, val]) => String(this.getFirst(v[k])) === String(val))
    );

    if (!match && lastClickedAttr) {
      match = variants.find((v: any) => String(this.getFirst(v[lastClickedAttr])) === String(selectedAttributes[lastClickedAttr]));
    }

    return match || variants[0];
  }

  static normalizeName(name: string): string {
      return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  static findMatchingServicePackage(parent: any, packageName: string): any {
      const catalogs = this.getArray(parent?.hasOfferCatalog);
      if (catalogs.length === 0) return null;

      const normalizedSearch = this.normalizeName(packageName);

      for (const catalog of catalogs) {
          const elements = this.getArray(catalog.itemListElement);
          const found = elements.find((off: any) => {
              const item = off.itemOffered || off;
              const name = this.getFirst(item.name) || this.getFirst(off.name);
              return this.normalizeName(name as string) === normalizedSearch;
          });
          if (found) return found;
      }
      return null;
  }

  static findAllCatalogs(obj: any, results: any[] = []): any[] {
      if (!obj || typeof obj !== 'object') return results;

      if (obj.hasOfferCatalog) {
          this.getArray(obj.hasOfferCatalog).forEach(cat => results.push(cat));
      }

      // Recursive search
      if (Array.isArray(obj)) {
          obj.forEach(item => this.findAllCatalogs(item, results));
      } else {
          Object.entries(obj).forEach(([key, val]) => {
              if (key === 'hasOfferCatalog') return; // already handled
              if (val && typeof val === 'object') {
                  this.findAllCatalogs(val, results);
              }
          });
      }

      return results;
  }

  static extractPrice(offer: any): { price: string, currency: string } {
      const off = Array.isArray(offer) ? offer[0] : offer;
      if (!off) return { price: "0", currency: "INR" };

      const price = this.getFirst(off.price) ||
                    this.getFirst(this.getArray(off.itemOffered)[0]?.offers?.price) ||
                    this.getFirst(this.getArray(off.offers)[0]?.price) || "0";

      const currency = this.getFirst(off.priceCurrency) ||
                       this.getFirst(this.getArray(off.itemOffered)[0]?.offers?.priceCurrency) ||
                       this.getFirst(this.getArray(off.offers)[0]?.priceCurrency) || "INR";

      return { price: String(price), currency: String(currency) };
  }

  static extractAvailability(offer: any): string {
      const off = Array.isArray(offer) ? offer[0] : offer;
      if (!off) return "https://schema.org/InStock";

      const av = this.getFirst(off.availability) ||
                 this.getFirst(this.getArray(off.itemOffered)[0]?.offers?.availability) ||
                 this.getFirst(this.getArray(off.offers)[0]?.availability) || "https://schema.org/InStock";

      // If availability is an object with @id, use that, otherwise stringify
      return (av as any)?.["@id"] || String(av);
  }

  static extractEligibleQuantity(data: any): { minValue: number | null, maxValue: number | null } {
      const obj = Array.isArray(data) ? data[0] : data;
      if (!obj) return { minValue: null, maxValue: null };

      const eq = this.getFirst(obj.eligibleQuantity) ||
                 this.getFirst(this.getArray(obj.itemOffered)[0]?.offers?.eligibleQuantity) ||
                 this.getFirst(this.getArray(obj.itemOffered)[0]?.eligibleQuantity) ||
                 this.getFirst(this.getArray(obj.offers)[0]?.eligibleQuantity) ||
                 this.getFirst(this.getArray(obj.offers)[0]?.itemOffered?.eligibleQuantity);

      if (!eq) return { minValue: null, maxValue: null };

      const min = this.getFirst(eq.minValue);
      const max = this.getFirst(eq.maxValue);

      return {
          minValue: min !== undefined ? Number(min) : null,
          maxValue: max !== undefined ? Number(max) : null
      };
  }
}
