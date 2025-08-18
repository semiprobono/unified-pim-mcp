#Requires -Version 7.0

<#
.SYNOPSIS
    Ultimate Developer Experience Setup for Unified PIM MCP
    
.DESCRIPTION
    One-command setup that creates the most amazing development experience:
    - Environment validation and health checks
    - Intelligent dependency installation
    - Docker services orchestration
    - Performance monitoring setup
    - Development tools configuration
    - Azure AD integration (optional)
    
.PARAMETER Mode
    Setup mode: Quick, Full, or Production
    
.PARAMETER SkipAzure
    Skip Azure AD setup (use mock authentication)
    
.PARAMETER Performance
    Include performance monitoring tools
    
.PARAMETER Force
    Force reinstall of all dependencies

.EXAMPLE
    .\ultimate-dev-setup.ps1 -Mode Quick
    
.EXAMPLE
    .\ultimate-dev-setup.ps1 -Mode Full -Performance
#>

[CmdletBinding()]
param(
    [Parameter(HelpMessage = "Setup mode")]
    [ValidateSet("Quick", "Full", "Production")]
    [string]$Mode = "Quick",
    
    [Parameter(HelpMessage = "Skip Azure AD setup")]
    [switch]$SkipAzure,
    
    [Parameter(HelpMessage = "Include performance monitoring")]
    [switch]$Performance,
    
    [Parameter(HelpMessage = "Force reinstall dependencies")]
    [switch]$Force
)

