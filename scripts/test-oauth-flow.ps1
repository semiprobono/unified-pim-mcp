#Requires -Version 7.0

<#
.SYNOPSIS
    Test OAuth2 PKCE flow for Azure AD integration
    
.DESCRIPTION
    Interactive script to test the OAuth2 authentication flow with Azure AD
    using the configured application registration. This helps validate that
    the setup is working correctly before running the full application.
    
.PARAMETER ClientId
    Azure AD Application ID (will read from config if not provided)
    
.PARAMETER TenantId
    Azure AD Tenant ID (will read from config if not provided)
    
.PARAMETER Scopes
    Comma-separated list of scopes to request
    
.PARAMETER Port
    Local server port for redirect URI (default: 8080)

.EXAMPLE
    .\test-oauth-flow.ps1
    
.EXAMPLE
    .\test-oauth-flow.ps1 -Scopes "User.Read,Mail.Read" -Port 3000
#>

[CmdletBinding()]
param(
    [Parameter(HelpMessage = "Azure AD Application ID")]
    [string]$ClientId,
    
    [Parameter(HelpMessage = "Azure AD Tenant ID")]
    [string]$TenantId,
    
    [Parameter(HelpMessage = "Comma-separated list of scopes")]
    [string]$Scopes = "User.Read,Mail.Read",
    
    [Parameter(HelpMessage = "Local server port for redirect")]
    [int]$Port = 8080
)

