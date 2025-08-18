# Microsoft Graph API Explorer Helper
# This script provides utilities for exploring and testing Microsoft Graph API endpoints

[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [string]$Action = "menu",
    
    [string]$Endpoint = "",
    [string]$AccessToken = "",
    [string]$TenantId = "",
    [switch]$UseDevCredentials,
    [switch]$ShowHeaders
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-ColorOutput {
    param([string]$Text, [string]$Color = "White")
    Write-Host $Text -ForegroundColor $Color
}

# Load development credentials
function Get-DevCredentials {
    $envFile = ".\.env.development"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match "^([^#][^=]*)=(.*)$") {
                $key = $matches[1].Trim()
                $value = $matches[2].Trim()
                [Environment]::SetEnvironmentVariable($key, $value, [System.EnvironmentVariableTarget]::Process)
            }
        }
    }
}

# Get access token using device code flow (for testing)
function Get-AccessToken {
    param([string]$TenantId, [string]$ClientId)
    
    Write-ColorOutput "Getting access token using device code flow..." "Yellow"
    
    $deviceCodeUrl = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/devicecode"
    $tokenUrl = "https://login.microsoftonline.com/$TenantId/oauth2/v2.0/token"
    
    $scopes = "https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/Contacts.Read https://graph.microsoft.com/Files.Read https://graph.microsoft.com/User.Read"
    
    # Request device code
    $deviceCodeBody = @{
        client_id = $ClientId
        scope = $scopes
    }
    
    try {
        $deviceCodeResponse = Invoke-RestMethod -Uri $deviceCodeUrl -Method POST -Body $deviceCodeBody -ContentType "application/x-www-form-urlencoded"
        
        Write-ColorOutput "Device Code: $($deviceCodeResponse.user_code)" "Green"
        Write-ColorOutput "Please go to: $($deviceCodeResponse.verification_uri)" "Cyan"
        Write-ColorOutput "And enter the code: $($deviceCodeResponse.user_code)" "Cyan"
        Write-ColorOutput "Waiting for authentication..." "Yellow"
        
        # Poll for token
        $tokenBody = @{
            grant_type = "urn:ietf:params:oauth:grant-type:device_code"
            client_id = $ClientId
            device_code = $deviceCodeResponse.device_code
        }
        
        $maxAttempts = 30
        $interval = 5
        
        for ($i = 0; $i -lt $maxAttempts; $i++) {
            Start-Sleep -Seconds $interval
            
            try {
                $tokenResponse = Invoke-RestMethod -Uri $tokenUrl -Method POST -Body $tokenBody -ContentType "application/x-www-form-urlencoded"
                Write-ColorOutput "Successfully obtained access token!" "Green"
                return $tokenResponse.access_token
            }
            catch {
                $errorResponse = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
                if ($errorResponse.error -eq "authorization_pending") {
                    Write-ColorOutput "." "Yellow" -NoNewline
                    continue
                }
                else {
                    Write-ColorOutput "`nError: $($errorResponse.error_description)" "Red"
                    throw
                }
            }
        }
        
        Write-ColorOutput "`nTimeout waiting for authentication" "Red"
        return $null
    }
    catch {
        Write-ColorOutput "Error obtaining access token: $_" "Red"
        return $null
    }
}

# Make Graph API request
function Invoke-GraphRequest {
    param(
        [string]$Endpoint,
        [string]$AccessToken,
        [string]$Method = "GET",
        [hashtable]$Body = $null,
        [switch]$ShowHeaders
    )
    
    $headers = @{
        "Authorization" = "Bearer $AccessToken"
        "Content-Type" = "application/json"
    }
    
    $uri = if ($Endpoint.StartsWith("https://")) { $Endpoint } else { "https://graph.microsoft.com/v1.0/$Endpoint" }
    
    Write-ColorOutput "Making request to: $uri" "Cyan"
    
    try {
        if ($Body) {
            $jsonBody = $Body | ConvertTo-Json -Depth 10
            $response = Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers -Body $jsonBody
        } else {
            $response = Invoke-RestMethod -Uri $uri -Method $Method -Headers $headers
        }
        
        if ($ShowHeaders) {
            Write-ColorOutput "`nResponse Headers:" "Yellow"
            $headers | Format-Table -AutoSize
        }
        
        Write-ColorOutput "`nResponse:" "Green"
        $response | ConvertTo-Json -Depth 10 | Write-Output
        
        return $response
    }
    catch {
        $errorDetails = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($errorDetails) {
            Write-ColorOutput "Graph API Error:" "Red"
            Write-ColorOutput "Code: $($errorDetails.error.code)" "Red"
            Write-ColorOutput "Message: $($errorDetails.error.message)" "Red"
        } else {
            Write-ColorOutput "Request failed: $_" "Red"
        }
        throw
    }
}

