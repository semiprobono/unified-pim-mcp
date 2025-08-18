# Unified PIM MCP - Integration Test Suite

This comprehensive integration test suite validates the complete system functionality, performance, and resilience of the Unified PIM MCP server.

## 🎯 Test Coverage Overview

### Test Categories

| Category | Files | Description | Coverage |
|----------|-------|-------------|----------|
| **Authentication** | `auth.integration.test.ts` | OAuth2 PKCE flow, token management | OAuth flows, security |
| **Email Service** | `email-service.integration.test.ts` | Email CRUD operations, Graph API chain | Email functionality |
| **Infrastructure** | `infrastructure.integration.test.ts` | Component interactions, resilience | System infrastructure |
| **MCP Protocol** | `mcp-protocol.integration.test.ts` | All 8 MCP tools, protocol compliance | MCP interface |
| **End-to-End** | `end-to-end.integration.test.ts` | Complete user workflows | Full system flows |
| **Performance** | `performance.integration.test.ts` | Load testing, benchmarks | Performance metrics |
| **Error Scenarios** | `error-scenarios.integration.test.ts` | Failure handling, recovery | Error resilience |

## 🚀 Quick Start

### Prerequisites

1. **Node.js 18+** - Required for modern JavaScript features
2. **Docker** - For ChromaDB and Redis services
3. **PowerShell 7** - For Windows-specific scripts

### Setup

```bash
# Install dependencies
npm install

# Start required services
npm run docker:up

# Run all integration tests
npm run test:integration

# Run specific test category
npm run test:integration:auth
npm run test:integration:email
npm run test:integration:performance
```

### Environment Configuration

Create `.env.test` file:

```env
# Test Environment
NODE_ENV=test
LOG_LEVEL=warn

# Services
CHROMADB_HOST=localhost
CHROMADB_PORT=8000
REDIS_HOST=localhost
REDIS_PORT=6379

# Mock Credentials
AZURE_CLIENT_ID=test-client-id
AZURE_TENANT_ID=test-tenant-id
AZURE_CLIENT_SECRET=test-client-secret

# Security
ENCRYPTION_KEY=test-encryption-key-32-characters
JWT_SECRET=test-jwt-secret-key

# Performance Testing
PERFORMANCE_TEST_DURATION=30000
PERFORMANCE_TEST_CONCURRENT_USERS=10
```

## 📋 Test Suite Details

### 1. Authentication Integration Tests (`auth.integration.test.ts`)

**Purpose**: Validates the complete OAuth2 PKCE authentication flow and token management.

**Key Test Scenarios**:
- OAuth2 PKCE flow initiation with proper challenge generation
- Authorization code exchange with state validation
- Token storage with AES-256-GCM encryption
- Token refresh mechanisms and expiry handling
- Authentication state persistence across restarts
- Concurrent authentication attempt handling
- Error scenarios (invalid state, network failures, timeouts)

**Coverage**:
- ✅ PKCE parameter generation and validation
- ✅ State parameter security (CSRF protection)
- ✅ Token encryption/decryption integrity
- ✅ Token refresh workflows
- ✅ Authentication state management
- ✅ Error handling and recovery

### 2. Email Service Integration Tests (`email-service.integration.test.ts`)

**Purpose**: Tests the complete email processing chain from service to Graph API.

**Key Test Scenarios**:
- Email search with advanced filtering and pagination
- Individual email retrieval with full metadata
- Email sending with attachments and recipients
- Email reply and forward operations
- Read/unread status management
- Email deletion and recovery
- ChromaDB semantic search integration
- Caching performance optimization
- Batch operations and error handling

**Coverage**:
- ✅ Graph API request/response handling
- ✅ Email data transformation and mapping
- ✅ Advanced search filters and OData queries
- ✅ Attachment processing and file operations
- ✅ Semantic search with vector embeddings
- ✅ Cache hit/miss scenarios
- ✅ Error recovery and retry mechanisms

### 3. Infrastructure Integration Tests (`infrastructure.integration.test.ts`)

**Purpose**: Validates interactions between infrastructure components.

**Key Test Scenarios**:
- RateLimiter + CircuitBreaker coordination
- CacheManager + ChromaDB vector operations
- SecurityManager encryption/decryption
- ResilienceManager retry policies and bulkhead isolation
- ErrorHandler categorization and alerting
- HealthMonitor system status reporting
- Cross-component failure cascade prevention
- Resource utilization and optimization

**Coverage**:
- ✅ Rate limiting with circuit breaker protection
- ✅ Vector search and cache performance
- ✅ Encryption key rotation and integrity
- ✅ Retry policies with exponential backoff
- ✅ Error categorization and statistics
- ✅ Health monitoring and diagnostics
- ✅ System resilience under load

### 4. MCP Protocol Integration Tests (`mcp-protocol.integration.test.ts`)

**Purpose**: Ensures complete MCP protocol compliance and tool functionality.

