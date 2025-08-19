/**
 * Phone number value object with validation, formatting, and type categorization
 */
export class PhoneNumber {
  // Basic phone number regex (international format)
  private readonly phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;

  // More comprehensive regex for various formats
  private readonly phoneRegexLoose = /^[\+]?[\(\)]?[\d\s\-\(\)\.]{7,20}$/;

  constructor(
    public readonly number: string,
    public readonly type: 'home' | 'work' | 'mobile' | 'fax' | 'other' = 'mobile',
    public readonly isPrimary: boolean = false,
    public readonly countryCode?: string,
    public readonly extension?: string
  ) {
    const normalized = this.normalize(number);
    if (!this.isValid(normalized)) {
      throw new Error(`Invalid phone number: ${number}`);
    }
  }

  /**
   * Creates a PhoneNumber from a string
   */
  static fromString(phone: string): PhoneNumber {
    return new PhoneNumber(phone);
  }

  /**
   * Creates a mobile phone number
   */
  static mobile(phone: string): PhoneNumber {
    return new PhoneNumber(phone, 'mobile');
  }

  /**
   * Creates a work phone number
   */
  static work(phone: string, extension?: string): PhoneNumber {
    return new PhoneNumber(phone, 'work', false, undefined, extension);
  }

  /**
   * Creates a home phone number
   */
  static home(phone: string): PhoneNumber {
    return new PhoneNumber(phone, 'home');
  }

  /**
   * Creates a primary phone number
   */
  static primary(
    phone: string,
    type: 'home' | 'work' | 'mobile' | 'fax' | 'other' = 'mobile'
  ): PhoneNumber {
    return new PhoneNumber(phone, type, true);
  }

  /**
   * Normalizes phone number by removing non-digit characters (except +)
   */
  private normalize(phone: string): string {
    return phone.replace(/[^\d\+]/g, '');
  }

  /**
   * Validates phone number format
   */
  private isValid(phone: string): boolean {
    // Use strict regex for normalized numbers
    const normalized = this.normalize(phone);

    // Must have at least 7 digits (minimum for valid phone numbers)
    if (normalized.replace(/\+/, '').length < 7) {
      return false;
    }

    // Must not exceed 15 digits (international standard)
    if (normalized.replace(/\+/, '').length > 15) {
      return false;
    }

    return this.phoneRegex.test(normalized) || this.phoneRegexLoose.test(phone);
  }

  /**
   * Gets the normalized number (digits and + only)
   */
  get normalized(): string {
    return this.normalize(this.number);
  }

  /**
   * Gets the digits only (no + or country code indicators)
   */
  get digitsOnly(): string {
    return this.normalized.replace(/\+/, '');
  }

  /**
   * Checks if this is an international number (starts with +)
   */
  get isInternational(): boolean {
    return this.number.trim().startsWith('+');
  }

  /**
   * Gets the detected country code (if international)
   */
  get detectedCountryCode(): string | undefined {
    if (!this.isInternational) {
      return undefined;
    }

    const digits = this.digitsOnly;

    // Common country codes
    const countryCodes: Record<string, string> = {
      '1': 'US/CA', // US/Canada
      '44': 'GB', // UK
      '33': 'FR', // France
      '49': 'DE', // Germany
      '39': 'IT', // Italy
      '34': 'ES', // Spain
      '31': 'NL', // Netherlands
      '46': 'SE', // Sweden
      '47': 'NO', // Norway
      '45': 'DK', // Denmark
      '41': 'CH', // Switzerland
      '43': 'AT', // Austria
      '32': 'BE', // Belgium
      '351': 'PT', // Portugal
      '353': 'IE', // Ireland
      '358': 'FI', // Finland
      '81': 'JP', // Japan
      '86': 'CN', // China
      '91': 'IN', // India
      '61': 'AU', // Australia
      '64': 'NZ', // New Zealand
    };

    // Try different length prefixes
    for (const [code, country] of Object.entries(countryCodes)) {
      if (digits.startsWith(code)) {
        return country;
      }
    }

    return this.countryCode;
  }

