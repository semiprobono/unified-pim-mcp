# Platform Switcher for Development
# This script helps switch between different platform configurations during development

[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [ValidateSet("microsoft", "google", "apple", "all", "none", "status")]
    [string]$Platform = "status",
    
    [switch]$Restart,
    [switch]$ShowConfig
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-ColorOutput {
    param([string]$Text, [string]$Color = "White")
    Write-Host $Text -ForegroundColor $Color
}

# Get current platform configuration
function Get-CurrentPlatforms {
    $envFile = ".\.env.development"
    if (Test-Path $envFile) {
        $content = Get-Content $envFile
        $activePlatforms = ($content | Where-Object { $_ -match "^ACTIVE_PLATFORMS=" }) -replace "^ACTIVE_PLATFORMS=", ""
        return $activePlatforms -split "," | ForEach-Object { $_.Trim() }
    }
    return @()
}

# Update platform configuration
function Set-PlatformConfiguration {
    param([string[]]$Platforms)
    
    $envFile = ".\.env.development"
    if (Test-Path $envFile) {
        $content = Get-Content $envFile
        $updatedContent = @()
        $platformsSet = $false
        
        foreach ($line in $content) {
            if ($line -match "^ACTIVE_PLATFORMS=") {
                $updatedContent += "ACTIVE_PLATFORMS=$($Platforms -join ',')"
                $platformsSet = $true
            } else {
                $updatedContent += $line
            }
        }
        
        if (-not $platformsSet) {
            $updatedContent += "ACTIVE_PLATFORMS=$($Platforms -join ',')"
        }
        
        $updatedContent | Out-File -FilePath $envFile -Encoding UTF8
        Write-ColorOutput "Updated $envFile with active platforms: $($Platforms -join ', ')" "Green"
    } else {
        Write-ColorOutput "Environment file not found: $envFile" "Red"
        return $false
    }
    
    return $true
}

# Show current status
function Show-Status {
    Write-ColorOutput "`n=== Platform Switcher Status ===" "Green"
    
    $currentPlatforms = Get-CurrentPlatforms
    Write-ColorOutput "Currently active platforms: $($currentPlatforms -join ', ')" "Cyan"
    
    # Check if development server is running
    $processes = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*tsx*" -or $_.CommandLine -like "*src/index.ts*" }
    
    if ($processes) {
        Write-ColorOutput "✅ Development server is running (PID: $($processes[0].Id))" "Green"
    } else {
        Write-ColorOutput "❌ Development server is not running" "Yellow"
    }
    
    # Check Docker services
    Write-ColorOutput "`nDocker Services Status:" "Yellow"
    try {
        $dockerServices = docker-compose ps --services 2>$null
        if ($dockerServices) {
            foreach ($service in $dockerServices) {
                $status = docker-compose ps $service 2>$null
                if ($status -match "Up") {
                    Write-ColorOutput "✅ $service: Running" "Green"
                } else {
                    Write-ColorOutput "❌ $service: Stopped" "Red"
                }
            }
        } else {
            Write-ColorOutput "No Docker services configured" "Gray"
        }
    } catch {
        Write-ColorOutput "Docker not available or services not running" "Gray"
    }
    
    # Show platform-specific configuration
    if ($ShowConfig) {
        Write-ColorOutput "`nPlatform Configuration:" "Yellow"
        
        foreach ($platform in @("microsoft", "google", "apple")) {
            Write-ColorOutput "`n--- $($platform.ToUpper()) ---" "Cyan"
            
            $envVars = switch ($platform) {
                "microsoft" { @("MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "MICROSOFT_TENANT_ID") }
                "google" { @("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET") }
                "apple" { @("APPLE_TEAM_ID", "APPLE_CLIENT_ID", "APPLE_KEY_ID") }
            }
            
            foreach ($var in $envVars) {
                $value = [Environment]::GetEnvironmentVariable($var)
                if ($value) {
                    $maskedValue = if ($var -like "*SECRET*" -or $var -like "*KEY*") { 
                        "*" * [Math]::Min($value.Length, 8) 
                    } else { 
                        $value 
                    }
                    Write-ColorOutput "  $var = $maskedValue" "White"
                } else {
                    Write-ColorOutput "  $var = (not set)" "Gray"
                }
            }
        }
    }
    
    Write-ColorOutput "`nUsage:" "Yellow"
    Write-ColorOutput "  .\platform-switcher.ps1 microsoft  # Switch to Microsoft only" "White"
    Write-ColorOutput "  .\platform-switcher.ps1 google     # Switch to Google only" "White"
    Write-ColorOutput "  .\platform-switcher.ps1 all        # Enable all platforms" "White"
    Write-ColorOutput "  .\platform-switcher.ps1 none       # Disable all platforms" "White"
    Write-ColorOutput "  .\platform-switcher.ps1 status -ShowConfig  # Show detailed config" "White"
}

# Restart development server
function Restart-DevServer {
    Write-ColorOutput "Checking for running development server..." "Yellow"
    
    # Find and stop existing processes
    $processes = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { 
        $_.CommandLine -like "*tsx*" -or $_.CommandLine -like "*src/index.ts*" 
    }
    
    if ($processes) {
        Write-ColorOutput "Stopping existing development server..." "Yellow"
        $processes | ForEach-Object { 
            Stop-Process -Id $_.Id -Force
            Write-ColorOutput "Stopped process PID: $($_.Id)" "Green"
        }
        Start-Sleep -Seconds 2
    }
    
    Write-ColorOutput "Starting development server with new configuration..." "Yellow"
    Start-Process -FilePath "npm" -ArgumentList "run", "dev" -WorkingDirectory $PWD
    Write-ColorOutput "✅ Development server started" "Green"
}

# Main script logic
switch ($Platform.ToLower()) {
    "microsoft" {
        Write-ColorOutput "Switching to Microsoft Graph only..." "Yellow"
        if (Set-PlatformConfiguration @("microsoft")) {
            Write-ColorOutput "✅ Switched to Microsoft Graph platform" "Green"
            if ($Restart) { Restart-DevServer }
        }
    }
    
    "google" {
        Write-ColorOutput "Switching to Google APIs only..." "Yellow"
        if (Set-PlatformConfiguration @("google")) {
            Write-ColorOutput "✅ Switched to Google APIs platform" "Green"
            if ($Restart) { Restart-DevServer }
        }
    }
    
    "apple" {
        Write-ColorOutput "Switching to Apple services only..." "Yellow"
        if (Set-PlatformConfiguration @("apple")) {
            Write-ColorOutput "✅ Switched to Apple services platform" "Green"
            Write-ColorOutput "⚠️  Note: Apple integration is experimental" "Yellow"
            if ($Restart) { Restart-DevServer }
        }
    }
    
    "all" {
        Write-ColorOutput "Enabling all platforms..." "Yellow"
        if (Set-PlatformConfiguration @("microsoft", "google", "apple")) {
            Write-ColorOutput "✅ Enabled all platforms" "Green"
            Write-ColorOutput "⚠️  Note: This may increase startup time and resource usage" "Yellow"
            if ($Restart) { Restart-DevServer }
        }
    }
    
    "none" {
        Write-ColorOutput "Disabling all platforms..." "Yellow"
        if (Set-PlatformConfiguration @()) {
            Write-ColorOutput "✅ Disabled all platforms (mock mode)" "Green"
            Write-ColorOutput "ℹ️  Server will run in mock/development mode only" "Cyan"
            if ($Restart) { Restart-DevServer }
        }
    }
    
    "status" {
        Show-Status
    }
    
    default {
        Write-ColorOutput "Invalid platform. Use: microsoft, google, apple, all, none, or status" "Red"
        exit 1
    }
}

# Show quick status after changes
if ($Platform -ne "status") {
    Write-ColorOutput "`nCurrent Status:" "Cyan"
    $currentPlatforms = Get-CurrentPlatforms
    if ($currentPlatforms.Count -gt 0) {
        Write-ColorOutput "Active platforms: $($currentPlatforms -join ', ')" "Green"
    } else {
        Write-ColorOutput "No platforms active (mock mode)" "Yellow"
    }
    
    if (-not $Restart) {
        Write-ColorOutput "`nTo restart the development server with new settings:" "Yellow"
        Write-ColorOutput "  npm run dev" "White"
        Write-ColorOutput "Or run with -Restart to restart automatically" "Gray"
    }
}