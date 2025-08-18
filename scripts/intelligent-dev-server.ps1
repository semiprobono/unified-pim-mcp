#Requires -Version 7.0

<#
.SYNOPSIS
    Intelligent Hot Reload Development Server for Unified PIM MCP
    
.DESCRIPTION
    Ultra-fast development server with intelligent incremental builds, smart
    dependency tracking, performance optimization, and seamless debugging support.
    
.PARAMETER Mode
    Development mode: Fast, Debug, or Performance
    
.PARAMETER Port
    Port for the MCP server (default: 8080)
    
.PARAMETER Watch
    Directories to watch for changes (default: src, tests)
    
.PARAMETER Platform
    Active platform: microsoft, google, apple, or all
    
.PARAMETER Turbo
    Enable turbo mode with advanced optimizations

.EXAMPLE
    .\intelligent-dev-server.ps1 -Mode Fast
    
.EXAMPLE
    .\intelligent-dev-server.ps1 -Mode Debug -Port 3000 -Platform microsoft
#>

[CmdletBinding()]
param(
    [Parameter(HelpMessage = "Development mode")]
    [ValidateSet("Fast", "Debug", "Performance")]
    [string]$Mode = "Fast",
    
    [Parameter(HelpMessage = "MCP server port")]
    [int]$Port = 8080,
    
    [Parameter(HelpMessage = "Directories to watch")]
    [string[]]$Watch = @("src", "tests", "config"),
    
    [Parameter(HelpMessage = "Active platform")]
    [ValidateSet("microsoft", "google", "apple", "all")]
    [string]$Platform = "microsoft",
    
    [Parameter(HelpMessage = "Enable turbo mode")]
    [switch]$Turbo
)

# Import required modules
Add-Type -AssemblyName System.IO

