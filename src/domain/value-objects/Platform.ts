/**
 * Supported platform types
 */
export type Platform = 'microsoft' | 'google' | 'apple' | 'unified';

/**
 * Platform configuration and utilities
 */
export class PlatformConfig {
  static readonly SUPPORTED_PLATFORMS: readonly Platform[] = [
    'microsoft',
    'google',
    'apple',
    'unified',
  ] as const;

  static readonly PLATFORM_NAMES: Record<Platform, string> = {
    microsoft: 'Microsoft 365',
    google: 'Google Workspace',
    apple: 'Apple Services',
    unified: 'Unified PIM',
  };

  static readonly PLATFORM_COLORS: Record<Platform, string> = {
    microsoft: '#0078D4',
    google: '#4285F4',
    apple: '#007AFF',
    unified: '#6B46C1',
  };

  /**
   * Validates if a string is a supported platform
   */
  static isSupported(platform: string): platform is Platform {
    return this.SUPPORTED_PLATFORMS.includes(platform as Platform);
  }

  /**
   * Gets the display name for a platform
   */
  static getDisplayName(platform: Platform): string {
    return this.PLATFORM_NAMES[platform];
  }

  /**
   * Gets the brand color for a platform
   */
  static getColor(platform: Platform): string {
    return this.PLATFORM_COLORS[platform];
  }

  /**
   * Gets all supported platforms
   */
  static getAllPlatforms(): Platform[] {
    return [...this.SUPPORTED_PLATFORMS];
  }

  /**
   * Gets external platforms (excludes unified)
   */
  static getExternalPlatforms(): Platform[] {
    return this.SUPPORTED_PLATFORMS.filter(p => p !== 'unified');
  }
}

/**
 * Platform priority for operations
 */
export class PlatformPriority {
  private readonly priorities: Map<Platform, number>;

  constructor(priorities: Record<Platform, number>) {
    this.priorities = new Map(Object.entries(priorities) as [Platform, number][]);
  }

  /**
   * Gets priority for a platform (higher number = higher priority)
   */
  getPriority(platform: Platform): number {
    return this.priorities.get(platform) ?? 0;
  }

  /**
   * Sorts platforms by priority (highest first)
   */
  sortByPriority(platforms: Platform[]): Platform[] {
    return [...platforms].sort((a, b) => this.getPriority(b) - this.getPriority(a));
  }

  /**
   * Gets the highest priority platform from a list
   */
  getHighestPriority(platforms: Platform[]): Platform | undefined {
    const sorted = this.sortByPriority(platforms);
    return sorted[0];
  }

  /**
   * Creates a default priority configuration (Microsoft > Google > Apple > Unified)
   */
  static createDefault(): PlatformPriority {
    return new PlatformPriority({
      microsoft: 100,
      google: 80,
      apple: 60,
      unified: 40,
    });
  }

  /**
   * Creates a priority configuration from user preferences
   */
  static fromPreferences(primaryPlatform: Platform): PlatformPriority {
    const basePriorities = {
      microsoft: 70,
      google: 60,
      apple: 50,
      unified: 40,
    };

    // Boost primary platform
    basePriorities[primaryPlatform] = 100;

    return new PlatformPriority(basePriorities);
  }
}

/**
 * Platform capability matrix
 */
export interface PlatformCapabilities {
  email: {
    read: boolean;
    send: boolean;
    search: boolean;
    attachments: boolean;
    categories: boolean;
  };
  calendar: {
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
    recurrence: boolean;
    reminders: boolean;
    freebusy: boolean;
  };
  contacts: {
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
    search: boolean;
    photos: boolean;
  };
  tasks: {
    read: boolean;
    create: boolean;
    update: boolean;
    delete: boolean;
    subtasks: boolean;
    reminders: boolean;
  };
  files: {
    read: boolean;
    upload: boolean;
    download: boolean;
    delete: boolean;
    share: boolean;
    versions: boolean;
  };
}

