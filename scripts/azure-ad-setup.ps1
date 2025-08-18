#Requires -Version 7.0
#Requires -Modules Microsoft.Graph

<#
.SYNOPSIS
    Automated Azure AD Application Registration for Unified PIM MCP
    
.DESCRIPTION
    Creates and configures Azure AD app registration with proper Graph API permissions
    for production-ready Microsoft Graph integration. Includes security best practices
    and comprehensive error handling.
    
.PARAMETER AppName
    Name for the Azure AD application (default: "Unified PIM MCP")
    
.PARAMETER Environment
    Environment type: Development, Staging, or Production
    
.PARAMETER RedirectUri
    Custom redirect URI (default: http://localhost:8080/auth/callback)
    
.PARAMETER TenantId
    Azure tenant ID (will prompt if not provided)
    
.PARAMETER OutputPath
    Path to save configuration files (default: ./config/azure)

.EXAMPLE
    .\azure-ad-setup.ps1 -Environment Development
    
.EXAMPLE
    .\azure-ad-setup.ps1 -AppName "My PIM App" -Environment Production -TenantId "your-tenant-id"
#>

[CmdletBinding()]
param(
    [Parameter(HelpMessage = "Name for the Azure AD application")]
    [string]$AppName = "Unified PIM MCP",
    
    [Parameter(Mandatory = $true, HelpMessage = "Environment type")]
    [ValidateSet("Development", "Staging", "Production")]
    [string]$Environment,
    
    [Parameter(HelpMessage = "Custom redirect URI")]
    [string]$RedirectUri = "http://localhost:8080/auth/callback",
    
    [Parameter(HelpMessage = "Azure tenant ID")]
    [string]$TenantId,
    
    [Parameter(HelpMessage = "Path to save configuration files")]
    [string]$OutputPath = "./config/azure"
)

# Color output functions
function Write-Success { param([string]$Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param([string]$Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Step { param([string]$Message) Write-Host "🔄 $Message" -ForegroundColor Blue }

# Main execution
try {
    Write-Host ""
    Write-Host "🚀 AZURE AD SETUP FOR UNIFIED PIM MCP" -ForegroundColor Magenta
    Write-Host "=====================================`n" -ForegroundColor Magenta

    # Step 1: Validate prerequisites
    Write-Step "Validating prerequisites..."
    
    if (-not (Get-Module -ListAvailable -Name Microsoft.Graph)) {
        Write-Error "Microsoft.Graph PowerShell module is required but not installed."
        Write-Info "Install it with: Install-Module Microsoft.Graph -Scope CurrentUser"
        exit 1
    }

    # Step 2: Connect to Microsoft Graph
    Write-Step "Connecting to Microsoft Graph..."
    
    if ($TenantId) {
        Connect-MgGraph -TenantId $TenantId -Scopes "Application.ReadWrite.All", "Directory.Read.All"
    } else {
        Connect-MgGraph -Scopes "Application.ReadWrite.All", "Directory.Read.All"
    }
    
    $context = Get-MgContext
    if (-not $context) {
        Write-Error "Failed to connect to Microsoft Graph"
        exit 1
    }
    
    Write-Success "Connected to tenant: $($context.TenantId)"

    # Step 3: Create the application
    Write-Step "Creating Azure AD application registration..."
    
    $fullAppName = "$AppName ($Environment)"
    
    # Configure redirect URIs based on environment
    $redirectUris = @($RedirectUri)
    if ($Environment -eq "Development") {
        $redirectUris += @(
            "http://localhost:3000/auth/callback",
            "http://localhost:8080/auth/callback",
            "http://127.0.0.1:8080/auth/callback"
        )
    }
    
    # Application configuration
    $appParams = @{
        DisplayName = $fullAppName
        Description = "Unified Personal Information Management MCP Server with Microsoft Graph integration"
        SignInAudience = "AzureADMyOrg"  # Single tenant
        Web = @{
            RedirectUris = $redirectUris
            ImplicitGrantSettings = @{
                EnableIdTokenIssuance = $true
                EnableAccessTokenIssuance = $false  # Use authorization code flow
            }
        }
        PublicClient = @{
            RedirectUris = @(
                "msal{client-id}://auth",
                "http://localhost"
            )
        }
        RequiredResourceAccess = @(
            @{
                ResourceAppId = "00000003-0000-0000-c000-000000000000"  # Microsoft Graph
                ResourceAccess = @(
                    # Delegated permissions
                    @{ Id = "e1fe6dd8-ba31-4d61-89e7-88639da4683d"; Type = "Scope" },  # User.Read
                    @{ Id = "64a6cdd6-aab1-4aaf-94b8-3cc8405e90d0"; Type = "Scope" },  # Email
                    @{ Id = "570282fd-fa5c-430d-a7fd-fc8dc98a9dca"; Type = "Scope" },  # Mail.Read
                    @{ Id = "024d486e-b451-40bb-833d-3e66d98c5c73"; Type = "Scope" },  # Mail.ReadWrite
                    @{ Id = "e383f46e-2787-4529-855e-0e479a3ffac0"; Type = "Scope" },  # Mail.Send
                    @{ Id = "465a38f9-76ea-45b9-9f34-9e8b0d4b0b42"; Type = "Scope" },  # Calendars.Read
                    @{ Id = "1ec239c2-d7c9-4623-a91a-a9775856bb36"; Type = "Scope" },  # Calendars.ReadWrite
                    @{ Id = "ff74d97f-43af-4b68-9f2a-b77ee6968c5d"; Type = "Scope" },  # Contacts.Read
                    @{ Id = "d56682ec-c09e-4743-aaf4-1a3aac4caa21"; Type = "Scope" },  # Contacts.ReadWrite
                    @{ Id = "f6a3db3e-f7e8-4ed2-a414-557c8c9830be"; Type = "Scope" },  # Tasks.Read
                    @{ Id = "2219042f-cab5-40cc-b0d2-16b1540b4c5f"; Type = "Scope" },  # Tasks.ReadWrite
                    @{ Id = "df021288-bdef-4463-88db-98f22de89214"; Type = "Scope" },  # Files.Read.All
                    @{ Id = "5c28f0bf-8a70-41f1-8ab2-9032436ddb65"; Type = "Scope" }   # Files.ReadWrite.All
                )
            }
        )
        Tags = @("PIM", "MCP", "EmailIntegration", $Environment)
    }
    
    $app = New-MgApplication @appParams
    Write-Success "Created application: $($app.DisplayName)"
    Write-Info "Application ID: $($app.AppId)"
    Write-Info "Object ID: $($app.Id)"

    # Step 4: Create service principal
    Write-Step "Creating service principal..."
    
    $servicePrincipal = New-MgServicePrincipal -AppId $app.AppId -Tags @("WindowsAzureActiveDirectoryIntegratedApp")
    Write-Success "Created service principal"

    # Step 5: Generate client secret (for confidential clients)
    $clientSecret = $null
    if ($Environment -ne "Development") {
        Write-Step "Generating client secret..."
        
        $secretName = "$Environment-Secret-$(Get-Date -Format 'yyyyMMdd')"
        $secretParams = @{
            ApplicationId = $app.Id
            PasswordCredential = @{
                DisplayName = $secretName
                EndDateTime = (Get-Date).AddYears(1)  # 1 year expiry
            }
        }
        
        $secret = Add-MgApplicationPassword @secretParams
        $clientSecret = $secret.SecretText
        Write-Success "Generated client secret (expires: $($secret.EndDateTime))"
        Write-Warning "⚠️  SAVE THIS SECRET NOW - IT WON'T BE SHOWN AGAIN!"
    }

    # Step 6: Create configuration files
    Write-Step "Creating configuration files..."
    
    if (-not (Test-Path $OutputPath)) {
        New-Item -ItemType Directory -Path $OutputPath -Force | Out-Null
    }
    
    # Environment-specific configuration
    $config = @{
        appId = $app.AppId
        tenantId = $context.TenantId
        environment = $Environment
        redirectUri = $RedirectUri
        authority = "https://login.microsoftonline.com/$($context.TenantId)"
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
        created = Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"
    }
    
    if ($clientSecret) {
        $config.clientSecret = $clientSecret
    }
    
    # Save configuration as JSON
    $configPath = Join-Path $OutputPath "$Environment.json"
    $config | ConvertTo-Json -Depth 3 | Set-Content -Path $configPath -Encoding UTF8
    Write-Success "Configuration saved to: $configPath"
    
    # Create .env file template
    $envContent = @"
# Azure AD Configuration for $Environment
AZURE_CLIENT_ID=$($app.AppId)
AZURE_TENANT_ID=$($context.TenantId)
AZURE_AUTHORITY=https://login.microsoftonline.com/$($context.TenantId)
AZURE_REDIRECT_URI=$RedirectUri
"@
    
    if ($clientSecret) {
        $envContent += "`nAZURE_CLIENT_SECRET=$clientSecret"
    }
    
    $envPath = Join-Path $OutputPath ".env.$Environment"
    $envContent | Set-Content -Path $envPath -Encoding UTF8
    Write-Success "Environment file created: $envPath"
    
    # Create TypeScript configuration
    $tsConfig = @"
// Auto-generated Azure AD configuration for $Environment
export const azureAdConfig = {
  clientId: '$($app.AppId)',
  tenantId: '$($context.TenantId)',
  authority: 'https://login.microsoftonline.com/$($context.TenantId)',
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
"@
    
    $tsPath = Join-Path $OutputPath "config.$Environment.ts"
    $tsConfig | Set-Content -Path $tsPath -Encoding UTF8
    Write-Success "TypeScript config created: $tsPath"

    # Step 7: Display next steps
    Write-Host ""
    Write-Success "🎉 Azure AD setup completed successfully!"
    Write-Host ""
    Write-Info "📋 NEXT STEPS:"
    Write-Host "   1. Copy the configuration files to your project"
    Write-Host "   2. Update your .env file with the generated values"
    Write-Host "   3. Grant admin consent for the application permissions"
    Write-Host "   4. Test the authentication flow"
    Write-Host ""
    
    if ($clientSecret) {
        Write-Warning "🔐 SECURITY REMINDER:"
        Write-Host "   • Store the client secret securely (Key Vault recommended)"
        Write-Host "   • Set up secret rotation before expiry"
        Write-Host "   • Never commit secrets to version control"
        Write-Host ""
    }
    
    Write-Info "🌐 Admin Consent URL:"
    Write-Host "   https://login.microsoftonline.com/$($context.TenantId)/adminconsent?client_id=$($app.AppId)" -ForegroundColor Cyan
    Write-Host ""
    
    Write-Info "🏗️  Application Details:"
    Write-Host "   • Name: $($app.DisplayName)"
    Write-Host "   • App ID: $($app.AppId)"
    Write-Host "   • Tenant: $($context.TenantId)"
    Write-Host "   • Environment: $Environment"
    Write-Host ""
    
    # Return configuration object for potential automation
    return $config

} catch {
    Write-Error "Setup failed: $($_.Exception.Message)"
    Write-Host ""
    Write-Info "📞 Need help? Check:"
    Write-Host "   • Azure AD portal: https://portal.azure.com/"
    Write-Host "   • Microsoft Graph permissions: https://docs.microsoft.com/en-us/graph/permissions-reference"
    Write-Host "   • MSAL.js documentation: https://docs.microsoft.com/en-us/azure/active-directory/develop/msal-overview"
    exit 1
} finally {
    # Cleanup
    try {
        Disconnect-MgGraph -ErrorAction SilentlyContinue
    } catch {
        # Ignore disconnect errors
    }
}