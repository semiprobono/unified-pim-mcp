/**
 * Person name value object with validation, formatting, and comparison utilities
 */
export class PersonName {
  constructor(
    public readonly givenName?: string,
    public readonly surname?: string,
    public readonly middleName?: string,
    public readonly displayName?: string,
    public readonly nickname?: string,
    public readonly title?: string,
    public readonly suffix?: string
  ) {
    if (!this.hasAnyName()) {
      throw new Error('At least one name component must be provided');
    }
  }

  /**
   * Creates a PersonName from display name only
   */
  static fromDisplayName(displayName: string): PersonName {
    const parsed = PersonName.parseDisplayName(displayName);
    return new PersonName(
      parsed.givenName,
      parsed.surname,
      parsed.middleName,
      displayName,
      undefined,
      parsed.title,
      parsed.suffix
    );
  }

  /**
   * Creates a PersonName from given and surname
   */
  static fromGivenSurname(givenName: string, surname: string): PersonName {
    return new PersonName(givenName, surname);
  }

  /**
   * Creates a PersonName with full components
   */
  static create(params: {
    givenName?: string;
    surname?: string;
    middleName?: string;
    displayName?: string;
    nickname?: string;
    title?: string;
    suffix?: string;
  }): PersonName {
    return new PersonName(
      params.givenName,
      params.surname,
      params.middleName,
      params.displayName,
      params.nickname,
      params.title,
      params.suffix
    );
  }

