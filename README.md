# Unified PIM MCP Server

A comprehensive Model Context Protocol (MCP) server that provides unified access to Personal Information Management (PIM) systems across Microsoft 365, Google Workspace, and Apple services.

## Features

- **Multi-Platform Support**: Seamlessly integrate with Microsoft Graph, Google APIs, and Apple services
- **Unified Interface**: Single MCP interface for email, calendar, contacts, tasks, and files
- **Hexagonal Architecture**: Clean, maintainable code following SOLID principles
- **Security First**: AES-256 encryption, secure token storage, and OAuth 2.0 flows
- **Resilience Patterns**: Circuit breakers, rate limiting, and bulkhead isolation
- **Multi-Layer Caching**: Memory, file, and ChromaDB vector caching
- **Type Safety**: Full TypeScript implementation with strict typing

## Architecture

The project follows hexagonal architecture principles with clear separation of concerns:

```
src/
├── domain/              # Core business logic
│   ├── entities/        # Email, Event, Contact, Task, File
│   ├── value-objects/   # EmailAddress, DateRange, etc.
│   ├── services/        # Domain services
│   └── interfaces/      # Port definitions
├── application/         # Use cases and orchestration
│   ├── commands/        # Command handlers
│   ├── queries/         # Query handlers
│   └── sagas/           # Multi-platform operations
├── infrastructure/     # External integrations
│   ├── adapters/        # Platform implementations
│   ├── mcp/             # MCP server and tools
│   ├── cache/           # Caching implementations
│   └── persistence/     # Data storage
└── shared/              # Cross-cutting concerns
    ├── security/        # Encryption and auth
    ├── resilience/      # Circuit breakers, etc.
    ├── logging/         # Structured logging
    └── monitoring/      # Health checks and metrics
```

## Quick Start

### Prerequisites

- Node.js 18+
- TypeScript 5.6+
- Platform credentials (Microsoft, Google, Apple)

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd unified-pim-mcp
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment configuration:
   ```bash
   copy .env.example .env
   ```

4. Configure your platform credentials in `.env`:
   ```env
   MICROSOFT_CLIENT_ID=your-microsoft-client-id
   MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
   MICROSOFT_TENANT_ID=your-tenant-id
   
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret
   
   APPLE_USERNAME=your-apple-id
   APPLE_APP_PASSWORD=your-app-specific-password
   ```

5. Build the project:
   ```bash
   npm run build
   ```

6. Start the server:
   ```bash
   npm start
   ```

### Claude Desktop Integration

Add the following to your Claude Desktop configuration file:

**Windows**: `%APPDATA%\\Claude\\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "unified-pim": {
      "command": "node",
      "args": ["C:\\path\\to\\unified-pim-mcp\\dist\\index.js"],
      "env": {
        "MICROSOFT_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_ID": "your-google-client-id",
        "PRIMARY_PLATFORM": "microsoft"
      }
    }
  }
}
```

## Platform Setup

### Microsoft 365 (Graph API)

1. Register an application in Azure AD
2. Configure delegated permissions:
   - `Mail.ReadWrite`
   - `Calendar.ReadWrite`
   - `Contacts.ReadWrite`
   - `Tasks.ReadWrite`
   - `Files.ReadWrite.All`
   - `User.Read`
   - `offline_access`
3. Add redirect URI for OAuth flow
4. Generate client secret

### Google Workspace

1. Create a project in Google Cloud Console
2. Enable required APIs:
   - Gmail API
   - Calendar API
   - People API (Contacts)
   - Tasks API
   - Drive API
3. Create OAuth 2.0 credentials
4. Configure OAuth consent screen

### Apple Services

1. Generate app-specific password for iCloud
2. Configure CalDAV/CardDAV endpoints
3. Set up IMAP/SMTP for email access

## Available Tools

### Email Tools
- `pim_email_send` - Send emails through any platform
- `pim_email_search` - Search emails across platforms
- `pim_email_get` - Retrieve specific email by ID

### Calendar Tools
- `pim_calendar_create_event` - Create calendar events
- `pim_calendar_update_event` - Update existing events
- `pim_calendar_find_free_time` - Find available time slots

### Contact Tools
- `pim_contact_search` - Search contacts across platforms
- `pim_contact_create` - Create new contacts
- `pim_contact_update` - Update contact information

### Task Tools
- `pim_task_create` - Create new tasks
- `pim_task_update` - Update task status/details
- `pim_task_complete` - Mark tasks as complete

### File Tools
- `pim_file_list` - List files and folders
- `pim_file_upload` - Upload files to cloud storage
- `pim_file_download` - Download files

### Unified Tools
- `pim_unified_search` - Search across all data types and platforms

## Development

### Scripts

- `npm run dev` - Start in development mode with hot reload
- `npm run build` - Build for production
- `npm test` - Run unit tests
- `npm run test:e2e` - Run end-to-end tests
- `npm run lint` - Run ESLint
- `npm run format` - Format code with Prettier

### Testing

The project includes comprehensive testing:

```bash
# Unit tests
npm test

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

### Code Quality

- **ESLint**: Enforces code style and catches errors
- **Prettier**: Automatic code formatting
- **TypeScript**: Static type checking
- **Husky**: Git hooks for pre-commit validation

## Security

- **Encryption**: AES-256-GCM for sensitive data
- **Token Storage**: Secure, encrypted token persistence
- **OAuth 2.0**: Standard authentication flows
- **Zero Trust**: All requests validated and authorized
- **Audit Logging**: Comprehensive security event logging

## Performance

- **Multi-Layer Caching**: Memory → ChromaDB → File cache
- **Rate Limiting**: Respects platform API limits
- **Circuit Breakers**: Automatic failure handling
- **Connection Pooling**: Efficient resource usage
- **Batch Operations**: Optimized bulk operations

## Monitoring

- **Health Checks**: Real-time system status
- **Metrics Collection**: Performance and usage stats
- **Distributed Tracing**: Request flow tracking
- **Error Tracking**: Comprehensive error reporting

## Configuration

All configuration is managed through environment variables and configuration files. See `.env.example` for available options.

### Key Settings

- `PRIMARY_PLATFORM`: Default platform for operations
- `CACHE_*`: Cache configuration and TTL settings
- `RATE_LIMIT_*`: API rate limiting parameters
- `SECURITY_*`: Encryption and authentication settings

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Verify client IDs and secrets
   - Check OAuth redirect URIs
   - Ensure proper scopes are requested

2. **Rate Limiting**
   - Check platform API quotas
   - Adjust rate limiting settings
   - Consider implementing backoff strategies

3. **Cache Issues**
   - Verify cache storage paths
   - Check ChromaDB connection
   - Clear cache if data is stale

### Logging

The server provides structured JSON logging. Set `LOG_LEVEL=debug` for detailed troubleshooting information.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

### Code Standards

- Follow TypeScript strict mode
- Maintain test coverage above 70%
- Use conventional commit messages
- Update documentation for API changes

## License

MIT License - see LICENSE file for details.

## Support

For issues, feature requests, or questions:
- Open an issue on GitHub
- Check the troubleshooting guide
- Review the architecture documentation

## Roadmap

- [ ] Real-time synchronization
- [ ] Conflict resolution strategies
- [ ] Advanced search with AI
- [ ] Mobile platform support
- [ ] GraphQL API option
- [ ] Plugin architecture for custom platforms