**Key Test Scenarios**:
- Tool registration and schema validation
- All 8 MCP tools with parameter validation:
  - `pim_auth_start` - Authentication initiation
  - `pim_auth_callback` - OAuth callback handling
  - `pim_auth_status` - Authentication status
  - `pim_email_search` - Email search with filters
  - `pim_email_get` - Individual email retrieval
  - `pim_email_send` - Email composition and sending
  - `pim_email_reply` - Email reply operations
  - `pim_email_mark_read` - Status management
  - `pim_email_delete` - Email deletion
- Resource management and URI handling
- Error response formatting and protocol compliance
- Concurrent tool execution safety
- Performance under mixed workloads

**Coverage**:
- ✅ JSON schema validation for all tools
- ✅ Parameter validation and error handling
- ✅ MCP response format compliance
- ✅ Resource URI handling
- ✅ Concurrent execution safety
- ✅ Tool state isolation

### 5. End-to-End System Tests (`end-to-end.integration.test.ts`)

**Purpose**: Tests complete user workflows and system behavior.

**Key Test Scenarios**:
- Complete authentication → email operations workflow
- Multi-user scenarios with token isolation
- Complex email search and management workflows
- Calendar integration scenarios
- System startup/shutdown gracefully
- Recovery from unclean shutdown
- Performance under sustained load
- Graceful degradation during failures

**Coverage**:
- ✅ Full user journey workflows
- ✅ Multi-user concurrency and isolation
- ✅ System lifecycle management
- ✅ Cross-service integration
- ✅ Real-world usage patterns
- ✅ Recovery mechanisms

### 6. Performance Integration Tests (`performance.integration.test.ts`)

**Purpose**: Validates system performance under various load conditions.

**Key Test Scenarios**:
- Throughput benchmarks for all operations
- Concurrent user load testing (10-50 users)
- Memory usage monitoring and leak detection
- Cache performance impact analysis
- Network latency impact assessment
- Stress testing and breaking point identification
- Sustained load testing (30+ seconds)
- Resource utilization optimization

**Performance Metrics**:
- Operations per second (target: >10 for auth, >5 for email)
- Response time percentiles (P95, P99)
- Memory usage and leak detection
- Error rates under load (<10%)
- Cache hit rates and effectiveness
- Resource utilization efficiency

**Coverage**:
- ✅ Baseline performance benchmarks
- ✅ Load testing with realistic scenarios
- ✅ Memory management and optimization
- ✅ Performance regression detection
- ✅ Breaking point identification
- ✅ Resource efficiency analysis

### 7. Error Scenario Integration Tests (`error-scenarios.integration.test.ts`)

**Purpose**: Tests system behavior under various failure conditions.

**Key Test Scenarios**:
- Network failures and timeouts
- Authentication errors and token expiry
- API rate limiting and throttling
- Service unavailability and degradation
- Data corruption and validation errors
- Resource exhaustion scenarios
- Security breach simulations
- Recovery and fallback mechanisms

**Error Categories**:
- **Network**: Outages, intermittent failures, DNS issues
- **Authentication**: Token expiry, refresh failures, concurrent attempts
- **API**: Rate limiting, throttling, malformed responses
- **Service**: Degradation, partial outages, slow responses
- **Data**: Corruption, validation failures, missing fields
- **Resource**: Memory pressure, file descriptor exhaustion
- **Security**: Token theft, injection attempts
- **Recovery**: Cascading failures, graceful degradation

**Coverage**:
- ✅ Network resilience and recovery
- ✅ Authentication error handling
- ✅ API failure management
- ✅ Service degradation responses
- ✅ Data validation and sanitization
- ✅ Resource management
- ✅ Security threat mitigation
- ✅ System recovery mechanisms

## 🔧 Configuration and Customization

### Test Configuration Files

- `jest.integration.config.cjs` - Main Jest configuration for integration tests
- `setup.integration.ts` - Test environment setup and custom matchers
- `globalSetup.ts` - Global test environment initialization
- `globalTeardown.ts` - Cleanup and resource disposal

### Mock Strategies

Located in `tests/mocks/`:
- `advancedMockStrategies.ts` - Sophisticated API mocking
- `msalMock.ts` - MSAL authentication mocking
- `chromaDbMock.ts` - ChromaDB vector search mocking
- `httpMock.ts` - HTTP request/response mocking

### Test Data Generation

Located in `tests/fixtures/`:
- `testDataGenerator.ts` - Realistic test data generation
- `graphApiResponses.ts` - Mock Graph API responses
- `testData.ts` - Static test datasets

## 🎯 Running Specific Test Scenarios

### By Category
```bash
npm run test:integration:auth          # Authentication tests
npm run test:integration:email         # Email service tests
npm run test:integration:infrastructure # Infrastructure tests
npm run test:integration:mcp           # MCP protocol tests
npm run test:integration:e2e           # End-to-end tests
npm run test:integration:performance   # Performance tests
npm run test:integration:errors        # Error scenario tests
```