  /**
   * Parses a display name into components
   */
  private static parseDisplayName(displayName: string): {
    title?: string;
    givenName?: string;
    middleName?: string;
    surname?: string;
    suffix?: string;
  } {
    const trimmed = displayName.trim();
    const parts = trimmed.split(/\s+/);

    if (parts.length === 0) {
      return {};
    }

    const result: any = {};
    let currentIndex = 0;

    // Check for title
    const titles = ['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'professor', 'sir', 'lady', 'lord'];
    const firstPart = parts[0].toLowerCase().replace('.', '');
    if (titles.includes(firstPart)) {
      result.title = parts[0];
      currentIndex++;
    }

    // Check for suffix at the end
    const suffixes = ['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'phd', 'md', 'esq'];
    const lastPart = parts[parts.length - 1].toLowerCase().replace('.', '');
    let hasSuffix = false;
    if (suffixes.includes(lastPart)) {
      result.suffix = parts[parts.length - 1];
      hasSuffix = true;
    }

    // Get the name parts (excluding title and suffix)
    const nameParts = parts.slice(currentIndex, hasSuffix ? -1 : undefined);

    if (nameParts.length === 1) {
      // Single name - could be first or last
      result.givenName = nameParts[0];
    } else if (nameParts.length === 2) {
      // First Last
      result.givenName = nameParts[0];
      result.surname = nameParts[1];
    } else if (nameParts.length === 3) {
      // First Middle Last
      result.givenName = nameParts[0];
      result.middleName = nameParts[1];
      result.surname = nameParts[2];
    } else if (nameParts.length > 3) {
      // First Middle... Last (combine middle names)
      result.givenName = nameParts[0];
      result.middleName = nameParts.slice(1, -1).join(' ');
      result.surname = nameParts[nameParts.length - 1];
    }

    return result;
  }

  /**
   * Checks if any name component is provided
   */
  private hasAnyName(): boolean {
    return !!(
      this.givenName ||
      this.surname ||
      this.middleName ||
      this.displayName ||
      this.nickname
    );
  }

  /**
   * Gets the full name in "First Last" format
   */
  get fullName(): string {
    if (this.displayName) {
      return this.displayName;
    }

    const parts: string[] = [];

    if (this.givenName) parts.push(this.givenName);
    if (this.middleName) parts.push(this.middleName);
    if (this.surname) parts.push(this.surname);

    return parts.join(' ') || this.nickname || '';
  }

  /**
   * Gets the formal name with title and suffix
   */
  get formalName(): string {
    const parts: string[] = [];

    if (this.title) parts.push(this.title);
    parts.push(this.fullName);
    if (this.suffix) parts.push(this.suffix);

    return parts.join(' ');
  }

  /**
   * Gets "Last, First Middle" format
   */
  get lastFirst(): string {
    if (!this.surname) return this.fullName;

    const firstMiddle = [this.givenName, this.middleName].filter(Boolean).join(' ');

    return firstMiddle ? `${this.surname}, ${firstMiddle}` : this.surname;
  }

  /**
   * Gets initials
   */
  get initials(): string {
    const parts = [this.givenName, this.middleName, this.surname]
      .filter((name): name is string => Boolean(name))
      .map(name => name.charAt(0).toUpperCase());

    if (parts.length === 0 && this.displayName) {
      const displayParts = this.displayName.split(/\s+/);
      return displayParts
        .map(part => part.charAt(0).toUpperCase())
        .slice(0, 3) // Limit to 3 initials
        .join('');
    }

    return parts.join('');
  }

  /**
   * Gets the preferred name (nickname if available, otherwise given name)
   */
  get preferredName(): string {
    return this.nickname || this.givenName || this.displayName || '';
  }

  /**
   * Gets the sorting key (surname first, then given name)
   */
  get sortKey(): string {
    if (this.surname && this.givenName) {
      return `${this.surname.toLowerCase()}, ${this.givenName.toLowerCase()}`;
    } else if (this.surname) {
      return this.surname.toLowerCase();
    } else if (this.givenName) {
      return this.givenName.toLowerCase();
    } else if (this.displayName) {
      const parts = this.displayName.split(/\s+/);
      if (parts.length > 1) {
        return `${parts[parts.length - 1].toLowerCase()}, ${parts[0].toLowerCase()}`;
      }
      return this.displayName.toLowerCase();
    }
    return '';
  }

  /**
   * Checks if this name has more complete information than another
   */
  isMoreCompleteThan(other: PersonName): boolean {
    const thisScore = this.getCompletenessScore();
    const otherScore = other.getCompletenessScore();
    return thisScore > otherScore;
  }

  /**
   * Gets a completeness score for comparison
   */
  private getCompletenessScore(): number {
    let score = 0;
    if (this.givenName) score += 3;
    if (this.surname) score += 3;
    if (this.middleName) score += 2;
    if (this.title) score += 1;
    if (this.suffix) score += 1;
    if (this.nickname) score += 1;
    if (this.displayName && !this.givenName && !this.surname) score += 1;
    return score;
  }

  /**
   * Checks for potential matches with another name (fuzzy matching)
   */
  possibleMatch(other: PersonName): boolean {
    // Exact match
    if (this.equals(other)) return true;

    // Check if given names match
    if (this.givenName && other.givenName) {
      const givenMatch = this.givenName.toLowerCase() === other.givenName.toLowerCase();
      const surnameMatch = Boolean(
        this.surname && other.surname && this.surname.toLowerCase() === other.surname.toLowerCase()
      );

      if (givenMatch && surnameMatch) return true;

      // Check nickname vs given name
      if (
        this.nickname?.toLowerCase() === other.givenName.toLowerCase() ||
        other.nickname?.toLowerCase() === this.givenName.toLowerCase()
      ) {
        return surnameMatch;
      }
    }

    // Check display name similarities
    if (this.displayName && other.displayName) {
      const thisNormalized = this.displayName
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .trim();
      const otherNormalized = other.displayName
        .toLowerCase()
        .replace(/[^a-z\s]/g, '')
        .trim();

      if (thisNormalized === otherNormalized) return true;

      // Check if one name is contained in another
      const words1 = thisNormalized.split(/\s+/);
      const words2 = otherNormalized.split(/\s+/);

      const commonWords = words1.filter(word => words2.includes(word));
      return commonWords.length >= 2; // At least 2 words in common
    }

    return false;
  }

  /**
   * Merges with another PersonName, taking the most complete information
   */
  mergeWith(other: PersonName): PersonName {
    return new PersonName(
      this.givenName || other.givenName,
      this.surname || other.surname,
      this.middleName || other.middleName,
      this.displayName || other.displayName,
      this.nickname || other.nickname,
      this.title || other.title,
      this.suffix || other.suffix
    );
  }

  /**
   * Checks equality with another PersonName
   */
  equals(other: PersonName): boolean {
    return (
      this.givenName === other.givenName &&
      this.surname === other.surname &&
      this.middleName === other.middleName &&
      this.displayName === other.displayName &&
      this.nickname === other.nickname &&
      this.title === other.title &&
      this.suffix === other.suffix
    );
  }

  /**
   * Creates a copy with updated components
   */
  update(
    updates: Partial<{
      givenName: string;
      surname: string;
      middleName: string;
      displayName: string;
      nickname: string;
      title: string;
      suffix: string;
    }>
  ): PersonName {
    return new PersonName(
      updates.givenName ?? this.givenName,
      updates.surname ?? this.surname,
      updates.middleName ?? this.middleName,
      updates.displayName ?? this.displayName,
      updates.nickname ?? this.nickname,
      updates.title ?? this.title,
      updates.suffix ?? this.suffix
    );
  }

  /**
   * Validates the name components
   */
  validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.hasAnyName()) {
      errors.push('At least one name component must be provided');
    }

    // Check for reasonable length limits
    const maxLength = 100;
    if (this.givenName && this.givenName.length > maxLength) {
      errors.push('Given name too long (max 100 characters)');
    }
    if (this.surname && this.surname.length > maxLength) {
      errors.push('Surname too long (max 100 characters)');
    }
    if (this.displayName && this.displayName.length > maxLength * 2) {
      errors.push('Display name too long (max 200 characters)');
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
    return this.fullName;
  }

  /**
   * Returns JSON representation
   */
  toJSON(): Record<string, any> {
    return {
      givenName: this.givenName,
      surname: this.surname,
      middleName: this.middleName,
      displayName: this.displayName,
      nickname: this.nickname,
      title: this.title,
      suffix: this.suffix,
      fullName: this.fullName,
      formalName: this.formalName,
      lastFirst: this.lastFirst,
      initials: this.initials,
      preferredName: this.preferredName,
      sortKey: this.sortKey,
    };
  }

  /**
   * Creates PersonName from JSON object
   */
  static fromJSON(json: any): PersonName {
    return new PersonName(
      json.givenName,
      json.surname,
      json.middleName,
      json.displayName,
      json.nickname,
      json.title,
      json.suffix
    );
  }
}
