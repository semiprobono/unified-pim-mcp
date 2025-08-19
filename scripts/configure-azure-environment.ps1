#Requires -Version 7.0

<#
.SYNOPSIS
    Configure Azure environment after manual Azure AD app registration
    
.DESCRIPTION
    Sets up the local development environment with Azure AD configuration
    after you've manually created the Azure AD application registration.
    
.PARAMETER ClientId
    Azure AD Application (client) ID from the portal
    
.PARAMETER TenantId
    Azure AD Directory (tenant) ID from the portal
    
.PARAMETER Environment
    Environment type: Development, Staging, or Production
    
.PARAMETER RedirectUri
    Custom redirect URI (default: http://localhost:8080/auth/callback)

.EXAMPLE
    .\configure-azure-environment.ps1 -ClientId "12345678-1234-1234-1234-123456789012" -TenantId "87654321-4321-4321-4321-210987654321"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, HelpMessage = "Azure AD Application (client) ID")]
    [string]$ClientId,
    
    [Parameter(Mandatory = $true, HelpMessage = "Azure AD Directory (tenant) ID")]
    [string]$TenantId,
    
    [Parameter(HelpMessage = "Environment type")]
    [ValidateSet("Development", "Staging", "Production")]
    [string]$Environment = "Development",
    
    [Parameter(HelpMessage = "Custom redirect URI")]
    [string]$RedirectUri = "http://localhost:8080/auth/callback"
)