### By Test Pattern
```bash
# Run specific test suites
npm run test:integration -- --testNamePattern="OAuth2"
npm run test:integration -- --testNamePattern="Email.*CRUD"
npm run test:integration -- --testNamePattern="Performance"

# Run with specific timeout
npm run test:integration -- --testTimeout=60000

# Run with coverage
npm run test:integration -- --coverage

# Run in watch mode
npm run test:integration -- --watch
```

### Environment Variables

Control test behavior with environment variables:

```bash
# Enable real external service integration
REAL_INTEGRATION=true npm run test:integration

# Adjust performance test parameters
PERFORMANCE_TEST_DURATION=60000 npm run test:integration:performance
PERFORMANCE_TEST_CONCURRENT_USERS=20 npm run test:integration:performance

# Control logging level
LOG_LEVEL=debug npm run test:integration

# Enable specific mock scenarios
MOCK_SCENARIO=network_failures npm run test:integration:errors
```

## 📊 Test Results and Reporting

### Coverage Reports
- **HTML Report**: `coverage/integration/index.html`
- **LCOV Report**: `coverage/integration/lcov.info`
- **JSON Summary**: `coverage/integration/coverage-summary.json`

### Performance Reports
- **Benchmark Results**: `performance-results.json`
- **Memory Analysis**: `memory-usage-report.json`
- **Load Test Metrics**: `load-test-results.json`

### CI/CD Integration
- **GitHub Actions**: `.github/workflows/integration-tests.yml`
- **Test Artifacts**: Uploaded for each CI run
- **Performance Tracking**: Historical performance metrics
- **Security Scanning**: Automated vulnerability detection

## 🔍 Debugging and Troubleshooting

### Common Issues

1. **Service Connection Failures**
   ```bash
   # Check Docker services
   docker-compose -f docker-compose.dev.yml ps
   
   # Restart services
   npm run docker:down && npm run docker:up
   ```

2. **Memory Issues During Performance Tests**
   ```bash
   # Run with increased memory
   NODE_OPTIONS="--max-old-space-size=4096" npm run test:integration:performance
   ```

3. **Test Timeouts**
   ```bash
   # Increase timeout for specific tests
   npm run test:integration -- --testTimeout=120000
   ```

### Debug Mode
```bash
# Run with debugging enabled
npm run test:debug -- tests/integration/auth.integration.test.ts

# Enable verbose logging
LOG_LEVEL=debug npm run test:integration

# Run single test with full output
npm run test:integration -- --testNamePattern="specific test name" --verbose
```

### Monitoring and Metrics

During test execution, monitor:
- **Memory Usage**: Process memory consumption
- **Network Requests**: HTTP request/response patterns
- **Database Operations**: ChromaDB query performance
- **Cache Performance**: Hit/miss ratios
- **Error Rates**: Failure patterns and recovery

## 🚀 CI/CD Pipeline Integration

The integration tests are fully integrated into the CI/CD pipeline:

### Automated Triggers
- **Push to main/develop**: Full test suite
- **Pull Requests**: Targeted test execution
- **Nightly Runs**: Performance benchmarking
- **Manual Dispatch**: Custom test scenarios

### Test Matrix
- **Node.js Versions**: 18, 20
- **Operating Systems**: Ubuntu, Windows, macOS
- **Test Categories**: Unit, Integration, E2E, Performance
- **External Services**: Mock vs Real integration

### Reporting and Notifications
- **Test Results**: Aggregated reports with metrics
- **Coverage Tracking**: Codecov integration
- **Performance Trends**: Historical benchmarking
- **Failure Alerts**: Automated notifications

## 📚 Best Practices

### Writing Integration Tests
1. **Test Real Scenarios**: Focus on user workflows
2. **Mock External Dependencies**: Use realistic mocks
3. **Handle Async Operations**: Proper async/await usage
4. **Clean State**: Reset between tests
5. **Error Testing**: Include failure scenarios
6. **Performance Awareness**: Monitor resource usage

### Maintaining Test Quality
1. **Regular Updates**: Keep tests current with features
2. **Performance Monitoring**: Track test execution trends
3. **Mock Maintenance**: Update mocks with API changes
4. **Documentation**: Keep README and comments current
5. **Code Review**: Review test changes thoroughly

## 🤝 Contributing

When adding new integration tests:

1. **Choose Appropriate Category**: Place tests in the right file
2. **Follow Naming Conventions**: Descriptive test names
3. **Add Proper Setup/Teardown**: Clean test environment
4. **Include Error Scenarios**: Test failure paths
5. **Update Documentation**: Add to this README
6. **Performance Considerations**: Monitor test execution time

## 📞 Support

For questions or issues with the integration test suite:

1. **Check Logs**: Review test output and error messages
2. **Verify Setup**: Ensure all prerequisites are met
3. **Check Documentation**: Review this README and code comments
4. **Run Diagnostics**: Use debug mode and monitoring tools
5. **Report Issues**: Create detailed bug reports with reproduction steps

---

*This integration test suite provides comprehensive validation of the Unified PIM MCP system, ensuring reliability, performance, and user experience quality.*