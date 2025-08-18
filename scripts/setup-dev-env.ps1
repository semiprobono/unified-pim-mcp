# PowerShell Development Environment Setup Script
# This script sets up the complete development environment for the Unified PIM MCP project

[CmdletBinding()]
param(
    [switch]$SkipDocker,
    [switch]$SkipDependencies,
    [switch]$SkipMocks,
    [switch]$Minimal
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 Setting up Unified PIM MCP Development Environment" -ForegroundColor Green

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow

# Check Node.js version
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js: $nodeVersion" -ForegroundColor Green
    
    # Extract version number and check if >= 18
    $versionNumber = [version]($nodeVersion -replace "v", "").Split('.')[0..2] -join '.'
    if ([version]$versionNumber -lt [version]"18.0.0") {
        Write-Error "Node.js version 18 or higher required. Current: $nodeVersion"
    }
} catch {
    Write-Error "Node.js not found. Please install Node.js 18 or higher."
}

# Check PowerShell 7
$pwshVersion = $PSVersionTable.PSVersion
if ($pwshVersion.Major -lt 7) {
    Write-Warning "PowerShell 7 recommended for best experience. Current: $pwshVersion"
}

# Check Docker (if not skipped)
if (-not $SkipDocker) {
    try {
        $dockerVersion = docker --version
        Write-Host "✅ Docker: $dockerVersion" -ForegroundColor Green
    } catch {
        Write-Warning "Docker not found. Use -SkipDocker to continue without Docker services."
        if (-not $Minimal) {
            $continue = Read-Host "Continue without Docker? (y/N)"
            if ($continue -ne 'y' -and $continue -ne 'Y') {
                exit 1
            }
            $SkipDocker = $true
        }
    }
}

# Check Git
try {
    $gitVersion = git --version
    Write-Host "✅ Git: $gitVersion" -ForegroundColor Green
} catch {
    Write-Error "Git not found. Please install Git."
}

Write-Host "`n📦 Installing Node.js dependencies..." -ForegroundColor Yellow

if (-not $SkipDependencies) {
    # Clean install
    if (Test-Path "node_modules") {
        Write-Host "🧹 Cleaning existing node_modules..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force node_modules
    }
    
    if (Test-Path "package-lock.json") {
        Write-Host "🧹 Cleaning package-lock.json..." -ForegroundColor Yellow
        Remove-Item -Force package-lock.json
    }
    
    npm ci
    Write-Host "✅ Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "⏭️ Skipping dependency installation" -ForegroundColor Yellow
}

# Setup Git hooks
Write-Host "`n🪝 Setting up Git hooks..." -ForegroundColor Yellow
try {
    npx husky install
    Write-Host "✅ Git hooks configured" -ForegroundColor Green
} catch {
    Write-Warning "Failed to setup Git hooks. Continuing..."
}

# Setup Docker services
if (-not $SkipDocker) {
    Write-Host "`n🐳 Starting Docker services..." -ForegroundColor Yellow
    try {
        # Start with minimal services first
        docker-compose up -d chromadb redis
        
        # Wait for services to be healthy
        Write-Host "⏳ Waiting for services to be ready..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        
        # Check service health
        $chromaHealthy = $false
        $redisHealthy = $false
        
        for ($i = 0; $i -lt 30; $i++) {
            try {
                $response = Invoke-RestMethod -Uri "http://localhost:8000/api/v1/heartbeat" -TimeoutSec 5
                $chromaHealthy = $true
                break
            } catch {
                Start-Sleep -Seconds 2
            }
        }
        
        try {
            $null = docker exec unified-pim-redis redis-cli ping
            $redisHealthy = $true
        } catch {
            Write-Warning "Redis health check failed"
        }
        
        if ($chromaHealthy -and $redisHealthy) {
            Write-Host "✅ Essential services are running" -ForegroundColor Green
        } else {
            Write-Warning "Some services may not be fully ready. Check with: docker-compose ps"
        }
        
        # Start additional services if not minimal
        if (-not $Minimal) {
            Write-Host "🐳 Starting additional development services..." -ForegroundColor Yellow
            docker-compose -f docker-compose.dev.yml up -d postgres mailhog mock-oauth
            Start-Sleep -Seconds 5
        }
        
    } catch {
        Write-Warning "Failed to start Docker services: $_"
        Write-Host "You can start them manually with: npm run docker:up" -ForegroundColor Yellow
    }
} else {
    Write-Host "⏭️ Skipping Docker services" -ForegroundColor Yellow
}

