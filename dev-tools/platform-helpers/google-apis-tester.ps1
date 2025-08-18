# Google APIs Testing Helper
# This script provides utilities for exploring and testing Google API endpoints

[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [string]$Action = "menu",
    
    [string]$Service = "",
    [string]$Endpoint = "",
    [string]$AccessToken = "",
    [string]$ClientId = "",
    [string]$ClientSecret = "",
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

# Get access token using OAuth2 device flow
function Get-AccessToken {
    param([string]$ClientId, [string]$ClientSecret)
    
    Write-ColorOutput "Getting access token using OAuth2 device flow..." "Yellow"
    
    $scopes = @(
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/calendar.readonly", 
        "https://www.googleapis.com/auth/contacts.readonly",
        "https://www.googleapis.com/auth/drive.readonly"
    ) -join " "
    
    # Request device code
    $deviceCodeUrl = "https://oauth2.googleapis.com/device/code"
    $deviceCodeBody = @{
        client_id = $ClientId
        scope = $scopes
    }
    
    try {
        $deviceCodeResponse = Invoke-RestMethod -Uri $deviceCodeUrl -Method POST -Body $deviceCodeBody -ContentType "application/x-www-form-urlencoded"
        
        Write-ColorOutput "Device Code: $($deviceCodeResponse.user_code)" "Green"
        Write-ColorOutput "Please go to: $($deviceCodeResponse.verification_url)" "Cyan"
        Write-ColorOutput "And enter the code: $($deviceCodeResponse.user_code)" "Cyan"
        Write-ColorOutput "Waiting for authentication..." "Yellow"
        
        # Poll for token
        $tokenUrl = "https://oauth2.googleapis.com/token"
        $tokenBody = @{
            client_id = $ClientId
            client_secret = $ClientSecret
            device_code = $deviceCodeResponse.device_code
            grant_type = "urn:ietf:params:oauth:grant-type:device_code"
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

# Make Google API request
function Invoke-GoogleApiRequest {
    param(
        [string]$Service,
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
    
    $baseUrl = switch ($Service.ToLower()) {
        "gmail" { "https://gmail.googleapis.com/gmail/v1" }
        "calendar" { "https://www.googleapis.com/calendar/v3" }
        "contacts" { "https://people.googleapis.com/v1" }
        "drive" { "https://www.googleapis.com/drive/v3" }
        "oauth2" { "https://www.googleapis.com/oauth2/v2" }
        default { "https://www.googleapis.com" }
    }
    
    $uri = if ($Endpoint.StartsWith("https://")) { $Endpoint } else { "$baseUrl/$Endpoint" }
    
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
            Write-ColorOutput "Google API Error:" "Red"
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
    Write-ColorOutput "`n=== Google APIs Testing Helper ===" "Green"
    Write-ColorOutput "1. Get User Info (OAuth2)" "White"
    Write-ColorOutput "2. Gmail - List Messages" "White"
    Write-ColorOutput "3. Gmail - Get Profile" "White"
    Write-ColorOutput "4. Calendar - List Events" "White"
    Write-ColorOutput "5. Calendar - List Calendars" "White"
    Write-ColorOutput "6. Contacts - List People" "White"
    Write-ColorOutput "7. Drive - List Files" "White"
    Write-ColorOutput "8. Custom Query" "White"
    Write-ColorOutput "9. Get Access Token" "White"
    Write-ColorOutput "10. Test All APIs" "White"
    Write-ColorOutput "11. Exit" "White"
    
    do {
        $choice = Read-Host "`nEnter your choice (1-11)"
    } while ($choice -notin @("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"))
    
    return $choice
}

# Main script logic
if ($UseDevCredentials) {
    Get-DevCredentials
    $ClientId = $env:GOOGLE_CLIENT_ID
    $ClientSecret = $env:GOOGLE_CLIENT_SECRET
}

switch ($Action.ToLower()) {
    "menu" {
        do {
            $choice = Show-Menu
            
            switch ($choice) {
                "1" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -ClientId $ClientId -ClientSecret $ClientSecret
                    }
                    if ($AccessToken) {
                        Invoke-GoogleApiRequest -Service "oauth2" -Endpoint "userinfo" -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "2" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -ClientId $ClientId -ClientSecret $ClientSecret
                    }
                    if ($AccessToken) {
                        Invoke-GoogleApiRequest -Service "gmail" -Endpoint "users/me/messages?maxResults=10" -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "3" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -ClientId $ClientId -ClientSecret $ClientSecret
                    }
                    if ($AccessToken) {
                        Invoke-GoogleApiRequest -Service "gmail" -Endpoint "users/me/profile" -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "4" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -ClientId $ClientId -ClientSecret $ClientSecret
                    }
                    if ($AccessToken) {
                        Invoke-GoogleApiRequest -Service "calendar" -Endpoint "calendars/primary/events?maxResults=10" -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "5" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -ClientId $ClientId -ClientSecret $ClientSecret
                    }
                    if ($AccessToken) {
                        Invoke-GoogleApiRequest -Service "calendar" -Endpoint "users/me/calendarList" -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "6" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -ClientId $ClientId -ClientSecret $ClientSecret
                    }
                    if ($AccessToken) {
                        Invoke-GoogleApiRequest -Service "contacts" -Endpoint "people/me/connections?personFields=names,emailAddresses" -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "7" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -ClientId $ClientId -ClientSecret $ClientSecret
                    }
                    if ($AccessToken) {
                        Invoke-GoogleApiRequest -Service "drive" -Endpoint "files?pageSize=10&fields=files(id,name,mimeType,modifiedTime)" -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "8" {
                    $service = Read-Host "Enter service name (gmail, calendar, contacts, drive, oauth2)"
                    $customEndpoint = Read-Host "Enter API endpoint (e.g., 'users/me/profile')"
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -ClientId $ClientId -ClientSecret $ClientSecret
                    }
                    if ($AccessToken) {
                        Invoke-GoogleApiRequest -Service $service -Endpoint $customEndpoint -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
                    }
                }
                "9" {
                    $AccessToken = Get-AccessToken -ClientId $ClientId -ClientSecret $ClientSecret
                    if ($AccessToken) {
                        Write-ColorOutput "Access token obtained and cached for this session." "Green"
                    }
                }
                "10" {
                    if (-not $AccessToken) {
                        $AccessToken = Get-AccessToken -ClientId $ClientId -ClientSecret $ClientSecret
                    }
                    if ($AccessToken) {
                        Write-ColorOutput "Testing all APIs..." "Yellow"
                        
                        $tests = @(
                            @{ Name = "User Info"; Service = "oauth2"; Endpoint = "userinfo" },
                            @{ Name = "Gmail Profile"; Service = "gmail"; Endpoint = "users/me/profile" },
                            @{ Name = "Gmail Messages"; Service = "gmail"; Endpoint = "users/me/messages?maxResults=5" },
                            @{ Name = "Calendar List"; Service = "calendar"; Endpoint = "users/me/calendarList" },
                            @{ Name = "Calendar Events"; Service = "calendar"; Endpoint = "calendars/primary/events?maxResults=5" },
                            @{ Name = "People Connections"; Service = "contacts"; Endpoint = "people/me/connections?personFields=names" },
                            @{ Name = "Drive Files"; Service = "drive"; Endpoint = "files?pageSize=5" }
                        )
                        
                        foreach ($test in $tests) {
                            Write-ColorOutput "`n--- Testing $($test.Name) ---" "Cyan"
                            try {
                                Invoke-GoogleApiRequest -Service $test.Service -Endpoint $test.Endpoint -AccessToken $AccessToken | Out-Null
                                Write-ColorOutput "✅ $($test.Name): Success" "Green"
                            }
                            catch {
                                Write-ColorOutput "❌ $($test.Name): Failed - $($_.Exception.Message)" "Red"
                            }
                            Start-Sleep -Seconds 1
                        }
                    }
                }
                "11" {
                    Write-ColorOutput "Goodbye!" "Green"
                    exit
                }
            }
            
            if ($choice -ne "11") {
                Read-Host "`nPress Enter to continue..."
            }
        } while ($choice -ne "11")
    }
    
    "query" {
        if (-not $AccessToken) {
            Write-ColorOutput "Access token required. Use -UseDevCredentials or provide -AccessToken" "Red"
            exit 1
        }
        
        Invoke-GoogleApiRequest -Service $Service -Endpoint $Endpoint -AccessToken $AccessToken -ShowHeaders:$ShowHeaders
    }
    
    "token" {
        $token = Get-AccessToken -ClientId $ClientId -ClientSecret $ClientSecret
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
# .\google-apis-tester.ps1                                          # Interactive menu
# .\google-apis-tester.ps1 -UseDevCredentials                       # Use dev environment credentials  
# .\google-apis-tester.ps1 query -Service "gmail" -Endpoint "users/me/profile" -AccessToken "your_token"
# .\google-apis-tester.ps1 token -ClientId "your_client_id" -ClientSecret "your_secret"