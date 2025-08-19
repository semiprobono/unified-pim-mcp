#Requires -Version 7.0

<#
.SYNOPSIS
    Validate Azure AD setup and environment configuration for Unified PIM MCP
    
.DESCRIPTION
    Comprehensive validation script that checks Azure AD configuration,
    environment variables, dependencies, and connectivity to ensure
    the system is ready for Microsoft Graph integration.
    
.PARAMETER Environment
    Environment to validate: Development, Staging, or Production
    
.PARAMETER TestConnectivity
    Test actual connectivity to Microsoft Graph APIs
    
.PARAMETER Verbose
    Show detailed validation information

.EXAMPLE
    .\validate-azure-setup.ps1 -Environment Development
    
.EXAMPLE
    .\validate-azure-setup.ps1 -Environment Development -TestConnectivity -VerboseOutput
#>

[CmdletBinding()]
param(
    [Parameter(HelpMessage = "Environment to validate")]
    [ValidateSet("Development", "Staging", "Production")]
    [string]$Environment = "Development",
    
    [Parameter(HelpMessage = "Test actual connectivity to Microsoft Graph")]
    [switch]$TestConnectivity,
    
    [Parameter(HelpMessage = "Show detailed validation information")]
    [switch]$VerboseOutput
)

# Color output functions
function Write-Success { param([string]$Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param([string]$Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Step { param([string]$Message) Write-Host "🔄 $Message" -ForegroundColor Blue }

$script:validationErrors = @()
$script:validationWarnings = @()

function Add-ValidationError {
    param([string]$Message)
    $script:validationErrors += $Message
    Write-Error $Message
}

function Add-ValidationWarning {
    param([string]$Message)
    $script:validationWarnings += $Message
    Write-Warning $Message
}

function Test-FileExists {
    param([string]$Path, [string]$Description)
    
    if (Test-Path $Path) {
        Write-Success "$Description exists: $Path"
        return $true
    } else {
        Add-ValidationError "$Description missing: $Path"
        return $false
    }
}

function Test-EnvironmentVariable {
    param([string]$Name, [string]$Description, [bool]$Required = $true)
    
    $value = [System.Environment]::GetEnvironmentVariable($Name)
    if (-not $value -and (Test-Path ".env.local")) {
        # Try to read from .env.local
        $envContent = Get-Content ".env.local" | Where-Object { $_ -match "^$Name=" }
        if ($envContent) {
            $value = ($envContent -split "=", 2)[1]
        }
    }
    
    if ($value) {
        Write-Success "$Description configured"
        if ($VerboseOutput) {
            Write-Info "  $Name = $($value.Substring(0, [Math]::Min($value.Length, 20)))..."
        }
        return $true
    } else {
        if ($Required) {
            Add-ValidationError "$Description not configured: $Name"
        } else {
            Add-ValidationWarning "$Description not configured (optional): $Name"
        }
        return $false
    }
}

try {
    Write-Host ""
    Write-Host "🔍 VALIDATING AZURE AD SETUP FOR UNIFIED PIM MCP" -ForegroundColor Magenta
    Write-Host "===============================================`n" -ForegroundColor Magenta
    Write-Info "Environment: $Environment"
    Write-Host ""

    # Step 1: Validate project structure
    Write-Step "Validating project structure..."
    
    $requiredFiles = @{
        "package.json" = "Package.json"
        "tsconfig.json" = "TypeScript configuration"
        "src\index.ts" = "Main application entry point"
        "src\infrastructure\adapters\microsoft\auth\MsalConfig.ts" = "MSAL configuration"
        "src\infrastructure\adapters\microsoft\auth\MsalAuthProvider.ts" = "MSAL auth provider"
        "src\infrastructure\adapters\microsoft\clients\GraphClient.ts" = "Graph client"
    }
    
    $structureValid = $true
    foreach ($file in $requiredFiles.GetEnumerator()) {
        if (-not (Test-FileExists $file.Key $file.Value)) {
            $structureValid = $false
        }
    }

    # Step 2: Validate Azure configuration files
    Write-Step "Validating Azure configuration files..."
    
    $azureConfigPath = "config\azure\$Environment.json"
    if (Test-FileExists $azureConfigPath "Azure configuration") {
        try {
            $azureConfig = Get-Content $azureConfigPath | ConvertFrom-Json
            
            $requiredProps = @("appId", "tenantId", "authority", "redirectUri", "scopes")
            foreach ($prop in $requiredProps) {
                if ($azureConfig.$prop) {
                    Write-Success "Azure config has $prop"
                } else {
                    Add-ValidationError "Azure config missing property: $prop"
                }
            }
            
            # Validate GUID formats
            if ($azureConfig.appId -match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') {
                Write-Success "Valid Client ID format"
            } else {
                Add-ValidationError "Invalid Client ID format in Azure config"
            }
            
            if ($azureConfig.tenantId -match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') {
                Write-Success "Valid Tenant ID format"
            } else {
                Add-ValidationError "Invalid Tenant ID format in Azure config"
            }
            
        } catch {
            Add-ValidationError "Failed to parse Azure configuration: $($_.Exception.Message)"
        }
    }

    # Step 3: Validate environment variables
    Write-Step "Validating environment variables..."
    
    Test-EnvironmentVariable "AZURE_CLIENT_ID" "Azure Client ID"
    Test-EnvironmentVariable "AZURE_TENANT_ID" "Azure Tenant ID"
    Test-EnvironmentVariable "AZURE_AUTHORITY" "Azure Authority"
    Test-EnvironmentVariable "AZURE_REDIRECT_URI" "Azure Redirect URI"
    Test-EnvironmentVariable "CHROMADB_HOST" "ChromaDB Host"
    Test-EnvironmentVariable "CHROMADB_PORT" "ChromaDB Port"
    Test-EnvironmentVariable "NODE_ENV" "Node Environment"
    Test-EnvironmentVariable "AZURE_CLIENT_SECRET" "Azure Client Secret" $false

    # Step 4: Validate dependencies
    Write-Step "Validating dependencies..."
    
    if (Test-Path "node_modules") {
        Write-Success "Node modules installed"
        
        # Check critical dependencies
        $criticalDeps = @(
            "@azure/msal-node",
            "@modelcontextprotocol/sdk",
            "axios",
            "chromadb",
            "dotenv"
        )
        
        foreach ($dep in $criticalDeps) {
            if (Test-Path "node_modules\$dep") {
                Write-Success "Dependency installed: $dep"
            } else {
                Add-ValidationError "Missing dependency: $dep"
            }
        }
    } else {
        Add-ValidationError "Node modules not installed. Run: npm install"
    }

    # Step 5: Validate Docker services (if needed)
    Write-Step "Validating Docker services..."
    
    try {
        $dockerCompose = docker-compose -f docker-compose.dev.yml ps 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Docker Compose available"
            
            if ($dockerCompose -match "chromadb.*Up") {
                Write-Success "ChromaDB service running"
            } else {
                Add-ValidationWarning "ChromaDB service not running. Start with: npm run docker:up"
            }
        } else {
            Add-ValidationWarning "Docker Compose not available or not configured"
        }
    } catch {
        Add-ValidationWarning "Docker validation failed: $($_.Exception.Message)"
    }

    # Step 6: Test configuration loading (if possible)
    Write-Step "Testing configuration loading..."
    
    try {
        if (Test-Path ".env.local") {
            Write-Success "Environment file exists"
            
            # Basic syntax check
            $envContent = Get-Content ".env.local"
            $invalidLines = $envContent | Where-Object { $_ -and $_ -notmatch '^\s*#' -and $_ -notmatch '^\s*\w+\s*=' }
            
            if ($invalidLines) {
                Add-ValidationWarning "Potentially invalid lines in .env.local: $($invalidLines.Count)"
            } else {
                Write-Success "Environment file syntax appears valid"
            }
        } else {
            Add-ValidationError "Environment file missing: .env.local"
        }
    } catch {
        Add-ValidationError "Failed to validate environment file: $($_.Exception.Message)"
    }

    # Step 7: Connectivity tests (if requested)
    if ($TestConnectivity) {
        Write-Step "Testing connectivity..."
        
        # Test ChromaDB connectivity
        try {
            $chromaHost = [System.Environment]::GetEnvironmentVariable("CHROMADB_HOST") ?? "localhost"
            $chromaPort = [System.Environment]::GetEnvironmentVariable("CHROMADB_PORT") ?? "8000"
            
            $response = Invoke-WebRequest -Uri "http://${chromaHost}:${chromaPort}/api/v1/heartbeat" -TimeoutSec 5 -ErrorAction Stop
            Write-Success "ChromaDB connectivity verified"
        } catch {
            Add-ValidationWarning "ChromaDB connectivity test failed: $($_.Exception.Message)"
        }
        
        # Test Azure AD well-known endpoint
        try {
            $tenantId = [System.Environment]::GetEnvironmentVariable("AZURE_TENANT_ID")
            if ($tenantId) {
                $wellKnownUrl = "https://login.microsoftonline.com/$tenantId/v2.0/.well-known/openid_configuration"
                $response = Invoke-WebRequest -Uri $wellKnownUrl -TimeoutSec 10 -ErrorAction Stop
                Write-Success "Azure AD tenant connectivity verified"
            } else {
                Add-ValidationWarning "Cannot test Azure AD connectivity - AZURE_TENANT_ID not configured"
            }
        } catch {
            Add-ValidationError "Azure AD connectivity test failed: $($_.Exception.Message)"
        }
    }

    # Step 8: Display results
    Write-Host ""
    Write-Host "📊 VALIDATION RESULTS" -ForegroundColor Magenta
    Write-Host "====================" -ForegroundColor Magenta
    
    if ($script:validationErrors.Count -eq 0) {
        Write-Success "🎉 All validations passed!"
        Write-Host ""
        Write-Info "✨ READY TO GO! Next steps:"
        Write-Host "   1. Start services: npm run docker:up"
        Write-Host "   2. Run development server: npm run dev:microsoft"
        Write-Host "   3. Test authentication: npm run test:integration:auth"
        Write-Host ""
    } else {
        Write-Error "❌ Validation failed with $($script:validationErrors.Count) error(s)"
        Write-Host ""
        Write-Info "🔧 ISSUES TO FIX:"
        foreach ($error in $script:validationErrors) {
            Write-Host "   • $error" -ForegroundColor Red
        }
        Write-Host ""
    }
    
    if ($script:validationWarnings.Count -gt 0) {
        Write-Warning "⚠️  $($script:validationWarnings.Count) warning(s) detected"
        Write-Host ""
        Write-Info "⚡ OPTIONAL IMPROVEMENTS:"
        foreach ($warning in $script:validationWarnings) {
            Write-Host "   • $warning" -ForegroundColor Yellow
        }
        Write-Host ""
    }
    
    Write-Info "📚 HELPFUL RESOURCES:"
    Write-Host "   • Manual setup guide: config\azure\MANUAL_SETUP_GUIDE.md"
    Write-Host "   • Azure Portal: https://portal.azure.com/"
    Write-Host "   • Project docs: CLAUDE.md"
    Write-Host ""
    
    # Return appropriate exit code
    if ($script:validationErrors.Count -gt 0) {
        exit 1
    } else {
        exit 0
    }

} catch {
    Write-Error "Validation script failed: $($_.Exception.Message)"
    Write-Host ""
    Write-Info "📞 Need help? Check the manual setup guide or project documentation."
    exit 1
}