# Create environment files
Write-Host "`n⚙️ Setting up environment configuration..." -ForegroundColor Yellow

$envContent = @"
# Development Environment Configuration
NODE_ENV=development
LOG_LEVEL=debug

# Database Configuration
DATABASE_URL=postgresql://dev_user:dev_password@localhost:5432/unified_pim_dev

# Redis Configuration
REDIS_URL=redis://localhost:6379

# ChromaDB Configuration
CHROMADB_HOST=localhost
CHROMADB_PORT=8000
CHROMADB_URL=http://localhost:8000

# Mock OAuth Configuration (for development)
MOCK_OAUTH_ENABLED=true
MOCK_OAUTH_URL=http://localhost:1080

# Microsoft Graph Configuration (Development)
MICROSOFT_CLIENT_ID=your_dev_client_id
MICROSOFT_CLIENT_SECRET=your_dev_client_secret
MICROSOFT_TENANT_ID=your_dev_tenant_id
MICROSOFT_REDIRECT_URI=http://localhost:3000/auth/microsoft/callback

# Google APIs Configuration (Development)
GOOGLE_CLIENT_ID=your_dev_client_id
GOOGLE_CLIENT_SECRET=your_dev_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Apple Configuration (Development - Optional)
APPLE_TEAM_ID=your_dev_team_id
APPLE_CLIENT_ID=your_dev_client_id
APPLE_KEY_ID=your_dev_key_id
APPLE_PRIVATE_KEY_PATH=./config/apple-dev-key.p8

# Security
JWT_SECRET=your_dev_jwt_secret_key_here
ENCRYPTION_KEY=your_dev_encryption_key_32_chars_here

# Feature Flags
ACTIVE_PLATFORMS=microsoft,google
ENABLE_TRACING=true
ENABLE_METRICS=true
"@

if (-not (Test-Path ".env.development")) {
    $envContent | Out-File -FilePath ".env.development" -Encoding UTF8
    Write-Host "✅ Created .env.development" -ForegroundColor Green
} else {
    Write-Host "ℹ️ .env.development already exists" -ForegroundColor Blue
}

# Generate mock data
if (-not $SkipMocks) {
    Write-Host "`n🎭 Generating mock data..." -ForegroundColor Yellow
    try {
        & "$PSScriptRoot\generate-mock-data.ps1"
        Write-Host "✅ Mock data generated" -ForegroundColor Green
    } catch {
        Write-Warning "Failed to generate mock data: $_"
    }
} else {
    Write-Host "⏭️ Skipping mock data generation" -ForegroundColor Yellow
}

# Run initial validation
Write-Host "`n🔍 Running initial validation..." -ForegroundColor Yellow
try {
    npm run type-check
    Write-Host "✅ TypeScript compilation successful" -ForegroundColor Green
} catch {
    Write-Warning "TypeScript validation failed. You may need to fix compilation errors."
}

# Create helpful directories
Write-Host "`n📁 Creating development directories..." -ForegroundColor Yellow
$dirs = @("logs", "temp", "uploads", "backups")
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -Type Directory -Path $dir -Force | Out-Null
        Write-Host "✅ Created $dir directory" -ForegroundColor Green
    }
}

# Final instructions
Write-Host "`n🎉 Development Environment Setup Complete!" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Copy and customize .env.development with your actual API credentials" -ForegroundColor White
Write-Host "2. Run 'npm run dev' to start the development server" -ForegroundColor White
Write-Host "3. Open VS Code and install recommended extensions" -ForegroundColor White
Write-Host "4. Visit http://localhost:8000 to check ChromaDB" -ForegroundColor White
Write-Host "5. Visit http://localhost:8025 to check MailHog (if started)" -ForegroundColor White

Write-Host "`nUseful commands:" -ForegroundColor Cyan
Write-Host "npm run dev          - Start development server with hot reload" -ForegroundColor White
Write-Host "npm run test:watch   - Run tests in watch mode" -ForegroundColor White
Write-Host "npm run docker:up    - Start all Docker services" -ForegroundColor White
Write-Host "npm run docker:down  - Stop all Docker services" -ForegroundColor White
Write-Host "npm run validate     - Run type checking, linting, and tests" -ForegroundColor White

if ($SkipDocker -or $SkipDependencies -or $SkipMocks) {
    Write-Host "`nNote: Some setup steps were skipped. Run this script again without flags for complete setup." -ForegroundColor Yellow
}