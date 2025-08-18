# Unified PIM MCP - Architecture Documentation

## Executive Summary

The Unified Personal Information Management (PIM) MCP is a Model Context Protocol server that provides comprehensive CRUD operations for email, calendar, contacts, tasks, and files across Microsoft (Graph API), Google, and Apple platforms. This document outlines the final architecture based on expert review and architectural analysis.

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Principles](#architecture-principles)
3. [Core Architecture](#core-architecture)
4. [Platform Integration](#platform-integration)
5. [Security Architecture](#security-architecture)
6. [Performance & Scalability](#performance--scalability)
7. [Implementation Roadmap](#implementation-roadmap)

## System Overview

### Purpose
Provide a unified interface for Claude Desktop and Claude CLI to interact with personal information management systems across multiple platforms, with Microsoft Graph as the primary integration.

### Key Capabilities
- **Email**: Read, send, search, organize across all platforms
- **Calendar**: Create, update, find free time, manage events
- **Contacts**: Search, create, update, deduplicate
- **Tasks**: Create, update, complete, organize
- **Files**: List, read, upload, organize

### Supported Platforms
1. **Microsoft** (Priority) - via Graph API with delegated permissions
2. **Google** - via Gmail, Calendar, People, Tasks, Drive APIs
3. **Apple** - via CalDAV, CardDAV, CloudKit, IMAP/SMTP

## Architecture Principles

### 1. Hexagonal Architecture
- Clear separation between business logic and platform specifics
- Platform adapters implement common interfaces (ports)
- Core domain remains platform-agnostic

### 2. Platform Isolation (Bulkhead Pattern)
- Each platform operates in isolation
- Failures in one platform don't cascade to others
- Graceful degradation when platforms are unavailable

### 3. MCP Best Practices
- Resources for read-only, cacheable data
- Tools for actions and complex operations
- Medium granularity (not too micro, not too macro)

### 4. Security First
- Zero-trust model
- Encrypted token storage (AES-256)
- Automatic token refresh with buffer
- Minimal scope requests

## Core Architecture

### Hexagonal Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation Layer                    │
│                   (MCP Tools & Resources)                │
├─────────────────────────────────────────────────────────┤
│                    Application Layer                     │
│              (Commands, Queries, Use Cases)              │
├─────────────────────────────────────────────────────────┤
│                      Domain Layer                        │
│           (Entities, Value Objects, Services)            │
├─────────────────────────────────────────────────────────┤
│                  Infrastructure Layer                    │
│      (Platform Adapters, Cache, Authentication)          │
└─────────────────────────────────────────────────────────┘
```

### Project Structure

```
unified-pim-mcp/
├── src/
│   ├── domain/                 # Core business logic
│   │   ├── entities/           # Email, Event, Contact, Task, File
│   │   ├── value-objects/      # EmailAddress, DateRange, etc.
│   │   ├── services/           # UnifiedSearch, Deduplication
│   │   └── interfaces/         # Port definitions
│   │
│   ├── application/            # Use cases and orchestration
│   │   ├── commands/           # SendEmail, CreateEvent, etc.
│   │   ├── queries/            # SearchEmails, GetEvents, etc.
│   │   └── sagas/              # Multi-platform operations
│   │
│   ├── infrastructure/         # External integrations
│   │   ├── adapters/
│   │   │   ├── microsoft/      # Graph API implementation
│   │   │   ├── google/         # Google APIs implementation
│   │   │   └── apple/          # CalDAV/CardDAV implementation
│   │   ├── mcp/
│   │   │   ├── server/         # MCP server setup
│   │   │   ├── tools/          # Tool definitions
│   │   │   └── resources/      # Resource definitions
│   │   ├── cache/
│   │   │   ├── memory/         # In-memory cache
│   │   │   ├── chromadb/       # Vector DB integration
│   │   │   └── file/           # File-based cache
│   │   └── persistence/        # Token storage
│   │
│   └── shared/                 # Cross-cutting concerns
│       ├── security/           # Encryption, token management
│       ├── resilience/         # Circuit breaker, rate limiter
│       ├── logging/            # Structured logging
│       └── monitoring/         # Metrics and tracing
│
├── config/                     # Configuration files
├── tests/                      # Test suites
└── docs/                       # Additional documentation
```

### Domain Model

```typescript
// Core Entities
interface Email {
  id: UnifiedId;
  platformIds: Map<Platform, string>;
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  body: EmailBody;
  attachments: Attachment[];
  metadata: EmailMetadata;
}

interface CalendarEvent {
  id: UnifiedId;
  platformIds: Map<Platform, string>;
  title: string;
  start: DateTime;
  end: DateTime;
  attendees: Attendee[];
  recurrence?: RecurrenceRule;
  metadata: EventMetadata;
}

interface Contact {
  id: UnifiedId;
  platformIds: Map<Platform, string>;
  name: PersonName;
  emails: EmailAddress[];
  phones: PhoneNumber[];
  organization?: Organization;
  metadata: ContactMetadata;
}
```

## Platform Integration

### Microsoft Graph Integration

```typescript
// Required OAuth Scopes
const MICROSOFT_SCOPES = [
  'Mail.ReadWrite',
  'Calendar.ReadWrite',
  'Contacts.ReadWrite',
  'Tasks.ReadWrite',
  'Files.ReadWrite.All',
  'User.Read',
  'offline_access'
];

// Adapter Implementation
class MicrosoftGraphAdapter implements PlatformPort {
  async fetchEmails(criteria: SearchCriteria): Promise<Email[]>;
  async sendEmail(email: Email): Promise<void>;
  async getEvents(range: DateRange): Promise<CalendarEvent[]>;
  async createEvent(event: CalendarEvent): Promise<string>;
  // ... additional methods
}
```

### Google APIs Integration

```typescript
// Required OAuth Scopes
const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/contacts',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/drive'
];

// Adapter Implementation
class GoogleApisAdapter implements PlatformPort {
  private gmail: GmailClient;
  private calendar: CalendarClient;
  private people: PeopleClient;
  // ... implementation
}
```

### Apple Integration

```typescript
// Integration Strategy
class AppleAdapter implements PlatformPort {
  private caldav: CalDAVClient;    // Calendar
  private carddav: CardDAVClient;  // Contacts
  private imap: IMAPClient;        // Email read
  private smtp: SMTPClient;        // Email send
  private cloudkit: CloudKitClient; // Files
  // ... implementation
}
```

## MCP Interface Design

### Tool Definitions

```typescript
// Email Tools
{
  name: "pim_email_send",
  description: "Send email through configured platform",
  inputSchema: {
    to: string[],
    subject: string,
    body: string,
    attachments?: Attachment[],
    platform?: Platform,
    platform_options?: PlatformSpecificOptions
  }
}

{
  name: "pim_email_search",
  description: "Search emails across platforms",
  inputSchema: {
    query: string,
    platform?: Platform,
    folder?: string,
    limit?: number,
    cursor?: string
  }
}

// Calendar Tools
{
  name: "pim_calendar_create_event",
  description: "Create calendar event",
  inputSchema: {
    title: string,
    start: string,
    end: string,
    description?: string,
    attendees?: string[],
    platform?: Platform
  }
}

{
  name: "pim_calendar_find_free_time",
  description: "Find available time slots",
  inputSchema: {
    duration: number,
    range: DateRange,
    attendees?: string[],
    platform?: Platform
  }
}

// Unified Tools
{
  name: "pim_unified_search",
  description: "Search across all data types and platforms",
  inputSchema: {
    query: string,
    types?: DataType[],
    platforms?: Platform[]
  }
}
```

### Resource Definitions

```typescript
// Read-only resources for efficient data access
resources: [
  {
    uri: "pim://emails/inbox",
    description: "Recent inbox emails"
  },
  {
    uri: "pim://calendar/events/today",
    description: "Today's calendar events"
  },
  {
    uri: "pim://contacts/recent",
    description: "Recently accessed contacts"
  },
  {
    uri: "pim://tasks/active",
    description: "Active tasks"
  }
]
```

## Security Architecture

### Authentication Flow

```typescript
class AuthenticationManager {
  private tokenStore: EncryptedTokenStore;
  private refreshManager: TokenRefreshManager;
  
  async authenticate(platform: Platform): Promise<void> {
    // 1. Initiate OAuth flow
    const authUrl = this.buildAuthUrl(platform);
    
    // 2. Handle callback
    const code = await this.handleCallback();
    
    // 3. Exchange for tokens
    const tokens = await this.exchangeCodeForTokens(code);
    
    // 4. Encrypt and store
    await this.tokenStore.save(platform, tokens);
    
    // 5. Schedule refresh
    this.refreshManager.schedule(platform, tokens.expires_in);
  }
}
```

### Token Management

```typescript
class TokenManager {
  private encryption: AES256Encryption;
  
  async getValidToken(platform: Platform): Promise<string> {
    const encrypted = await this.storage.get(platform);
    const token = this.encryption.decrypt(encrypted);
    
    if (this.isExpiringSoon(token, 300)) { // 5 minute buffer
      return await this.refresh(platform, token);
    }
    
    return token.access_token;
  }
}
```

### Zero-Trust Implementation

```typescript
class SecurityGateway {
  async validateRequest(request: MCPRequest): Promise<void> {
    // Verify caller identity
    await this.verifyIdentity(request);
    
    // Check permissions
    await this.checkPermissions(request);
    
    // Validate data integrity
    await this.validateIntegrity(request);
    
    // Apply rate limiting
    await this.rateLimiter.check(request);
  }
}
```

## Performance & Scalability

### Multi-Layer Caching

```typescript
class CacheManager {
  private layers = {
    memory: new MemoryCache({ ttl: 300 }), // 5 minutes
    chromadb: new ChromaDBCache({ ttl: 3600 }), // 1 hour
    file: new FileCache({ ttl: 1800 }) // 30 minutes
  };
  
  async get(key: string): Promise<any> {
    // Check each layer in order
    for (const layer of Object.values(this.layers)) {
      const value = await layer.get(key);
      if (value) return value;
    }
    return null;
  }
}
```

### Rate Limiting

```typescript
class RateLimiter {
  private limits = {
    microsoft: { rpm: 1000, rph: 10000, concurrent: 10 },
    google: { rpm: 250, rph: 100000, concurrent: 100 },
    apple: { rpm: 60, concurrent: 3 }
  };
  
  async executeWithLimit(platform: Platform, fn: Function): Promise<any> {
    const limiter = this.getLimiter(platform);
    return await limiter.execute(fn);
  }
}
```

### Circuit Breaker

```typescript
class CircuitBreaker {
  private states = new Map<Platform, CircuitState>();
  
  async execute(platform: Platform, operation: Function): Promise<any> {
    const state = this.states.get(platform);
    
    if (state === CircuitState.OPEN) {
      throw new PlatformUnavailableError(platform);
    }
    
    try {
      const result = await operation();
      this.recordSuccess(platform);
      return result;
    } catch (error) {
      this.recordFailure(platform);
      throw error;
    }
  }
}
```

## Error Handling

### Platform Isolation

```typescript
class PlatformIsolator {
  async executeIsolated(platform: Platform, operation: Function): Promise<Result> {
    try {
      return await this.bulkheads.get(platform).execute(operation);
    } catch (error) {
      // Platform failure doesn't cascade
      this.handlePlatformFailure(platform, error);
      return Result.degraded(platform);
    }
  }
}
```

### Graceful Degradation

```typescript
class DegradationStrategy {
  async executeWithFallback(operations: PlatformOperation[]): Promise<Result> {
    const results = [];
    
    for (const op of operations) {
      try {
        results.push(await op.execute());
      } catch (error) {
        results.push(Result.partial(op.platform, error));
      }
    }
    
    return Result.aggregate(results);
  }
}
```

## Testing Strategy

### Test Pyramid

- **Unit Tests (70%)**: Domain logic, entity behavior
- **Integration Tests (25%)**: Platform adapters, MCP interface
- **E2E Tests (5%)**: Critical user journeys

### Mock Platform Clients

```typescript
class MockMicrosoftGraph implements PlatformPort {
  private scenarios: Map<string, MockScenario>;
  
  async fetchEmails(criteria: SearchCriteria): Promise<Email[]> {
    return this.scenarios.get('fetchEmails').execute(criteria);
  }
}
```

## Monitoring & Observability

### Metrics Collection

```typescript
class MetricsCollector {
  recordApiCall(platform: Platform, operation: string, duration: number): void;
  recordCacheHit(layer: CacheLayer): void;
  recordError(platform: Platform, error: Error): void;
  recordTokenRefresh(platform: Platform): void;
}
```

### Distributed Tracing

```typescript
class TraceManager {
  startSpan(operation: string): Span {
    return this.tracer.startSpan(operation, {
      attributes: {
        'mcp.operation': operation,
        'mcp.timestamp': Date.now()
      }
    });
  }
}
```

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [x] Architecture documentation
- [ ] Project structure setup
- [ ] TypeScript configuration
- [ ] Core domain entities
- [ ] MCP server foundation

### Phase 2: Microsoft Integration (Weeks 3-4)
- [ ] Microsoft Graph adapter
- [ ] OAuth implementation
- [ ] Email operations
- [ ] Calendar operations
- [ ] Token management
- [ ] Basic caching

### Phase 3: Google Integration (Weeks 5-6)
- [ ] Google APIs adapter
- [ ] Multi-platform token management
- [ ] Cross-platform data normalization
- [ ] Enhanced caching with ChromaDB

### Phase 4: Apple Integration (Weeks 7-8)
- [ ] CalDAV/CardDAV implementation
- [ ] IMAP/SMTP integration
- [ ] CloudKit for files
- [ ] Platform fallback strategies

### Phase 5: Unification & Polish (Weeks 9-10)
- [ ] Unified search implementation
- [ ] Contact deduplication
- [ ] Performance optimization
- [ ] Comprehensive testing
- [ ] Documentation completion

## Configuration

### Environment Variables

```bash
# Microsoft Configuration
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_TENANT_ID=your-tenant-id

# Google Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-secret

# Apple Configuration
APPLE_USERNAME=your-apple-id
APPLE_APP_PASSWORD=your-app-specific-password

# Security
ENCRYPTION_KEY=your-32-char-encryption-key
TOKEN_STORAGE_PATH=./secure/tokens

# Cache Configuration
CACHE_MEMORY_TTL=300
CACHE_CHROMADB_TTL=3600
CACHE_FILE_TTL=1800

# Platform Preferences
PRIMARY_PLATFORM=microsoft
ENABLE_MICROSOFT=true
ENABLE_GOOGLE=true
ENABLE_APPLE=true
```

### MCP Configuration (claude_desktop_config.json)

```json
{
  "mcpServers": {
    "unified-pim": {
      "command": "node",
      "args": ["C:\\Users\\brand\\unified-pim-mcp\\dist\\index.js"],
      "env": {
        "MICROSOFT_CLIENT_ID": "${MICROSOFT_CLIENT_ID}",
        "GOOGLE_CLIENT_ID": "${GOOGLE_CLIENT_ID}",
        "PRIMARY_PLATFORM": "microsoft"
      }
    }
  }
}
```

## Conclusion

This architecture provides a robust, scalable, and maintainable foundation for the Unified PIM MCP. The hexagonal architecture ensures platform independence, while the bulkhead pattern prevents cascade failures. The multi-layer caching strategy optimizes performance, and the comprehensive security model protects user data.

The phased implementation approach allows for iterative development and testing, with Microsoft Graph as the priority integration. The architecture supports future platform additions and feature enhancements without requiring fundamental changes to the core system.