export class PlatformCapabilityMatrix {
  private static readonly capabilities: Record<Platform, PlatformCapabilities> = {
    microsoft: {
      email: { read: true, send: true, search: true, attachments: true, categories: true },
      calendar: {
        read: true,
        create: true,
        update: true,
        delete: true,
        recurrence: true,
        reminders: true,
        freebusy: true,
      },
      contacts: {
        read: true,
        create: true,
        update: true,
        delete: true,
        search: true,
        photos: true,
      },
      tasks: {
        read: true,
        create: true,
        update: true,
        delete: true,
        subtasks: false,
        reminders: true,
      },
      files: {
        read: true,
        upload: true,
        download: true,
        delete: true,
        share: true,
        versions: true,
      },
    },
    google: {
      email: { read: true, send: true, search: true, attachments: true, categories: true },
      calendar: {
        read: true,
        create: true,
        update: true,
        delete: true,
        recurrence: true,
        reminders: true,
        freebusy: true,
      },
      contacts: {
        read: true,
        create: true,
        update: true,
        delete: true,
        search: true,
        photos: true,
      },
      tasks: {
        read: true,
        create: true,
        update: true,
        delete: true,
        subtasks: true,
        reminders: true,
      },
      files: {
        read: true,
        upload: true,
        download: true,
        delete: true,
        share: true,
        versions: true,
      },
    },
    apple: {
      email: { read: true, send: true, search: true, attachments: true, categories: false },
      calendar: {
        read: true,
        create: true,
        update: true,
        delete: true,
        recurrence: true,
        reminders: true,
        freebusy: false,
      },
      contacts: {
        read: true,
        create: true,
        update: true,
        delete: true,
        search: true,
        photos: true,
      },
      tasks: {
        read: false,
        create: false,
        update: false,
        delete: false,
        subtasks: false,
        reminders: false,
      },
      files: {
        read: true,
        upload: true,
        download: true,
        delete: true,
        share: true,
        versions: false,
      },
    },
    unified: {
      email: { read: true, send: true, search: true, attachments: true, categories: true },
      calendar: {
        read: true,
        create: true,
        update: true,
        delete: true,
        recurrence: true,
        reminders: true,
        freebusy: true,
      },
      contacts: {
        read: true,
        create: true,
        update: true,
        delete: true,
        search: true,
        photos: true,
      },
      tasks: {
        read: true,
        create: true,
        update: true,
        delete: true,
        subtasks: true,
        reminders: true,
      },
      files: {
        read: true,
        upload: true,
        download: true,
        delete: true,
        share: true,
        versions: true,
      },
    },
  };

  /**
   * Gets capabilities for a platform
   */
  static getCapabilities(platform: Platform): PlatformCapabilities {
    return this.capabilities[platform];
  }

  /**
   * Checks if a platform supports a specific capability
   */
  static hasCapability(
    platform: Platform,
    domain: keyof PlatformCapabilities,
    capability: string
  ): boolean {
    const platformCaps = this.capabilities[platform];
    const domainCaps = platformCaps[domain] as Record<string, boolean>;
    return domainCaps[capability] ?? false;
  }

  /**
   * Gets platforms that support a specific capability
   */
  static getPlatformsWithCapability(
    domain: keyof PlatformCapabilities,
    capability: string
  ): Platform[] {
    return PlatformConfig.SUPPORTED_PLATFORMS.filter(platform =>
      this.hasCapability(platform, domain, capability)
    );
  }

  /**
   * Gets the best platform for a specific operation
   */
  static getBestPlatformFor(
    domain: keyof PlatformCapabilities,
    capability: string,
    availablePlatforms: Platform[],
    priority: PlatformPriority
  ): Platform | undefined {
    const capablePlatforms = this.getPlatformsWithCapability(domain, capability).filter(platform =>
      availablePlatforms.includes(platform)
    );

    return priority.getHighestPriority(capablePlatforms);
  }
}