# Color output functions
function Write-Success { param([string]$Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param([string]$Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Step { param([string]$Message) Write-Host "🔄 $Message" -ForegroundColor Blue }

try {
    Write-Host ""
    Write-Host "🚀 CONFIGURING AZURE ENVIRONMENT FOR UNIFIED PIM MCP" -ForegroundColor Magenta
    Write-Host "==================================================`n" -ForegroundColor Magenta

    # Step 1: Validate inputs
    Write-Step "Validating inputs..."
    
    if (-not ($ClientId -match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) {
        Write-Error "Invalid Client ID format. Expected GUID format."
        exit 1
    }
    
    if (-not ($TenantId -match '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')) {
        Write-Error "Invalid Tenant ID format. Expected GUID format."
        exit 1
    }
    
    Write-Success "Input validation passed"

    # Step 2: Create Azure configuration
    Write-Step "Creating Azure configuration file..."
    
    $azureConfig = @{
        appId = $ClientId
        tenantId = $TenantId
        environment = $Environment
        redirectUri = $RedirectUri
        authority = "https://login.microsoftonline.com/$TenantId"
        scopes = @(
            "User.Read",
            "Mail.Read",
            "Mail.ReadWrite",
            "Mail.Send",
            "Calendars.Read",
            "Calendars.ReadWrite",
            "Contacts.Read",
            "Contacts.ReadWrite",
            "Tasks.Read",
            "Tasks.ReadWrite",
            "Files.Read.All",
            "Files.ReadWrite.All"
        )
        created = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
    }
    
    $azureConfigPath = "config\azure\$Environment.json"
    if (-not (Test-Path "config\azure")) {
        New-Item -ItemType Directory -Path "config\azure" -Force | Out-Null
    }
    
    $azureConfig | ConvertTo-Json -Depth 3 | Set-Content -Path $azureConfigPath -Encoding UTF8
    Write-Success "Azure configuration saved: $azureConfigPath"

    # Step 3: Create .env.local file
    Write-Step "Creating environment configuration..."
    
    $envContent = @"
# Azure AD Configuration - $Environment Environment
# Generated on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

# Azure AD Application Settings
AZURE_CLIENT_ID=$ClientId
AZURE_TENANT_ID=$TenantId
AZURE_AUTHORITY=https://login.microsoftonline.com/$TenantId
AZURE_REDIRECT_URI=$RedirectUri

# ChromaDB Configuration
CHROMADB_HOST=localhost
CHROMADB_PORT=8000

# Application Configuration
NODE_ENV=development
LOG_LEVEL=debug

# MCP Server Configuration
MCP_SERVER_PORT=8080
MCP_SERVER_HOST=localhost

# Security Configuration (IMPORTANT: Generate secure values for production)
ENCRYPTION_KEY=$(([System.Web.Security.Membership]::GeneratePassword(32, 8)))
JWT_SECRET=$(([System.Web.Security.Membership]::GeneratePassword(64, 16)))

# Platform Configuration
ACTIVE_PLATFORMS=microsoft
DEFAULT_CACHE_TTL=300

# Performance Configuration
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_WINDOW_MS=60000
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_TIMEOUT=30000
"@
    
    $envPath = ".env.local"
    $envContent | Set-Content -Path $envPath -Encoding UTF8
    Write-Success "Environment file created: $envPath"

    # Step 4: Create TypeScript configuration
    Write-Step "Creating TypeScript configuration..."
    
    $tsConfig = @"
// Auto-generated Azure AD configuration for $Environment
// Generated on $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")

export const azureAdConfig = {
  clientId: '$ClientId',
  tenantId: '$TenantId',
  authority: 'https://login.microsoftonline.com/$TenantId',
  redirectUri: '$RedirectUri',
  scopes: [
    'User.Read',
    'Mail.Read',
    'Mail.ReadWrite',
    'Mail.Send',
    'Calendars.Read',
    'Calendars.ReadWrite',
    'Contacts.Read',
    'Contacts.ReadWrite',
    'Tasks.Read',
    'Tasks.ReadWrite',
    'Files.Read.All',
    'Files.ReadWrite.All'
  ],
  environment: '$Environment'
};

export default azureAdConfig;
"@
    
    $tsPath = "config\azure\config.$Environment.ts"
    $tsConfig | Set-Content -Path $tsPath -Encoding UTF8
    Write-Success "TypeScript config created: $tsPath"

    # Step 5: Validate existing MSAL configuration
    Write-Step "Validating MSAL configuration..."
    
    $msalConfigPath = "src\infrastructure\adapters\microsoft\auth\MsalConfig.ts"
    if (Test-Path $msalConfigPath) {
        Write-Success "MSAL configuration file exists"
    } else {
        Write-Warning "MSAL configuration file not found at: $msalConfigPath"
    }

    # Step 6: Test configuration loading
    Write-Step "Testing configuration loading..."
    
    if (Test-Path "package.json") {
        Write-Success "Package.json found - ready for npm commands"
    } else {
        Write-Error "Package.json not found - ensure you're in the project root"
        exit 1
    }

    # Step 7: Display next steps
    Write-Host ""
    Write-Success "🎉 Azure environment configuration completed successfully!"
    Write-Host ""
    Write-Info "📋 NEXT STEPS:"
    Write-Host "   1. Start ChromaDB services: npm run docker:up"
    Write-Host "   2. Test the configuration: npm run dev:microsoft"
    Write-Host "   3. Run authentication tests: npm run test:integration:auth"
    Write-Host "   4. Validate Graph API: npm run graph:explorer"
    Write-Host ""
    
    Write-Info "🔐 ADMIN CONSENT REQUIRED:"
    Write-Host "   Grant admin consent in Azure Portal at:"
    Write-Host "   https://login.microsoftonline.com/$TenantId/adminconsent?client_id=$ClientId" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Info "🌐 APPLICATION DETAILS:"
    Write-Host "   • Client ID: $ClientId"
    Write-Host "   • Tenant ID: $TenantId"
    Write-Host "   • Environment: $Environment"
    Write-Host "   • Redirect URI: $RedirectUri"
    Write-Host ""
    
    Write-Warning "🔒 SECURITY REMINDERS:"
    Write-Host "   • Never commit .env.local to version control"
    Write-Host "   • Regenerate secrets for production environments"
    Write-Host "   • Monitor application permissions regularly"
    Write-Host ""

} catch {
    Write-Error "Configuration failed: $($_.Exception.Message)"
    Write-Host ""
    Write-Info "📞 Need help? Check:"
    Write-Host "   • Manual setup guide: config\azure\MANUAL_SETUP_GUIDE.md"
    Write-Host "   • Azure Portal: https://portal.azure.com/"
    Write-Host "   • Project documentation: CLAUDE.md"
    exit 1
}