# Color output functions
function Write-Success { param([string]$Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param([string]$Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Step { param([string]$Message) Write-Host "🔄 $Message" -ForegroundColor Blue }
function Write-Celebration { param([string]$Message) Write-Host "🎉 $Message" -ForegroundColor Magenta }

# Progress tracking
$script:TotalSteps = 0
$script:CurrentStep = 0

function Start-ProgressTracking {
    param([int]$Steps)
    $script:TotalSteps = $Steps
    $script:CurrentStep = 0
}

function Step-Progress {
    param([string]$Activity)
    $script:CurrentStep++
    $percent = [math]::Round(($script:CurrentStep / $script:TotalSteps) * 100)
    Write-Progress -Activity "Ultimate Dev Setup" -Status $Activity -PercentComplete $percent
}

# Health check functions
function Test-Prerequisites {
    Write-Step "Validating prerequisites..."
    
    $issues = @()
    
    # Check Node.js version
    try {
        $nodeVersion = node --version
        $nodeVersionNumber = [version]($nodeVersion -replace '^v')
        if ($nodeVersionNumber -lt [version]"18.0.0") {
            $issues += "Node.js version $nodeVersion is too old (required: 18+)"
        } else {
            Write-Success "Node.js $nodeVersion ✓"
        }
    } catch {
        $issues += "Node.js is not installed or not in PATH"
    }
    
    # Check npm
    try {
        $npmVersion = npm --version
        Write-Success "npm $npmVersion ✓"
    } catch {
        $issues += "npm is not available"
    }
    
    # Check Docker
    try {
        $dockerVersion = docker --version
        Write-Success "Docker available ✓"
        
        # Test Docker daemon
        docker info | Out-Null
        if ($LASTEXITCODE -ne 0) {
            $issues += "Docker daemon is not running"
        }
    } catch {
        $issues += "Docker is not installed or not running"
    }
    
    # Check Git
    try {
        $gitVersion = git --version
        Write-Success "Git available ✓"
    } catch {
        $issues += "Git is not installed"
    }
    
    # Check PowerShell version
    if ($PSVersionTable.PSVersion -lt [version]"7.0") {
        $issues += "PowerShell 7+ is required (current: $($PSVersionTable.PSVersion))"
    } else {
        Write-Success "PowerShell $($PSVersionTable.PSVersion) ✓"
    }
    
    return $issues
}

function Install-Dependencies {
    Write-Step "Installing and updating dependencies..."
    
    # Clean install if forced
    if ($Force) {
        Write-Info "Force mode: cleaning node_modules..."
        if (Test-Path "node_modules") {
            Remove-Item "node_modules" -Recurse -Force
        }
        if (Test-Path "package-lock.json") {
            Remove-Item "package-lock.json" -Force
        }
    }
    
    # Install dependencies with optimizations
    Write-Info "Running npm install with performance optimizations..."
    $env:CYPRESS_INSTALL_BINARY = "0"  # Skip Cypress binary
    $env:PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "true"  # Skip Puppeteer binary
    
    npm install --prefer-offline --no-audit --progress=false
    if ($LASTEXITCODE -ne 0) {
        throw "npm install failed"
    }
    
    Write-Success "Dependencies installed successfully"
}

function Initialize-Environment {
    Write-Step "Setting up environment configuration..."
    
    # Create .env file if it doesn't exist
    if (-not (Test-Path ".env")) {
        $envTemplate = @"
# Unified PIM MCP - Environment Configuration

# Development Mode
NODE_ENV=development
LOG_LEVEL=debug

# MCP Server Configuration
MCP_PORT=8080
MCP_HOST=localhost

# ChromaDB Configuration
CHROMADB_HOST=localhost
CHROMADB_PORT=8000
CHROMADB_PATH=./data/chromadb

# Redis Configuration (optional)
REDIS_HOST=localhost
REDIS_PORT=6379

# Security
JWT_SECRET=dev-secret-change-in-production
ENCRYPTION_KEY=dev-encryption-key-32-chars-min

# Platform Configuration
ACTIVE_PLATFORMS=microsoft
MOCK_AUTH=$($SkipAzure.IsPresent)

# Performance Monitoring
ENABLE_METRICS=$($Performance.IsPresent)
METRICS_PORT=9090

# Development Features
HOT_RELOAD=true
DEV_TOOLS=true
AUTO_RESTART=true
"@
        
        if (-not $SkipAzure) {
            $envTemplate += @"

# Azure AD Configuration (will be filled by azure-ad-setup.ps1)
AZURE_CLIENT_ID=
AZURE_TENANT_ID=
AZURE_AUTHORITY=
AZURE_REDIRECT_URI=http://localhost:8080/auth/callback
"@
        }
        
        $envTemplate | Set-Content ".env" -Encoding UTF8
        Write-Success "Created .env configuration file"
    } else {
        Write-Info ".env file already exists - skipping creation"
    }
    
    # Create config directories
    $configDirs = @("config/azure", "config/google", "config/apple", "data/chromadb", "logs", "temp")
    foreach ($dir in $configDirs) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Success "Created directory: $dir"
        }
    }
}

function Start-DockerServices {
    Write-Step "Starting Docker services..."
    
    # Check if docker-compose file exists
    if (-not (Test-Path "docker-compose.dev.yml")) {
        Write-Warning "docker-compose.dev.yml not found - skipping Docker services"
        return
    }
    
    # Start services
    Write-Info "Starting ChromaDB, Redis, and monitoring services..."
    docker-compose -f docker-compose.dev.yml up -d
    
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Some Docker services failed to start - continuing anyway"
    } else {
        Write-Success "Docker services started successfully"
        
        # Wait for services to be ready
        Write-Info "Waiting for services to be ready..."
        $maxWait = 30
        $waited = 0
        
        while ($waited -lt $maxWait) {
            try {
                $response = Invoke-WebRequest -Uri "http://localhost:8000/api/v1/heartbeat" -TimeoutSec 2 -ErrorAction Stop
                if ($response.StatusCode -eq 200) {
                    Write-Success "ChromaDB is ready"
                    break
                }
            } catch {
                Start-Sleep -Seconds 2
                $waited += 2
                Write-Host "." -NoNewline
            }
        }
        
        if ($waited -ge $maxWait) {
            Write-Warning "ChromaDB didn't respond within $maxWait seconds"
        }
    }
}

function Setup-DevelopmentTools {
    Write-Step "Configuring development tools..."
    
    # Create VS Code workspace settings
    $vscodeDir = ".vscode"
    if (-not (Test-Path $vscodeDir)) {
        New-Item -ItemType Directory -Path $vscodeDir | Out-Null
    }
    
    # Enhanced VS Code settings
    $vscodeSettings = @{
        "typescript.preferences.importModuleSpecifier" = "relative"
        "typescript.suggest.autoImports" = $true
        "typescript.updateImportsOnFileMove.enabled" = "always"
        "editor.formatOnSave" = $true
        "editor.codeActionsOnSave" = @{
            "source.fixAll.eslint" = $true
            "source.organizeImports" = $true
        }
        "eslint.workingDirectories" = @("src", "tests")
        "jest.autoRun" = "watch"
        "jest.showCoverageOnLoad" = $true
        "files.associations" = @{
            "*.env.*" = "properties"
        }
        "search.exclude" = @{
            "**/node_modules" = $true
            "**/dist" = $true
            "**/coverage" = $true
            "**/.git" = $true
        }
        "terminal.integrated.defaultProfile.windows" = "PowerShell"
        "terminal.integrated.profiles.windows" = @{
            "PowerShell" = @{
                "source" = "PowerShell"
                "args" = @("-NoLogo")
            }
        }
    } | ConvertTo-Json -Depth 10
    
    $vscodeSettings | Set-Content "$vscodeDir/settings.json" -Encoding UTF8
    Write-Success "VS Code settings configured"
    
    # Create launch configuration for debugging
    $launchConfig = @{
        "version" = "0.2.0"
        "configurations" = @(
            @{
                "name" = "Launch MCP Server"
                "type" = "node"
                "request" = "launch"
                "program" = "${workspaceFolder}/src/index.ts"
                "outFiles" = @("${workspaceFolder}/dist/**/*.js")
                "runtimeArgs" = @("-r", "tsx/cjs")
                "env" = @{
                    "NODE_ENV" = "development"
                    "LOG_LEVEL" = "debug"
                }
                "console" = "integratedTerminal"
                "restart" = $true
                "stopOnEntry" = $false
            },
            @{
                "name" = "Debug Tests"
                "type" = "node"
                "request" = "launch"
                "program" = "${workspaceFolder}/node_modules/.bin/jest"
                "args" = @("--runInBand", "--no-cache")
                "console" = "integratedTerminal"
                "env" = @{
                    "NODE_ENV" = "test"
                }
            }
        )
    } | ConvertTo-Json -Depth 10
    
    $launchConfig | Set-Content "$vscodeDir/launch.json" -Encoding UTF8
    Write-Success "VS Code debugging configured"
}