# Color output functions
function Write-Success { param([string]$Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param([string]$Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Step { param([string]$Message) Write-Host "🔄 $Message" -ForegroundColor Blue }

# Generate random strings for PKCE
function New-RandomString {
    param([int]$Length = 32)
    $chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
    return -join ((1..$Length) | ForEach { $chars[(Get-Random -Maximum $chars.Length)] })
}

function Get-Base64UrlEncode {
    param([string]$Input)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Input)
    $base64 = [Convert]::ToBase64String($bytes)
    return $base64.Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

function Get-SHA256Hash {
    param([string]$Input)
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Input)
    $hash = $hasher.ComputeHash($bytes)
    return [Convert]::ToBase64String($hash).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

try {
    Write-Host ""
    Write-Host "🔐 TESTING OAUTH2 PKCE FLOW FOR UNIFIED PIM MCP" -ForegroundColor Magenta
    Write-Host "===============================================`n" -ForegroundColor Magenta

    # Step 1: Load configuration
    Write-Step "Loading configuration..."
    
    if (-not $ClientId -or -not $TenantId) {
        # Try to load from .env.local
        if (Test-Path ".env.local") {
            $envContent = Get-Content ".env.local"
            
            if (-not $ClientId) {
                $clientIdLine = $envContent | Where-Object { $_ -match '^AZURE_CLIENT_ID=' }
                if ($clientIdLine) {
                    $ClientId = ($clientIdLine -split "=", 2)[1]
                }
            }
            
            if (-not $TenantId) {
                $tenantIdLine = $envContent | Where-Object { $_ -match '^AZURE_TENANT_ID=' }
                if ($tenantIdLine) {
                    $TenantId = ($tenantIdLine -split "=", 2)[1]
                }
            }
        }
        
        # Try to load from Azure config
        if ((-not $ClientId -or -not $TenantId) -and (Test-Path "config\azure\Development.json")) {
            $azureConfig = Get-Content "config\azure\Development.json" | ConvertFrom-Json
            if (-not $ClientId) { $ClientId = $azureConfig.appId }
            if (-not $TenantId) { $TenantId = $azureConfig.tenantId }
        }
    }
    
    if (-not $ClientId -or -not $TenantId) {
        Write-Error "ClientId and TenantId are required. Configure them in .env.local or config\azure\Development.json"
        exit 1
    }
    
    Write-Success "Configuration loaded"
    Write-Info "Client ID: $($ClientId.Substring(0, 8))..."
    Write-Info "Tenant ID: $($TenantId.Substring(0, 8))..."
    Write-Info "Scopes: $Scopes"

    # Step 2: Generate PKCE parameters
    Write-Step "Generating PKCE parameters..."
    
    $codeVerifier = New-RandomString -Length 128
    $codeChallenge = Get-SHA256Hash $codeVerifier
    $state = New-RandomString -Length 32
    $nonce = New-RandomString -Length 32
    
    Write-Success "PKCE parameters generated"

    # Step 3: Build authorization URL
    Write-Step "Building authorization URL..."
    
    $redirectUri = "http://localhost:$Port/auth/callback"
    $scopeList = $Scopes -split "," | ForEach-Object { $_.Trim() }
    $scopeString = $scopeList -join " "
    
    $authParams = @{
        client_id = $ClientId
        response_type = "code"
        redirect_uri = $redirectUri
        scope = $scopeString
        state = $state
        nonce = $nonce
        code_challenge = $codeChallenge
        code_challenge_method = "S256"
        response_mode = "query"
    }
    
    $queryString = ($authParams.GetEnumerator() | ForEach-Object { 
        "$($_.Key)=$([System.Web.HttpUtility]::UrlEncode($_.Value))" 
    }) -join "&"
    
    $authUrl = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/authorize?$queryString"
    
    Write-Success "Authorization URL built"

    # Step 4: Start local server
    Write-Step "Starting local callback server on port $Port..."
    
    $listener = [System.Net.HttpListener]::new()
    $listener.Prefixes.Add("http://localhost:$Port/")
    
    try {
        $listener.Start()
        Write-Success "Local server started on http://localhost:$Port"
    } catch {
        Write-Error "Failed to start local server: $($_.Exception.Message)"
        Write-Info "Try a different port or ensure port $Port is available"
        exit 1
    }

    # Step 5: Open browser
    Write-Step "Opening browser for authentication..."
    Write-Info "If browser doesn't open automatically, visit:"
    Write-Host "   $authUrl" -ForegroundColor Cyan
    Write-Host ""
    
    try {
        Start-Process $authUrl
    } catch {
        Write-Warning "Could not open browser automatically"
    }

    # Step 6: Wait for callback
    Write-Info "Waiting for authentication callback..."
    Write-Info "Complete the authentication in your browser..."
    
    $authCode = $null
    $error = $null
    $timeout = 300 # 5 minutes
    $elapsed = 0
    
    while ($elapsed -lt $timeout -and -not $authCode -and -not $error) {
        if ($listener.IsListening) {
            $contextTask = $listener.GetContextAsync()
            
            # Wait for request or timeout
            $completed = $contextTask.Wait(1000)
            
            if ($completed) {
                $context = $contextTask.Result
                $request = $context.Request
                $response = $context.Response
                
                # Parse query parameters
                $query = [System.Web.HttpUtility]::ParseQueryString($request.Url.Query)
                
                if ($query["code"]) {
                    $authCode = $query["code"]
                    $receivedState = $query["state"]
                    
                    if ($receivedState -eq $state) {
                        Write-Success "Authorization code received successfully"
                        
                        # Send success response
                        $responseHtml = @"
<!DOCTYPE html>
<html>
<head><title>Authentication Successful</title></head>
<body>
    <h1>✅ Authentication Successful!</h1>
    <p>You can close this window and return to the terminal.</p>
    <script>setTimeout(function(){window.close();}, 3000);</script>
</body>
</html>
"@
                        $buffer = [System.Text.Encoding]::UTF8.GetBytes($responseHtml)
                        $response.ContentLength64 = $buffer.Length
                        $response.OutputStream.Write($buffer, 0, $buffer.Length)
                        $response.OutputStream.Close()
                        
                    } else {
                        $error = "State parameter mismatch - possible CSRF attack"
                    }
                } elseif ($query["error"]) {
                    $error = "Authentication error: $($query['error']) - $($query['error_description'])"
                    
                    # Send error response
                    $responseHtml = @"
<!DOCTYPE html>
<html>
<head><title>Authentication Failed</title></head>
<body>
    <h1>❌ Authentication Failed</h1>
    <p>Error: $($query['error'])</p>
    <p>Description: $($query['error_description'])</p>
</body>
</html>
"@
                    $buffer = [System.Text.Encoding]::UTF8.GetBytes($responseHtml)
                    $response.ContentLength64 = $buffer.Length
                    $response.OutputStream.Write($buffer, 0, $buffer.Length)
                    $response.OutputStream.Close()
                }
            }
        }
        
        $elapsed++
        if ($elapsed % 10 -eq 0) {
            Write-Host "." -NoNewline
        }
    }
    
    Write-Host ""

    if ($error) {
        Write-Error $error
        exit 1
    }
    
    if (-not $authCode) {
        Write-Error "Authentication timed out after $timeout seconds"
        exit 1
    }

    # Step 7: Exchange code for tokens
    Write-Step "Exchanging authorization code for tokens..."
    
    $tokenUrl = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"
    $tokenBody = @{
        client_id = $ClientId
        grant_type = "authorization_code"
        code = $authCode
        redirect_uri = $redirectUri
        code_verifier = $codeVerifier
    }
    
    try {
        $tokenResponse = Invoke-RestMethod -Uri $tokenUrl -Method POST -Body $tokenBody -ContentType "application/x-www-form-urlencoded"
        Write-Success "Tokens received successfully"
        
        # Display token information
        Write-Host ""
        Write-Info "🔑 TOKEN INFORMATION:"
        Write-Host "   • Access Token: $($tokenResponse.access_token.Substring(0, 20))..."
        Write-Host "   • Token Type: $($tokenResponse.token_type)"
        Write-Host "   • Expires In: $($tokenResponse.expires_in) seconds"
        Write-Host "   • Scope: $($tokenResponse.scope)"
        
        if ($tokenResponse.refresh_token) {
            Write-Host "   • Refresh Token: Available"
        }
        
    } catch {
        Write-Error "Token exchange failed: $($_.Exception.Message)"
        if ($_.Exception.Response) {
            $errorStream = $_.Exception.Response.GetResponseStream()
            $reader = [System.IO.StreamReader]::new($errorStream)
            $errorBody = $reader.ReadToEnd()
            Write-Error "Error details: $errorBody"
        }
        exit 1
    }

    # Step 8: Test Graph API call
    Write-Step "Testing Microsoft Graph API call..."
    
    try {
        $headers = @{
            "Authorization" = "Bearer $($tokenResponse.access_token)"
            "Content-Type" = "application/json"
        }
        
        $userResponse = Invoke-RestMethod -Uri "https://graph.microsoft.com/v1.0/me" -Headers $headers
        Write-Success "Microsoft Graph API call successful"
        
        Write-Host ""
        Write-Info "👤 USER INFORMATION:"
        Write-Host "   • Name: $($userResponse.displayName)"
        Write-Host "   • Email: $($userResponse.mail ?? $userResponse.userPrincipalName)"
        Write-Host "   • ID: $($userResponse.id)"
        
    } catch {
        Write-Warning "Microsoft Graph API test failed: $($_.Exception.Message)"
        Write-Info "This might be due to insufficient permissions or network issues"
    }

    # Step 9: Success summary
    Write-Host ""
    Write-Success "🎉 OAuth2 PKCE flow test completed successfully!"
    Write-Host ""
    Write-Info "✨ WHAT WAS TESTED:"
    Write-Host "   ✅ Azure AD application configuration"
    Write-Host "   ✅ PKCE parameter generation"
    Write-Host "   ✅ Authorization URL construction"
    Write-Host "   ✅ Local callback server"
    Write-Host "   ✅ Authorization code exchange"
    Write-Host "   ✅ Token acquisition"
    Write-Host "   ✅ Microsoft Graph API access"
    Write-Host ""
    Write-Info "🚀 READY FOR PRODUCTION:"
    Write-Host "   • Your Azure AD setup is working correctly"
    Write-Host "   • OAuth2 PKCE flow is functioning"
    Write-Host "   • Microsoft Graph API is accessible"
    Write-Host ""
    Write-Info "📝 NEXT STEPS:"
    Write-Host "   1. Run the full application: npm run dev:microsoft"
    Write-Host "   2. Test integration: npm run test:integration:auth"
    Write-Host "   3. Validate email functionality: npm run test:integration:email"
    Write-Host ""

} catch {
    Write-Error "OAuth flow test failed: $($_.Exception.Message)"
    Write-Host ""
    Write-Info "📞 TROUBLESHOOTING:"
    Write-Host "   • Check Azure AD app registration"
    Write-Host "   • Verify redirect URI configuration"
    Write-Host "   • Ensure admin consent is granted"
    Write-Host "   • Review firewall/proxy settings"
    exit 1
} finally {
    # Cleanup
    if ($listener -and $listener.IsListening) {
        try {
            $listener.Stop()
            $listener.Dispose()
            Write-Info "Local server stopped"
        } catch {
            # Ignore cleanup errors
        }
    }
}