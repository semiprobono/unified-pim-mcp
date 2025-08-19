/**
 * Email address value object with validation and type categorization
 */
export class EmailAddress {
  private readonly emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  constructor(
    public readonly address: string,
    public readonly displayName?: string,
    public readonly type: 'personal' | 'work' | 'other' = 'personal',
    public readonly isPrimary: boolean = false
  ) {
    if (!this.isValid(address)) {
      throw new Error(`Invalid email address: ${address}`);
    }
  }

  /**
   * Creates an EmailAddress from a string (email only)
   */
  static fromString(email: string): EmailAddress {
    return new EmailAddress(email);
  }

  /**
   * Creates an EmailAddress with display name
   */
  static withDisplayName(email: string, displayName: string): EmailAddress {
    return new EmailAddress(email, displayName);
  }

  /**
   * Creates a work email address
   */
  static work(email: string, displayName?: string): EmailAddress {
    return new EmailAddress(email, displayName, 'work');
  }

  /**
   * Creates a personal email address
   */
  static personal(email: string, displayName?: string): EmailAddress {
    return new EmailAddress(email, displayName, 'personal');
  }

  /**
   * Creates a primary email address
   */
  static primary(
    email: string,
    displayName?: string,
    type: 'personal' | 'work' | 'other' = 'personal'
  ): EmailAddress {
    return new EmailAddress(email, displayName, type, true);
  }

  /**
   * Validates email address format
   */
  private isValid(email: string): boolean {
    return this.emailRegex.test(email.trim());
  }

  /**
   * Gets the local part (before @)
   */
  get localPart(): string {
    const parts = this.address.split('@');
    return parts[0] ?? '';
  }

  /**
   * Gets the domain part (after @)
   */
  get domain(): string {
    const parts = this.address.split('@');
    return parts[1] ?? '';
  }

  /**
   * Gets the top-level domain
   */
  get tld(): string {
    const domainParts = this.domain.split('.');
    return domainParts[domainParts.length - 1] ?? '';
  }

  /**
   * Checks if this is likely a work email based on domain patterns
   */
  get isLikelyWork(): boolean {
    const workDomains = [
      'company.com',
      'corp.com',
      'enterprise.com',
      'business.com',
      'office.com',
      'work.com',
      'professional.com',
    ];

    const personalDomains = [
      'gmail.com',
      'yahoo.com',
      'hotmail.com',
      'outlook.com',
      'aol.com',
      'icloud.com',
      'me.com',
      'mac.com',
      'protonmail.com',
      'tutanota.com',
    ];

    if (personalDomains.includes(this.domain.toLowerCase())) {
      return false;
    }

    if (workDomains.some(workDomain => this.domain.toLowerCase().includes(workDomain))) {
      return true;
    }

    // Heuristic: if domain has multiple parts and isn't a known personal provider
    const domainParts = this.domain.split('.');
    return domainParts.length > 2 && !personalDomains.includes(this.domain.toLowerCase());
  }

  /**
   * Gets the email provider/service
   */
  get provider(): string {
    const domain = this.domain.toLowerCase();

    const providers: Record<string, string> = {
      'gmail.com': 'Gmail',
      'googlemail.com': 'Gmail',
      'yahoo.com': 'Yahoo',
      'yahoo.co.uk': 'Yahoo',
      'hotmail.com': 'Hotmail',
      'live.com': 'Outlook',
      'outlook.com': 'Outlook',
      'msn.com': 'MSN',
      'aol.com': 'AOL',
      'icloud.com': 'iCloud',
      'me.com': 'iCloud',
      'mac.com': 'iCloud',
      'protonmail.com': 'ProtonMail',
      'tutanota.com': 'Tutanota',
    };

    return providers[domain] || 'Other';
  }

  /**
   * Checks if this is a Microsoft email service
   */
  get isMicrosoft(): boolean {
    const microsoftDomains = ['hotmail.com', 'live.com', 'outlook.com', 'msn.com'];
    return microsoftDomains.includes(this.domain.toLowerCase());
  }

  /**
   * Checks if this is a Google email service
   */
  get isGoogle(): boolean {
    const googleDomains = ['gmail.com', 'googlemail.com'];
    return googleDomains.includes(this.domain.toLowerCase());
  }