function Setup-PerformanceMonitoring {
    if (-not $Performance) {
        return
    }
    
    Write-Step "Setting up performance monitoring..."
    
    # Create performance monitoring configuration
    $perfConfig = @"
// Auto-generated performance monitoring configuration
export const performanceConfig = {
  enabled: process.env.ENABLE_METRICS === 'true',
  metricsPort: parseInt(process.env.METRICS_PORT || '9090'),
  sampling: {
    traces: 0.1,  // Sample 10% of traces
    metrics: 1.0  // Collect all metrics
  },
  thresholds: {
    responseTime: 1000,    // 1 second
    memoryUsage: 512,      // 512 MB
    cpuUsage: 80          // 80%
  },
  alerts: {
    email: process.env.ALERT_EMAIL,
    webhook: process.env.ALERT_WEBHOOK
  }
};
"@
    
    $perfConfig | Set-Content "src/shared/monitoring/performanceConfig.ts" -Encoding UTF8
    Write-Success "Performance monitoring configured"
}

function Run-InitialTests {
    Write-Step "Running initial tests to validate setup..."
    
    # Run basic health check
    npm run health
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Health check reported issues - continuing anyway"
    }
    
    # Run quick test suite
    Write-Info "Running smoke tests..."
    npm run test -- --testPathPattern=".*\.(smoke|health)\.test\.(ts|js)$" --passWithNoTests
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Initial tests passed"
    } else {
        Write-Warning "Some tests failed - check output above"
    }
}

function Setup-AzureAD {
    if ($SkipAzure) {
        Write-Info "Skipping Azure AD setup (using mock authentication)"
        return
    }
    
    Write-Step "Setting up Azure AD integration..."
    
    # Check if Azure setup script exists
    if (-not (Test-Path "scripts/azure-ad-setup.ps1")) {
        Write-Warning "Azure AD setup script not found - skipping Azure setup"
        return
    }
    
    Write-Info "Would you like to run Azure AD setup now? (requires Azure admin permissions)"
    $response = Read-Host "Run Azure AD setup? [y/N]"
    
    if ($response -match "^[Yy]") {
        try {
            & ".\scripts\azure-ad-setup.ps1" -Environment "Development"
            Write-Success "Azure AD setup completed"
        } catch {
            Write-Warning "Azure AD setup failed: $($_.Exception.Message)"
            Write-Info "You can run it later with: .\scripts\azure-ad-setup.ps1"
        }
    } else {
        Write-Info "Azure AD setup skipped - using mock authentication"
        # Enable mock mode in .env
        (Get-Content ".env") -replace "MOCK_AUTH=false", "MOCK_AUTH=true" | Set-Content ".env"
    }
}