# Color output functions
function Write-Success { param([string]$Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param([string]$Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Dev { param([string]$Message) Write-Host "🔧 $Message" -ForegroundColor Blue }
function Write-Reload { param([string]$Message) Write-Host "🔄 $Message" -ForegroundColor Magenta }

# Global state management
$script:ServerProcess = $null
$script:TypeCheckerProcess = $null
$script:LintProcess = $null
$script:BuildCache = @{}
$script:WatcherCache = @{}
$script:IsRebuilding = $false
$script:LastBuildTime = 0
$script:ChangeQueue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
$script:PerformanceMetrics = @{
    BuildTimes = @()
    RestartTimes = @()
    ChangeDetectionTimes = @()
}

function Initialize-DevServer {
    Write-Host ""
    Write-Success "🚀 INTELLIGENT HOT RELOAD DEV SERVER"
    Write-Host "====================================" -ForegroundColor Magenta
    Write-Host ""
    
    Write-Info "Configuration:"
    Write-Host "   Mode: $Mode"
    Write-Host "   Port: $Port"
    Write-Host "   Platform: $Platform"
    Write-Host "   Watch: $($Watch -join ', ')"
    Write-Host "   Turbo: $($Turbo.IsPresent)"
    Write-Host ""
    
    # Validate environment
    Test-Environment
    
    # Initialize build cache
    Initialize-BuildCache
    
    # Setup file watchers
    Setup-FileWatchers
    
    # Start auxiliary processes
    Start-AuxiliaryProcesses
    
    # Initial build
    Invoke-InitialBuild
    
    # Start main server
    Start-MCPServer
    
    # Start main loop
    Start-MainLoop
}

function Test-Environment {
    Write-Dev "Validating development environment..."
    
    # Check Node.js
    try {
        $nodeVersion = node --version
        Write-Success "Node.js $nodeVersion"
    } catch {
        throw "Node.js is required but not found"
    }
    
    # Check TypeScript
    try {
        $tsVersion = npx tsc --version
        Write-Success "TypeScript $tsVersion"
    } catch {
        Write-Warning "TypeScript not found - installing..."
        npm install -g typescript
    }
    
    # Check tsx
    try {
        npx tsx --version | Out-Null
        Write-Success "tsx available"
    } catch {
        Write-Warning "tsx not found - installing..."
        npm install tsx --save-dev
    }
    
    # Check required directories
    foreach ($dir in $Watch) {
        if (-not (Test-Path $dir)) {
            Write-Warning "Watch directory '$dir' not found - creating..."
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
}

function Initialize-BuildCache {
    Write-Dev "Initializing intelligent build cache..."
    
    $cacheFile = ".dev-cache.json"
    
    if (Test-Path $cacheFile) {
        try {
            $cacheContent = Get-Content $cacheFile -Raw | ConvertFrom-Json
            $script:BuildCache = @{}
            
            foreach ($property in $cacheContent.PSObject.Properties) {
                $script:BuildCache[$property.Name] = $property.Value
            }
            
            Write-Success "Loaded build cache with $($script:BuildCache.Keys.Count) entries"
        } catch {
            Write-Warning "Build cache corrupted - starting fresh"
            $script:BuildCache = @{}
        }
    } else {
        $script:BuildCache = @{}
    }
    
    # Cache TypeScript project references
    if (Test-Path "tsconfig.json") {
        $tsconfigHash = (Get-FileHash "tsconfig.json").Hash
        $script:BuildCache["tsconfig"] = $tsconfigHash
    }
}

function Save-BuildCache {
    try {
        $script:BuildCache | ConvertTo-Json -Depth 3 | Set-Content ".dev-cache.json" -Encoding UTF8
    } catch {
        # Ignore cache save errors
    }
}

function Setup-FileWatchers {
    Write-Dev "Setting up intelligent file watchers..."
    
    foreach ($watchDir in $Watch) {
        if (-not (Test-Path $watchDir)) {
            continue
        }
        
        $watcher = New-Object System.IO.FileSystemWatcher
        $watcher.Path = (Resolve-Path $watchDir).Path
        $watcher.IncludeSubdirectories = $true
        $watcher.EnableRaisingEvents = $true
        
        # Filter for relevant files
        $watcher.Filter = "*.*"
        
        # Register event handlers
        Register-ObjectEvent -InputObject $watcher -EventName Changed -Action {
            $filePath = $Event.SourceEventArgs.FullPath
            $changeType = $Event.SourceEventArgs.ChangeType
            
            # Filter relevant file types
            if ($filePath -match '\.(ts|js|json|md)$' -and $filePath -notmatch '(node_modules|\.git|dist|coverage)') {
                $script:ChangeQueue.Enqueue("$changeType|$filePath")
            }
        } | Out-Null
        
        Register-ObjectEvent -InputObject $watcher -EventName Created -Action {
            $filePath = $Event.SourceEventArgs.FullPath
            if ($filePath -match '\.(ts|js|json|md)$' -and $filePath -notmatch '(node_modules|\.git|dist|coverage)') {
                $script:ChangeQueue.Enqueue("Created|$filePath")
            }
        } | Out-Null
        
        Register-ObjectEvent -InputObject $watcher -EventName Deleted -Action {
            $filePath = $Event.SourceEventArgs.FullPath
            if ($filePath -match '\.(ts|js|json|md)$' -and $filePath -notmatch '(node_modules|\.git|dist|coverage)') {
                $script:ChangeQueue.Enqueue("Deleted|$filePath")
            }
        } | Out-Null
        
        $script:WatcherCache[$watchDir] = $watcher
        Write-Success "Watching: $watchDir"
    }
}

function Start-AuxiliaryProcesses {
    Write-Dev "Starting auxiliary development processes..."
    
    if ($Mode -eq "Debug" -or $Mode -eq "Performance") {
        # Start type checker in watch mode
        Write-Info "Starting TypeScript type checker..."
        $script:TypeCheckerProcess = Start-Process -FilePath "npx" -ArgumentList @("tsc", "--noEmit", "--watch") -WindowStyle Hidden -PassThru
    }
    
    # Start ESLint in watch mode
    if ($Turbo -or $Mode -eq "Performance") {
        Write-Info "Starting ESLint watcher..."
        $script:LintProcess = Start-Process -FilePath "npm" -ArgumentList @("run", "lint:watch") -WindowStyle Hidden -PassThru
    }
    
    Write-Success "Auxiliary processes started"
}

function Invoke-InitialBuild {
    Write-Dev "Performing initial build..."
    
    $buildStart = Get-Date
    
    try {
        # Fast build for development
        if ($Mode -eq "Fast") {
            # Skip full build, use tsx directly
            Write-Success "Skipping build (using tsx runtime)"
        } else {
            # Full TypeScript build
            $buildResult = & npx tsc --incremental 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "TypeScript build had warnings/errors:"
                Write-Host $buildResult -ForegroundColor Yellow
            } else {
                Write-Success "TypeScript build completed"
            }
        }
        
        $buildTime = (Get-Date) - $buildStart
        $script:PerformanceMetrics.BuildTimes += $buildTime.TotalMilliseconds
        $script:LastBuildTime = (Get-Date).Ticks
        
        Write-Success "Initial build completed in $($buildTime.TotalSeconds.ToString('F2'))s"
        
    } catch {
        Write-Error "Initial build failed: $($_.Exception.Message)"
        throw
    }
}

function Start-MCPServer {
    Write-Dev "Starting MCP server..."
    
    # Environment variables
    $env:NODE_ENV = "development"
    $env:MCP_PORT = $Port
    $env:ACTIVE_PLATFORMS = $Platform
    $env:HOT_RELOAD = "true"
    $env:LOG_LEVEL = if ($Mode -eq "Debug") { "debug" } else { "info" }
    
    # Server start arguments
    $args = @("src/index.ts")
    
    if ($Mode -eq "Debug") {
        $args = @("--inspect=0.0.0.0:9229") + $args
        Write-Info "Debug mode: Debugger listening on port 9229"
    }
    
    if ($Turbo) {
        $env:NODE_OPTIONS = "--max-old-space-size=4096 --experimental-loader ts-node/esm"
    }
    
    try {
        $script:ServerProcess = Start-Process -FilePath "npx" -ArgumentList (@("tsx") + $args) -PassThru
        
        # Wait a moment for server to start
        Start-Sleep -Seconds 2
        
        # Check if server started successfully
        if (-not $script:ServerProcess.HasExited) {
            Write-Success "MCP server started (PID: $($script:ServerProcess.Id))"
            Write-Info "Server URL: http://localhost:$Port"
            
            if ($Mode -eq "Debug") {
                Write-Info "Chrome DevTools: chrome://inspect"
            }
        } else {
            throw "Server process exited immediately"
        }
        
    } catch {
        Write-Error "Failed to start MCP server: $($_.Exception.Message)"
        throw
    }
}

function Start-MainLoop {
    Write-Dev "Starting intelligent change detection loop..."
    Write-Info "Press Ctrl+C to stop the server`n"
    
    $lastProcessCheck = Get-Date
    $changeBuffer = @()
    $bufferTimeout = 500  # ms
    $lastChangeTime = 0
    
    try {
        while ($true) {
            # Process file changes
            $hasChanges = $false
            $currentTime = (Get-Date).Ticks
            
            # Collect changes from queue
            while ($script:ChangeQueue.TryDequeue([ref]$change)) {
                $changeBuffer += $change
                $lastChangeTime = $currentTime
                $hasChanges = $true
            }
            
            # Process buffered changes after timeout
            if ($changeBuffer.Count -gt 0 -and ($currentTime - $lastChangeTime) / 10000 -gt $bufferTimeout) {
                Process-FileChanges $changeBuffer
                $changeBuffer = @()
            }
            
            # Check server process health
            if ((Get-Date) - $lastProcessCheck -gt [TimeSpan]::FromSeconds(5)) {
                if ($script:ServerProcess -and $script:ServerProcess.HasExited) {
                    Write-Warning "Server process died unexpectedly - restarting..."
                    Start-MCPServer
                }
                $lastProcessCheck = Get-Date
            }
            
            # Show performance metrics periodically
            if ($Mode -eq "Performance" -and (Get-Date).Second % 30 -eq 0) {
                Show-PerformanceMetrics
            }
            
            Start-Sleep -Milliseconds 100
        }
    } finally {
        Cleanup-Processes
    }
}

function Process-FileChanges($changes) {
    if ($script:IsRebuilding) {
        Write-Info "Build in progress - queuing changes..."
        return
    }
    
    $script:IsRebuilding = $true
    $changeStart = Get-Date
    
    try {
        # Group changes by type and file
        $changesByFile = @{}
        $needsRestart = $false
        $needsBuild = $false
        
        foreach ($change in $changes) {
            $parts = $change -split '\|', 2
            $changeType = $parts[0]
            $filePath = $parts[1]
            
            $relativePath = [System.IO.Path]::GetRelativePath((Get-Location), $filePath)
            
            if (-not $changesByFile.ContainsKey($relativePath)) {
                $changesByFile[$relativePath] = @()
            }
            $changesByFile[$relativePath] += $changeType
            
            # Determine action needed
            if ($relativePath -match '(tsconfig|package)\.json$' -or $relativePath -match 'src/(index|server)\.ts$') {
                $needsRestart = $true
            } elseif ($relativePath -match '\.(ts|js)$') {
                $needsBuild = $true
            }
        }
        
        if ($changesByFile.Count -eq 0) {
            return
        }
        
        Write-Reload "Changes detected:"
        foreach ($file in $changesByFile.Keys) {
            $changeTypes = $changesByFile[$file] | Sort-Object -Unique
            Write-Host "   📝 $file ($($changeTypes -join ', '))" -ForegroundColor Yellow
        }
        
        # Smart rebuild decision
        if ($needsRestart) {
            Write-Reload "Core files changed - full restart required"
            Restart-Server
        } elseif ($needsBuild -and $Mode -ne "Fast") {
            Write-Reload "TypeScript files changed - incremental build"
            Invoke-IncrementalBuild $changesByFile.Keys
        } else {
            Write-Reload "Hot reload - no build required"
        }
        
        $changeTime = (Get-Date) - $changeStart
        $script:PerformanceMetrics.ChangeDetectionTimes += $changeTime.TotalMilliseconds
        
        Write-Success "Reload completed in $($changeTime.TotalSeconds.ToString('F2'))s"
        
    } finally {
        $script:IsRebuilding = $false
    }
}

function Invoke-IncrementalBuild($changedFiles) {
    Write-Dev "Running incremental build..."
    
    $buildStart = Get-Date
    
    try {
        # Use TypeScript incremental compilation
        $buildResult = & npx tsc --incremental 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Incremental build completed"
        } else {
            Write-Warning "Build completed with warnings:"
            Write-Host $buildResult -ForegroundColor Yellow
        }
        
        $buildTime = (Get-Date) - $buildStart
        $script:PerformanceMetrics.BuildTimes += $buildTime.TotalMilliseconds
        
    } catch {
        Write-Error "Incremental build failed: $($_.Exception.Message)"
    }
}

function Restart-Server {
    Write-Reload "Restarting MCP server..."
    
    $restartStart = Get-Date
    
    try {
        # Stop current server
        if ($script:ServerProcess -and -not $script:ServerProcess.HasExited) {
            $script:ServerProcess.Kill()
            $script:ServerProcess.WaitForExit(5000)
        }
        
        # Start new server
        Start-MCPServer
        
        $restartTime = (Get-Date) - $restartStart
        $script:PerformanceMetrics.RestartTimes += $restartTime.TotalMilliseconds
        
        Write-Success "Server restarted in $($restartTime.TotalSeconds.ToString('F2'))s"
        
    } catch {
        Write-Error "Server restart failed: $($_.Exception.Message)"
        throw
    }
}

function Show-PerformanceMetrics {
    $buildAvg = if ($script:PerformanceMetrics.BuildTimes.Count -gt 0) {
        ($script:PerformanceMetrics.BuildTimes | Measure-Object -Average).Average
    } else { 0 }
    
    $restartAvg = if ($script:PerformanceMetrics.RestartTimes.Count -gt 0) {
        ($script:PerformanceMetrics.RestartTimes | Measure-Object -Average).Average
    } else { 0 }
    
    $changeAvg = if ($script:PerformanceMetrics.ChangeDetectionTimes.Count -gt 0) {
        ($script:PerformanceMetrics.ChangeDetectionTimes | Measure-Object -Average).Average
    } else { 0 }
    
    Write-Host ""
    Write-Info "📊 Performance Metrics:"
    Write-Host "   Build Time (avg): $($buildAvg.ToString('F0'))ms"
    Write-Host "   Restart Time (avg): $($restartAvg.ToString('F0'))ms"
    Write-Host "   Change Detection (avg): $($changeAvg.ToString('F0'))ms"
    Write-Host "   Total Builds: $($script:PerformanceMetrics.BuildTimes.Count)"
    Write-Host "   Total Restarts: $($script:PerformanceMetrics.RestartTimes.Count)"
    Write-Host ""
}

function Cleanup-Processes {
    Write-Info "Cleaning up processes..."
    
    # Save build cache
    Save-BuildCache
    
    # Stop server process
    if ($script:ServerProcess -and -not $script:ServerProcess.HasExited) {
        Write-Info "Stopping MCP server..."
        $script:ServerProcess.Kill()
    }
    
    # Stop type checker
    if ($script:TypeCheckerProcess -and -not $script:TypeCheckerProcess.HasExited) {
        Write-Info "Stopping type checker..."
        $script:TypeCheckerProcess.Kill()
    }
    
    # Stop linter
    if ($script:LintProcess -and -not $script:LintProcess.HasExited) {
        Write-Info "Stopping linter..."
        $script:LintProcess.Kill()
    }
    
    # Cleanup watchers
    foreach ($watcher in $script:WatcherCache.Values) {
        if ($watcher) {
            $watcher.Dispose()
        }
    }
    
    # Show final performance summary
    if ($script:PerformanceMetrics.BuildTimes.Count -gt 0) {
        Write-Host ""
        Write-Success "🏁 Development Session Summary:"
        Show-PerformanceMetrics
    }
    
    Write-Success "Development server stopped gracefully"
}

# Trap Ctrl+C for graceful shutdown
$null = Register-EngineEvent -SourceIdentifier PowerShell.Exiting -Action {
    Cleanup-Processes
}

# Trap script termination
trap {
    Cleanup-Processes
    break
}

# Start the intelligent dev server
Initialize-DevServer