  /**
   * Checks if this is an Apple email service
   */
  get isApple(): boolean {
    const appleDomains = ['icloud.com', 'me.com', 'mac.com'];
    return appleDomains.includes(this.domain.toLowerCase());
  }

  /**
   * Gets a normalized version (lowercase, trimmed)
   */
  get normalized(): string {
    return this.address.toLowerCase().trim();
  }

  /**
   * Gets display string (with name if available)
   */
  get displayString(): string {
    return this.displayName ? `${this.displayName} <${this.address}>` : this.address;
  }

  /**
   * Checks equality with another email address
   */
  equals(other: EmailAddress): boolean {
    return this.normalized === other.normalized;
  }

  /**
   * Checks if addresses match (ignoring display name and metadata)
   */
  addressEquals(address: string): boolean {
    return this.normalized === address.toLowerCase().trim();
  }

  /**
   * Creates a copy with updated display name
   */
  withDisplayName(displayName: string): EmailAddress {
    return new EmailAddress(this.address, displayName, this.type, this.isPrimary);
  }

  /**
   * Creates a copy with updated type
   */
  withType(type: 'personal' | 'work' | 'other'): EmailAddress {
    return new EmailAddress(this.address, this.displayName, type, this.isPrimary);
  }

  /**
   * Creates a copy marked as primary
   */
  asPrimary(): EmailAddress {
    return new EmailAddress(this.address, this.displayName, this.type, true);
  }

  /**
   * Creates a copy marked as not primary
   */
  asSecondary(): EmailAddress {
    return new EmailAddress(this.address, this.displayName, this.type, false);
  }

  /**
   * Suggests the likely type based on domain analysis
   */
  suggestType(): 'personal' | 'work' | 'other' {
    if (this.isLikelyWork) {
      return 'work';
    }
    return 'personal';
  }

  /**
   * Gets initials from display name or email
   */
  get initials(): string {
    if (this.displayName) {
      const names = this.displayName.trim().split(/\s+/);
      if (names.length >= 2) {
        const firstName = names[0];
        const lastName = names[names.length - 1];
        return (
          (firstName?.charAt(0).toUpperCase() ?? '') + (lastName?.charAt(0).toUpperCase() ?? '')
        );
      }
      const firstWord = names[0];
      return firstWord?.charAt(0).toUpperCase() ?? '';
    }

    // Use email local part
    const localPart = this.localPart;
    if (localPart.includes('.')) {
      const parts = localPart.split('.');
      const firstPart = parts[0];
      const lastPart = parts[parts.length - 1];
      return (firstPart?.charAt(0).toUpperCase() ?? '') + (lastPart?.charAt(0).toUpperCase() ?? '');
    }

    return localPart.charAt(0).toUpperCase();
  }

  /**
   * Validates the email address
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.address || this.address.trim().length === 0) {
      errors.push('Email address cannot be empty');
    }

    if (!this.emailRegex.test(this.address)) {
      errors.push('Invalid email address format');
    }

    if (this.address.length > 320) {
      // RFC 5321 limit
      errors.push('Email address too long (max 320 characters)');
    }

    if (this.localPart.length > 64) {
      // RFC 5321 limit
      errors.push('Local part too long (max 64 characters)');
    }

    if (this.domain.length > 253) {
      // RFC 5321 limit
      errors.push('Domain part too long (max 253 characters)');
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
    return this.address;
  }

  /**
   * Returns JSON representation
   */
  toJSON(): Record<string, any> {
    return {
      address: this.address,
      displayName: this.displayName,
      type: this.type,
      isPrimary: this.isPrimary,
      localPart: this.localPart,
      domain: this.domain,
      provider: this.provider,
      isLikelyWork: this.isLikelyWork,
      isMicrosoft: this.isMicrosoft,
      isGoogle: this.isGoogle,
      isApple: this.isApple,
      displayString: this.displayString,
      initials: this.initials,
    };
  }

  /**
   * Creates EmailAddress from JSON object
   */
  static fromJSON(json: any): EmailAddress {
    return new EmailAddress(
      json.address,
      json.displayName,
      json.type || 'personal',
      json.isPrimary || false
    );
  }
}