function Show-CompletionSummary {
    Write-Host ""
    Write-Celebration "🚀 ULTIMATE DEV SETUP COMPLETE! 🚀"
    Write-Host "================================" -ForegroundColor Magenta
    Write-Host ""
    
    Write-Success "✨ Your development environment is ready for AMAZING productivity!"
    Write-Host ""
    
    Write-Info "🎯 QUICK START COMMANDS:"
    Write-Host "   npm run dev              # Start with hot reload"
    Write-Host "   npm run dev:debug        # Start with debugging"
    Write-Host "   npm run test:watch       # TDD mode"
    Write-Host "   npm run cli help         # Interactive CLI"
    Write-Host ""
    
    Write-Info "🐳 DOCKER SERVICES:"
    Write-Host "   npm run docker:up        # Start all services"
    Write-Host "   npm run docker:logs      # View service logs"
    Write-Host "   npm run docker:down      # Stop all services"
    Write-Host ""
    
    Write-Info "🔧 DEVELOPMENT TOOLS:"
    Write-Host "   npm run lint:watch       # Live linting"
    Write-Host "   npm run type-check:watch # Live type checking"
    Write-Host "   npm run test:coverage    # Coverage report"
    Write-Host ""
    
    if ($Performance) {
        Write-Info "📊 PERFORMANCE MONITORING:"
        Write-Host "   http://localhost:9090    # Metrics dashboard"
        Write-Host "   npm run benchmark        # Performance benchmarks"
        Write-Host ""
    }
    
    Write-Info "🌐 WEB INTERFACES:"
    Write-Host "   http://localhost:8080    # MCP Server"
    Write-Host "   http://localhost:8000    # ChromaDB"
    if ($Performance) {
        Write-Host "   http://localhost:9090    # Metrics"
    }
    Write-Host ""
    
    Write-Info "📝 CONFIGURATION FILES:"
    Write-Host "   .env                     # Environment variables"
    Write-Host "   .vscode/                 # VS Code settings"
    Write-Host "   config/                  # Service configurations"
    Write-Host ""
    
    Write-Warning "🔐 SECURITY REMINDERS:"
    Write-Host "   • Never commit .env files to version control"
    Write-Host "   • Rotate secrets regularly"
    Write-Host "   • Use Azure Key Vault for production"
    Write-Host ""
    
    Write-Celebration "Happy coding! Your development experience is now SMOOTH AS BUTTER! 🧈✨"
    Write-Host ""
}

# Main execution
try {
    Write-Host ""
    Write-Celebration "🚀 ULTIMATE DEVELOPER EXPERIENCE SETUP"
    Write-Host "=======================================" -ForegroundColor Magenta
    Write-Host ""
    
    # Determine number of steps based on mode
    $steps = switch ($Mode) {
        "Quick" { 8 }
        "Full" { 12 }
        "Production" { 15 }
    }
    
    if ($Performance) { $steps += 2 }
    if (-not $SkipAzure) { $steps += 2 }
    
    Start-ProgressTracking -Steps $steps
    
    # Step 1: Prerequisites check
    Step-Progress "Checking prerequisites"
    $issues = Test-Prerequisites
    
    if ($issues.Count -gt 0) {
        Write-Error "Prerequisites check failed:"
        foreach ($issue in $issues) {
            Write-Host "   • $issue" -ForegroundColor Red
        }
        Write-Host ""
        Write-Info "Please fix these issues and run the setup again."
        exit 1
    }
    
    # Step 2: Install dependencies
    Step-Progress "Installing dependencies"
    Install-Dependencies
    
    # Step 3: Environment setup
    Step-Progress "Setting up environment"
    Initialize-Environment
    
    # Step 4: Docker services
    Step-Progress "Starting Docker services"
    Start-DockerServices
    
    # Step 5: Development tools
    Step-Progress "Configuring development tools"
    Setup-DevelopmentTools
    
    # Step 6: Performance monitoring (if enabled)
    if ($Performance) {
        Step-Progress "Setting up performance monitoring"
        Setup-PerformanceMonitoring
    }
    
    # Step 7: Azure AD setup (if not skipped)
    if (-not $SkipAzure -and $Mode -ne "Quick") {
        Step-Progress "Setting up Azure AD"
        Setup-AzureAD
    }
    
    # Step 8: Initial tests
    Step-Progress "Running validation tests"
    Run-InitialTests
    
    # Complete progress
    Write-Progress -Activity "Ultimate Dev Setup" -Status "Complete" -PercentComplete 100
    Start-Sleep -Seconds 1
    Write-Progress -Activity "Ultimate Dev Setup" -Completed
    
    # Show completion summary
    Show-CompletionSummary

} catch {
    Write-Error "Setup failed: $($_.Exception.Message)"
    Write-Host ""
    Write-Info "🔧 TROUBLESHOOTING:"
    Write-Host "   • Check that all prerequisites are installed"
    Write-Host "   • Ensure Docker is running"
    Write-Host "   • Try running with -Force to reinstall dependencies"
    Write-Host "   • Check the error message above for specific issues"
    Write-Host ""
    Write-Info "Need help? Check the documentation or create an issue."
    exit 1
}