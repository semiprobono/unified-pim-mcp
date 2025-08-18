# Unified PIM MCP - Project Context for Claude

## Project Overview
This is a Unified Personal Information Management (PIM) MCP server that integrates Microsoft Graph, Google APIs, and Apple services to provide comprehensive CRUD operations for email, calendar, contacts, tasks, and files through Claude Desktop and Claude CLI.

## Architecture
- **Pattern**: Hexagonal Architecture with platform adapters
- **Core Principle**: Platform isolation using bulkhead pattern
- **Data Layer**: ChromaDB for semantic search and caching
- **Security**: OAuth2 with PKCE, AES-256 token encryption

## Current Implementation Status

### ✅ Completed
1. Project foundation with TypeScript strict mode
2. Hexagonal architecture structure
3. Domain entities (Email, Calendar, Contact, Task, File)
4. MCP server setup
5. Development environment optimization
6. Architecture documentation
7. Microsoft Graph implementation plan

### 🚧 In Progress
- Microsoft Graph adapter implementation (Phase 1: OAuth2/MSAL setup)

### 📋 Upcoming
1. GraphClient with rate limiting
2. ChromaDB collections setup
3. Email service implementation
4. Calendar and contacts services
5. Tasks and files integration
6. Google APIs adapter
7. Apple services adapter

## Key Technical Decisions

### Authentication
- **Microsoft**: MSAL.js (not manual OAuth2)
- **Google**: Google Auth Library
- **Apple**: CalDAV/CardDAV with app-specific passwords

### API Strategy
- REST API over SDKs for better control
- ChromaDB for all caching and search
- Batch operations where supported

### ChromaDB Collections
1. `graph-api-cache` - Frequently accessed data (5 min TTL)
2. `graph-search-index` - Semantic search across all content
3. `graph-metadata` - Sync state and delta tokens

## Development Guidelines

### File Structure
```
src/
├── domain/          # Core business logic (platform-agnostic)
├── application/     # Use cases and commands
├── infrastructure/  # Platform adapters and external services
│   ├── adapters/
│   │   ├── microsoft/
│   │   ├── google/
│   │   └── apple/
└── shared/         # Cross-cutting concerns
```

### Testing Requirements
- Unit tests for all domain logic
- Integration tests for platform adapters
- E2E tests for critical user journeys
- Mock Graph API responses for development

### Code Standards
- TypeScript strict mode enabled
- ESLint and Prettier configured
- Pre-commit hooks active
- No console.log in production code

## Quick Commands

### Development
```bash
npm run dev              # Start with hot reload
npm run dev:microsoft    # Focus on Microsoft Graph
npm run test:watch       # TDD mode
npm run cli help         # Interactive CLI help
```

### Docker Services
```bash
npm run docker:up        # Start ChromaDB, Redis, etc.
npm run docker:status    # Check service health
npm run docker:down      # Stop all services
```

### Platform Testing
```bash
npm run graph:explorer   # Microsoft Graph Explorer
npm run google:test      # Google APIs tester
npm run platform:switch  # Switch active platform
```

## Environment Variables Required

### Microsoft Graph
```
AZURE_CLIENT_ID=
AZURE_TENANT_ID=
AZURE_CLIENT_SECRET=    # Optional for public clients
```

### ChromaDB
```
CHROMADB_HOST=localhost
CHROMADB_PORT=8000
```

## Current Focus: Microsoft Graph Implementation

### Phase 1 (Current): Foundation & Authentication
- [ ] MSAL.js setup
- [ ] OAuth2 flow with PKCE
- [ ] GraphClient base class
- [ ] ChromaDB collections initialization

### Implementation Reference
See `docs/MICROSOFT_GRAPH_IMPLEMENTATION.md` for detailed implementation guide.

## Important Notes

1. **Platform Independence**: Never let platform-specific code leak into domain layer
2. **Error Handling**: Each platform adapter must handle its own errors gracefully
3. **Caching Strategy**: Always check ChromaDB before making API calls
4. **Security**: All tokens must be encrypted at rest
5. **Rate Limiting**: Respect platform-specific rate limits

## Testing Accounts
Development uses test accounts configured in `.env.local` (not committed).

## Support Resources
- Architecture: `ARCHITECTURE.md`
- Development: `DEVELOPMENT.md`
- Graph Implementation: `docs/MICROSOFT_GRAPH_IMPLEMENTATION.md`
- VS Code: Workspace configured with recommended extensions

## Next Steps
1. Complete MSAL authentication setup
2. Implement GraphClient with rate limiting
3. Create ChromaDB collections
4. Build EmailService with semantic search

---
*This file is checked into the repository and should be kept up-to-date as the project evolves.*