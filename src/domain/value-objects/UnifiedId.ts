import { v4 as uuidv4 } from 'uuid';

/**
 * Unified identifier for entities across all platforms
 * Format: platform_type_uuid
 * Example: microsoft_email_12345678-1234-1234-1234-123456789012
 */
export class UnifiedId {
  private readonly value: string;

  constructor(
    private readonly _platform: string,
    private readonly _entityType: string,
    private readonly _uuid?: string
  ) {
    const id = _uuid || uuidv4();
    this.value = `${_platform}_${_entityType}_${id}`;
    
    // Validate format
    if (!this.isValid(this.value)) {
      throw new Error(`Invalid UnifiedId format: ${this.value}`);
    }
  }

  /**
   * Creates a UnifiedId from a string value
   */
  static fromString(value: string): UnifiedId {
    const parts = value.split('_');
    if (parts.length < 3) {
      throw new Error(`Invalid UnifiedId format: ${value}`);
    }
    
    const platform = parts[0];
    const entityType = parts[1];
    const uuid = parts.slice(2).join('_'); // Handle UUIDs with underscores
    
    return new UnifiedId(platform, entityType, uuid);
  }

  /**
   * Creates a new UnifiedId for a platform and entity type
   */
  static create(platform: string, entityType: string): UnifiedId {
    return new UnifiedId(platform, entityType);
  }

  /**
   * Validates UnifiedId format
   */
  private isValid(value: string): boolean {
    const regex = /^[a-z]+_[a-z]+_[a-zA-Z0-9\-_]+$/;
    return regex.test(value);
  }

  /**
   * Gets the platform part
   */
  get platform(): string {
    return this.value.split('_')[0];
  }

  /**
   * Gets the entity type part
   */
  get entityType(): string {
    return this.value.split('_')[1];
  }

  /**
   * Gets the UUID part
   */
  get uuid(): string {
    const parts = this.value.split('_');
    return parts.slice(2).join('_');
  }

  /**
   * Checks if this ID is for a specific platform
   */
  isFromPlatform(platform: string): boolean {
    return this.platform === platform;
  }

  /**
   * Checks if this ID is for a specific entity type
   */
  isForEntityType(entityType: string): boolean {
    return this.entityType === entityType;
  }

  /**
   * Compares with another UnifiedId
   */
  equals(other: UnifiedId): boolean {
    return this.value === other.value;
  }

  /**
   * Returns the string representation
   */
  toString(): string {
    return this.value;
  }

  /**
   * Returns the string representation (for JSON serialization)
   */
  toJSON(): string {
    return this.value;
  }

  /**
   * Returns a shortened version for display
   */
  toShortString(): string {
    return `${this.platform}:${this.entityType}:${this.uuid.substring(0, 8)}...`;
  }

  /**
   * Creates a hash code for this UnifiedId
   */
  hashCode(): number {
    let hash = 0;
    for (let i = 0; i < this.value.length; i++) {
      const char = this.value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash;
  }
}

/**
 * Type guard to check if a value is a UnifiedId
 */
export function isUnifiedId(value: any): value is UnifiedId {
  return value instanceof UnifiedId;
}