  /**
   * Formats the phone number for display
   */
  get formatted(): string {
    const digits = this.digitsOnly;

    // US/Canada formatting
    if (digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))) {
      const phoneDigits = digits.length === 11 ? digits.substring(1) : digits;
      const area = phoneDigits.substring(0, 3);
      const exchange = phoneDigits.substring(3, 6);
      const number = phoneDigits.substring(6);
      return `(${area}) ${exchange}-${number}`;
    }

    // International formatting
    if (this.isInternational) {
      const countryCode = this.detectedCountryCode;
      if (countryCode) {
        const withoutCountry = digits.substring(countryCode.length);
        return `+${countryCode} ${this.formatInternationalNumber(withoutCountry)}`;
      }
      return `+${digits}`;
    }

    // Default formatting with spaces every 3-4 digits
    if (digits.length <= 7) {
      return digits;
    } else if (digits.length <= 10) {
      const groups = digits.match(/(\d{1,3})(\d{1,3})(\d{1,4})/);
      return groups ? `${groups[1]} ${groups[2]} ${groups[3]}` : digits;
    } else {
      // Long numbers - group by 3s
      return digits.replace(/(\d{3})(?=\d)/g, '$1 ');
    }
  }

  /**
   * Formats international number (without country code)
   */
  private formatInternationalNumber(digits: string): string {
    if (digits.length <= 4) return digits;
    if (digits.length <= 7) return `${digits.substring(0, 3)} ${digits.substring(3)}`;
    if (digits.length <= 10)
      return `${digits.substring(0, 3)} ${digits.substring(3, 6)} ${digits.substring(6)}`;
    return digits.replace(/(\d{3})(?=\d)/g, '$1 ');
  }

  /**
   * Gets the number with extension formatted
   */
  get displayString(): string {
    const base = this.formatted;
    return this.extension ? `${base} ext. ${this.extension}` : base;
  }

  /**
   * Gets a clickable tel: URL
   */
  get telUrl(): string {
    const base = this.normalized;
    return this.extension ? `tel:${base},${this.extension}` : `tel:${base}`;
  }

  /**
   * Gets SMS URL (if mobile)
   */
  get smsUrl(): string | undefined {
    if (this.type !== 'mobile') return undefined;
    return `sms:${this.normalized}`;
  }

  /**
   * Checks if this is likely a mobile number
   */
  get isLikelyMobile(): boolean {
    if (this.type === 'mobile') return true;

    const digits = this.digitsOnly;

    // US mobile prefixes (rough heuristic)
    if (digits.length === 10 || (digits.length === 11 && digits.startsWith('1'))) {
      const phoneDigits = digits.length === 11 ? digits.substring(1) : digits;
      const areaCode = phoneDigits.substring(0, 3);
      const exchange = phoneDigits.substring(3, 6);

      // Some known mobile area codes and exchanges
      const mobileAreaCodes = [
        '201',
        '202',
        '212',
        '213',
        '214',
        '215',
        '216',
        '217',
        '218',
        '219',
      ];
      const mobileExchanges = [
        '300',
        '301',
        '302',
        '303',
        '304',
        '305',
        '306',
        '307',
        '308',
        '309',
      ];

      return mobileAreaCodes.includes(areaCode) || mobileExchanges.includes(exchange);
    }

    return false;
  }

  /**
   * Checks equality with another phone number
   */
  equals(other: PhoneNumber): boolean {
    return this.normalized === other.normalized;
  }

  /**
   * Checks if numbers match (ignoring formatting and metadata)
   */
  numberEquals(number: string): boolean {
    return this.normalized === this.normalize(number);
  }

  /**
   * Creates a copy with updated type
   */
  withType(type: 'home' | 'work' | 'mobile' | 'fax' | 'other'): PhoneNumber {
    return new PhoneNumber(this.number, type, this.isPrimary, this.countryCode, this.extension);
  }

  /**
   * Creates a copy marked as primary
   */
  asPrimary(): PhoneNumber {
    return new PhoneNumber(this.number, this.type, true, this.countryCode, this.extension);
  }

  /**
   * Creates a copy marked as not primary
   */
  asSecondary(): PhoneNumber {
    return new PhoneNumber(this.number, this.type, false, this.countryCode, this.extension);
  }

  /**
   * Creates a copy with extension
   */
  withExtension(extension: string): PhoneNumber {
    return new PhoneNumber(this.number, this.type, this.isPrimary, this.countryCode, extension);
  }

  /**
   * Suggests the likely type based on number analysis
   */
  suggestType(): 'home' | 'work' | 'mobile' | 'fax' | 'other' {
    if (this.isLikelyMobile) {
      return 'mobile';
    }

    if (this.extension) {
      return 'work';
    }

    // Default based on current conventions
    return 'mobile';
  }

  /**
   * Validates the phone number
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.number || this.number.trim().length === 0) {
      errors.push('Phone number cannot be empty');
    }

    const normalized = this.normalized;
    const digits = this.digitsOnly;

    if (digits.length < 7) {
      errors.push('Phone number too short (minimum 7 digits)');
    }

    if (digits.length > 15) {
      errors.push('Phone number too long (maximum 15 digits)');
    }

    if (!this.phoneRegex.test(normalized) && !this.phoneRegexLoose.test(this.number)) {
      errors.push('Invalid phone number format');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Returns string representation
   */
  toString(): string {
    return this.number;
  }

  /**
   * Returns JSON representation
   */
  toJSON(): Record<string, any> {
    return {
      number: this.number,
      type: this.type,
      isPrimary: this.isPrimary,
      countryCode: this.countryCode,
      extension: this.extension,
      normalized: this.normalized,
      formatted: this.formatted,
      displayString: this.displayString,
      isInternational: this.isInternational,
      detectedCountryCode: this.detectedCountryCode,
      isLikelyMobile: this.isLikelyMobile,
      telUrl: this.telUrl,
      smsUrl: this.smsUrl,
    };
  }

  /**
   * Creates PhoneNumber from JSON object
   */
  static fromJSON(json: any): PhoneNumber {
    return new PhoneNumber(
      json.number,
      json.type || 'mobile',
      json.isPrimary || false,
      json.countryCode,
      json.extension
    );
  }
}
