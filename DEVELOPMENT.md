# Development Guide

This guide covers the development workflow, tools, and best practices for the Unified PIM MCP project.

## Quick Start

### Prerequisites

- **Node.js** 18+ (recommended: 20 LTS)
- **PowerShell 7+** (for Windows-optimized scripts)
- **Docker** and **Docker Compose** (for local services)
- **Git** with configured user name and email

### One-Command Setup

```powershell
# Full development environment setup
npm run setup:dev

# Or manual setup
.\scripts\setup-dev-env.ps1
```

### Minimal Setup (Without Docker)

```powershell
# Install dependencies only
npm install

# Start development server (without external services)
npm run dev
```

## Development Workflow

### Daily Development

```powershell
# Start all services
npm run docker:up

# Start development server with hot reload
npm run dev

# In another terminal: run tests in watch mode
npm run test:watch

# View logs from all Docker services
npm run docker:logs
```

### Platform-Specific Development

```powershell
# Develop with Microsoft Graph only
npm run dev:microsoft

# Develop with Google APIs only  
npm run dev:google

# Develop with Apple services only
npm run dev:apple
```

## VS Code Setup

### Recommended Extensions

The project includes a comprehensive `.vscode/extensions.json` with recommended extensions:

- **Essential**: TypeScript, ESLint, Prettier, Error Lens
- **Testing**: Jest, Test Explorer
- **Git**: GitLens, Git Graph
- **Productivity**: Path Intellisense, TODO Highlight
- **Platform-Specific**: Microsoft Graph tools, Thunder Client

### Debug Configurations

Available debug configurations in VS Code:

- **Debug MCP Server**: Main server with TypeScript compilation
- **Debug Current Test File**: Debug the currently open test file
- **Debug All Tests**: Debug the entire test suite
- **Debug Platform Adapters**: Separate configs for Microsoft, Google, Apple
- **Debug with Chrome DevTools**: For advanced debugging

### Key Commands

- `F5`: Start debugging
- `Ctrl+Shift+F5`: Restart debugging
- `Ctrl+Shift+P` → "Tasks: Run Task": Run any npm script
- `Ctrl+Shift+` `: Open integrated terminal

## Testing

### Test Commands

```powershell
# Run all tests
npm test

# Run tests in watch mode with notifications
npm run test:watch

# Run specific test types
npm run test:unit
npm run test:integration
npm run test:e2e

# Run tests with coverage
npm run test:coverage

# Open coverage report in browser
npm run test:coverage:open

# Debug tests
npm run test:debug
```

### Writing Tests

```typescript
// Example unit test
describe('EmailAddress', () => {
  it('should validate email format', () => {
    const email = new EmailAddress('test@example.com');
    expect(email.isValid()).toBe(true);
  });
});

// Example integration test with mocks
describe('MicrosoftGraphAdapter', () => {
  beforeEach(async () => {
    // Setup mock data
    const mockData = require('../mocks/data/load-mock-data');
    // Configure test environment
  });
});
```

### Test Data

Mock data is automatically generated and available at:
- `tests/mocks/data/emails.json`
- `tests/mocks/data/contacts.json`
- `tests/mocks/data/events.json`
- `tests/mocks/data/tasks.json`
- `tests/mocks/data/files.json`

Regenerate with: `npm run generate:mocks`

## Code Quality

### Automated Quality Checks

The project uses pre-commit hooks that automatically:

1. **Lint and format** staged files
2. **Type check** the entire codebase  
3. **Run unit tests** for changed files
4. **Validate commit messages**

### Manual Quality Checks

```powershell
# Run all quality checks
npm run validate

# Individual checks
npm run type-check
npm run lint
npm run format
npm run test

# Watch for changes
npm run type-check:watch
npm run lint:watch
```

### Code Formatting

- **Prettier** handles code formatting
- **ESLint** handles code quality and consistency
- Both run automatically on save in VS Code
- Pre-commit hooks ensure formatted code

## Docker Services

### Essential Services (Always Running)

- **ChromaDB** (port 8000): Vector database for semantic search
- **Redis** (port 6379): Caching and session storage

### Development Services (Optional)

- **PostgreSQL** (port 5432): Metadata storage with dev schema
- **MailHog** (port 8025): Email testing interface
- **Mock OAuth** (port 1080): OAuth2 server for testing
- **Jaeger** (port 16686): Distributed tracing (monitoring profile)
- **MinIO** (port 9000/9001): S3-compatible storage (storage profile)

### Docker Commands

```powershell
# Start essential services only
docker-compose up -d

# Start all development services
npm run docker:up
# OR
docker-compose -f docker-compose.dev.yml up -d

# View service status
docker-compose ps

# View logs
npm run docker:logs

# Stop all services
npm run docker:down