# Show interactive menu
function Show-Menu {
    Write-ColorOutput "`n=== Microsoft Graph API Explorer ===" "Green"
    Write-ColorOutput "1. Get User Profile" "White"
    Write-ColorOutput "2. List Emails (top 10)" "White"
    Write-ColorOutput "3. List Calendar Events" "White"
    Write-ColorOutput "4. List Contacts" "White"
    Write-ColorOutput "5. List Files (OneDrive)" "White"
    Write-ColorOutput "6. Custom Query" "White"
    Write-ColorOutput "7. Get Access Token" "White"
    Write-ColorOutput "8. Test All Endpoints" "White"
    Write-ColorOutput "9. Exit" "White"
    
    do {
        $choice = Read-Host "`nEnter your choice (1-9)"
    } while ($choice -notin @("1", "2", "3", "4", "5", "6", "7", "8", "9"))
    
    return $choice
}

# Main script logic
if ($UseDevCredentials) {
    Get-DevCredentials
    $TenantId = $env:MICROSOFT_TENANT_ID
    $clientId = $env:MICROSOFT_CLIENT_ID
}

switch ($Action.ToLower()) {
    "menu" {
        do {
            $choice = Show-Menu
            
            switch ($choice) {
                "1" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -TenantId $TenantId -ClientId $clientId
                    }
                    if ($AccessToken) {
                        Invoke-GraphRequest -Endpoint "me" -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "2" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -TenantId $TenantId -ClientId $clientId
                    }
                    if ($AccessToken) {
                        Invoke-GraphRequest -Endpoint "me/messages?`$top=10&`$select=subject,from,receivedDateTime" -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "3" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -TenantId $TenantId -ClientId $clientId
                    }
                    if ($AccessToken) {
                        Invoke-GraphRequest -Endpoint "me/events?`$top=10&`$select=subject,start,end,location" -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "4" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -TenantId $TenantId -ClientId $clientId
                    }
                    if ($AccessToken) {
                        Invoke-GraphRequest -Endpoint "me/contacts?`$top=10&`$select=displayName,emailAddresses,mobilePhone" -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "5" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -TenantId $TenantId -ClientId $clientId
                    }
                    if ($AccessToken) {
                        Invoke-GraphRequest -Endpoint "me/drive/root/children?`$top=10&`$select=name,size,lastModifiedDateTime" -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "6" {
                    $customEndpoint = Read-Host "Enter Graph API endpoint (e.g., 'me/messages')"
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -TenantId $TenantId -ClientId $clientId
                    }
                    if ($AccessToken) {
                        Invoke-GraphRequest -Endpoint $customEndpoint -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "7" {
                    $AccessToken = Get-AccessToken -TenantId $TenantId -ClientId $clientId
                    if ($AccessToken) {
                        Write-ColorOutput "Access token obtained and cached for this session." "Green"
                    }
                }
                "8" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -TenantId $TenantId -ClientId $clientId
                    }
                    if ($AccessToken) {
                        Write-ColorOutput "Testing all endpoints..." "Yellow"
                        
                        $endpoints = @(
                            @{ Name = "User Profile"; Endpoint = "me" },
                            @{ Name = "Messages"; Endpoint = "me/messages?`$top=5" },
                            @{ Name = "Events"; Endpoint = "me/events?`$top=5" },
                            @{ Name = "Contacts"; Endpoint = "me/contacts?`$top=5" },
                            @{ Name = "Files"; Endpoint = "me/drive/root/children?`$top=5" }
                        )
                        
                        foreach ($endpoint in $endpoints) {
                            Write-ColorOutput "`n--- Testing $($endpoint.Name) ---" "Cyan"
                            try {
                                Invoke-GraphRequest -Endpoint $endpoint.Endpoint -AccessToken $AccessToken | Out-Null
                                Write-ColorOutput "✅ $($endpoint.Name): Success" "Green"
                            }
                            catch {
                                Write-ColorOutput "❌ $($endpoint.Name): Failed - $($_.Exception.Message)" "Red"
                            }
                            Start-Sleep -Seconds 1
                        }
                    }
                }
                "9" {
                    Write-ColorOutput "Goodbye!" "Green"
                    exit
                }
            }
            
            if ($choice -ne "9") {
                Read-Host "`nPress Enter to continue..."
            }
        } while ($choice -ne "9")
    }
    
    "query" {
        if (-not $AccessToken) {
            Write-ColorOutput "Access token required. Use -UseDevCredentials or provide -AccessToken" "Red"
            exit 1
        }
        
        Invoke-GraphRequest -Endpoint $Endpoint -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
    }
    
    "token" {
        $token = Get-AccessToken -TenantId $TenantId -ClientId $env:MICROSOFT_CLIENT_ID
        if ($token) {
            Write-ColorOutput "Access Token:" "Green"
            Write-Output $token
        }
    }
    
    default {
        Write-ColorOutput "Invalid action. Use 'menu', 'query', or 'token'" "Red"
        exit 1
    }
}

# Usage Examples:
# .\microsoft-graph-explorer.ps1                                    # Interactive menu
# .\microsoft-graph-explorer.ps1 -UseDevCredentials                 # Use dev environment credentials
# .\microsoft-graph-explorer.ps1 query -Endpoint "me" -AccessToken "your_token"
# .\microsoft-graph-explorer.ps1 token -TenantId "tenant" -ClientId "client"