# Clean up (removes volumes)
npm run docker:clean
```

## Architecture Patterns

### Hexagonal Architecture

The project follows hexagonal (ports and adapters) architecture:

```
src/
├── domain/           # Core business logic (entities, value objects)
├── application/      # Use cases and application services
├── infrastructure/   # External adapters (DB, APIs, MCP)
└── shared/          # Cross-cutting concerns
```

### Common Patterns

See VS Code snippets (`.vscode/snippets/`) for:
- Domain entities
- Value objects  
- Platform adapters
- Application services
- MCP tools and resources

## Platform Integration

### Microsoft Graph

```typescript
// Environment variables
MICROSOFT_CLIENT_ID=your_app_id
MICROSOFT_CLIENT_SECRET=your_app_secret
MICROSOFT_TENANT_ID=your_tenant_id

// Development endpoint
Mock OAuth: http://localhost:1080/oauth2/token
```

### Google APIs

```typescript
// Environment variables
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret

// Development scopes
- gmail.readonly
- calendar.readonly
- contacts.readonly
- drive.readonly
```

### Apple Services

```typescript
// Environment variables (optional for development)
APPLE_TEAM_ID=your_team_id
APPLE_CLIENT_ID=your_client_id
APPLE_KEY_ID=your_key_id
```

## Performance and Monitoring

### Local Development

```powershell
# Analyze bundle size
npm run analyze:bundle

# Generate dependency graph
npm run analyze:deps

# Run benchmarks
npm run benchmark

# Profile performance
npm run profile
npm run profile:analyze
```

### Health Monitoring

The server includes built-in health monitoring:
- Service connectivity checks
- Performance metrics
- Memory usage tracking
- Error rate monitoring

Access at: `http://localhost:3000/health` (when server is running)

## Troubleshooting

### Common Issues

1. **Node.js version conflicts**
   ```powershell
   node --version  # Should be 18+
   npm run health  # Check environment
   ```

2. **Docker services not starting**
   ```powershell
   docker-compose ps    # Check service status
   docker-compose logs  # View error logs
   ```

3. **TypeScript compilation errors**
   ```powershell
   npm run type-check  # Check for type errors
   npm run clean       # Clean build artifacts
   npm run build       # Full rebuild
   ```

4. **Test failures**
   ```powershell
   npm run test:unit -- --verbose    # Detailed test output
   npm run docker:up                 # Ensure services running
   npm run generate:mocks            # Regenerate test data
   ```

5. **Git hooks not working**
   ```powershell
   npx husky install    # Reinstall git hooks
   ```

### Performance Issues

```powershell
# Check memory usage
npm run profile

# Analyze startup time
npm run benchmark

# Check for memory leaks in tests
npm run test -- --detectOpenHandles --forceExit
```

### Environment Reset

```powershell
# Clean everything and start fresh
npm run clean:all
npm run setup:dev
```

## Scripts Reference

### Development
- `npm run dev` - Start with hot reload
- `npm run dev:debug` - Start with debugger
- `npm run dev:microsoft` - Microsoft Graph only
- `npm run dev:google` - Google APIs only
- `npm run dev:apple` - Apple services only

### Building
- `npm run build` - Production build
- `npm run build:watch` - Watch mode build
- `npm run clean` - Clean build artifacts

### Testing
- `npm run test` - Run all tests
- `npm run test:watch` - Watch mode
- `npm run test:unit` - Unit tests only
- `npm run test:integration` - Integration tests
- `npm run test:e2e` - End-to-end tests
- `npm run test:coverage` - With coverage report

### Quality
- `npm run lint` - Check code style
- `npm run lint:fix` - Fix code style issues
- `npm run format` - Format code
- `npm run type-check` - TypeScript checking
- `npm run validate` - All quality checks

### Docker
- `npm run docker:up` - Start services
- `npm run docker:down` - Stop services
- `npm run docker:logs` - View logs
- `npm run docker:clean` - Clean up

### Utilities
- `npm run setup` - Quick setup
- `npm run setup:dev` - Full dev setup
- `npm run generate:mocks` - Generate test data
- `npm run health` - Check environment
- `npm run deps:check` - Check outdated deps
- `npm run analyze:bundle` - Bundle size analysis

## Contributing

1. **Branch naming**: `feature/description`, `fix/description`, `docs/description`
2. **Commit messages**: Clear, descriptive messages (10+ characters)
3. **Pull requests**: Include tests, documentation updates
4. **Code review**: All changes require review before merging

### Before Committing

The pre-commit hook automatically runs:
- ESLint + Prettier formatting
- TypeScript type checking  
- Unit tests for changed files

### Before Pushing

The pre-push hook runs:
- Full validation suite
- Bundle size analysis
- TODO/FIXME comment detection

## Additional Resources

- [MCP SDK Documentation](https://github.com/modelcontextprotocol/typescript-sdk)
- [Microsoft Graph API](https://docs.microsoft.com/en-us/graph/)
- [Google APIs Documentation](https://developers.google.com/apis-explorer)
- [ChromaDB Documentation](https://docs.trychroma.com/)
- [Jest Testing Framework](https://jestjs.io/docs/getting-started)