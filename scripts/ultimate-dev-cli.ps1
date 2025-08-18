#Requires -Version 7.0

<#
.SYNOPSIS
    Ultimate Development CLI for Unified PIM MCP with AI-Powered Suggestions
    
.DESCRIPTION
    The most advanced development CLI with intelligent command suggestions,
    contextual help, performance optimization, workflow automation, and
    comprehensive project management capabilities.
    
.PARAMETER Command
    Primary command to execute
    
.PARAMETER SubCommand
    Sub-command for detailed operations
    
.PARAMETER Args
    Additional arguments for the command
    
.PARAMETER Interactive
    Enable interactive mode with guided workflows
    
.PARAMETER Profile
    Performance profiling mode
    
.PARAMETER Watch
    Enable watch mode for continuous operations
    
.PARAMETER Verbose
    Show detailed output and diagnostics
    
.PARAMETER Force
    Force operations without confirmations

.EXAMPLE
    .\ultimate-dev-cli.ps1 setup -Interactive
    
.EXAMPLE
    .\ultimate-dev-cli.ps1 start turbo -Profile -Watch
#>

[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [string]$Command = "",
    
    [Parameter(Position=1)]
    [string]$SubCommand = "",
    
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Args = @(),
    
    [switch]$Interactive,
    [switch]$Profile,
    [switch]$Watch,
    [switch]$Verbose,
    [switch]$Force
)

# Enhanced color output functions
function Write-Success { param([string]$Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param([string]$Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Step { param([string]$Message) Write-Host "🔄 $Message" -ForegroundColor Blue }
function Write-Celebrate { param([string]$Message) Write-Host "🎉 $Message" -ForegroundColor Magenta }
function Write-Rocket { param([string]$Message) Write-Host "🚀 $Message" -ForegroundColor Cyan }
function Write-Brain { param([string]$Message) Write-Host "🧠 $Message" -ForegroundColor Yellow }
function Write-Lightning { param([string]$Message) Write-Host "⚡ $Message" -ForegroundColor Magenta }

# CLI State Management
$script:CliState = @{
    LastCommand = ""
    CommandHistory = @()
    WorkflowContext = ""
    Performance = @{
        StartTime = Get-Date
        Commands = @()
    }
    Suggestions = @()
    ProjectHealth = @{}
}

# Load configuration
$cliConfig = @{
    EnableSuggestions = $true
    AutoComplete = $true
    PerformanceMonitoring = $true
    SmartWorkflows = $true
    CacheCommands = $true
}

function Show-Banner {
    Write-Host ""
    Write-Rocket "🌟 ULTIMATE DEVELOPMENT CLI 🌟"
    Write-Host "=================================" -ForegroundColor Magenta
    Write-Host "  AI-Powered Development Experience" -ForegroundColor Cyan
    Write-Host "  For Unified PIM MCP" -ForegroundColor Gray
    Write-Host ""
}

function Get-IntelligentSuggestions {
    param([string]$Context, [string]$LastCommand = "")
    
    $suggestions = @()
    
    # Context-aware suggestions
    switch ($Context) {
        "startup" {
            if (-not (Test-Path ".env")) {
                $suggestions += @{
                    Command = "setup env"
                    Description = "Create environment configuration"
                    Priority = "high"
                    Reason = "No .env file found"
                }
            }
            
            $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
            if (-not $nodeProcesses) {
                $suggestions += @{
                    Command = "start dev"
                    Description = "Start development server"
                    Priority = "medium"
                    Reason = "No development server running"
                }
            }
            
            # Check if Docker services are running
            try {
                $dockerStatus = docker ps --format "table {{.Names}}" 2>$null
                if (-not ($dockerStatus -match "chromadb|redis|postgres")) {
                    $suggestions += @{
                        Command = "docker up"
                        Description = "Start required Docker services"
                        Priority = "high"
                        Reason = "Essential services not running"
                    }
                }
            } catch {
                # Docker not available
            }
        }
        
        "development" {
            # Check for common development issues
            $tsErrors = Get-TypeScriptErrors
            if ($tsErrors) {
                $suggestions += @{
                    Command = "fix typescript"
                    Description = "Fix TypeScript errors"
                    Priority = "high"
                    Reason = "$($tsErrors.Count) TypeScript errors found"
                }
            }
            
            $lintIssues = Get-LintIssues
            if ($lintIssues) {
                $suggestions += @{
                    Command = "lint fix"
                    Description = "Auto-fix linting issues"
                    Priority = "medium"
                    Reason = "$($lintIssues) linting issues found"
                }
            }
            
            # Suggest tests if none have been run recently
            if (-not (Test-RecentTestRun)) {
                $suggestions += @{
                    Command = "test quick"
                    Description = "Run quick test suite"
                    Priority = "medium"
                    Reason = "No recent test runs detected"
                }
            }
        }
        
        "deployment" {
            if (-not (Test-Path "dist")) {
                $suggestions += @{
                    Command = "build prod"
                    Description = "Build for production"
                    Priority = "high"
                    Reason = "No production build found"
                }
            }
            
            $coverage = Get-TestCoverage
            if ($coverage -lt 80) {
                $suggestions += @{
                    Command = "test coverage"
                    Description = "Improve test coverage"
                    Priority = "medium"
                    Reason = "Coverage below 80% ($coverage%)"
                }
            }
        }
    }
    
    # Command-specific suggestions
    if ($LastCommand) {
        switch ($LastCommand.ToLower()) {
            "build" {
                $suggestions += @{
                    Command = "test"
                    Description = "Run tests after build"
                    Priority = "medium"
                    Reason = "Good practice to test after building"
                }
            }
            
            "test" {
                if (Test-TestFailures) {
                    $suggestions += @{
                        Command = "test debug"
                        Description = "Debug failing tests"
                        Priority = "high"
                        Reason = "Test failures detected"
                    }
                }
            }
            
            "lint" {
                $suggestions += @{
                    Command = "format"
                    Description = "Format code after linting"
                    Priority = "low"
                    Reason = "Complete code quality workflow"
                }
            }
        }
    }
    
    return $suggestions
}

function Show-IntelligentSuggestions {
    param([object[]]$Suggestions)
    
    if ($Suggestions.Count -eq 0) {
        return
    }
    
    Write-Brain "💡 Intelligent Suggestions:"
    
    $highPriority = $Suggestions | Where-Object { $_.Priority -eq "high" }
    $mediumPriority = $Suggestions | Where-Object { $_.Priority -eq "medium" }
    $lowPriority = $Suggestions | Where-Object { $_.Priority -eq "low" }
    
    if ($highPriority) {
        Write-Host "   🔴 High Priority:" -ForegroundColor Red
        foreach ($suggestion in $highPriority) {
            Write-Host "     • $($suggestion.Command) - $($suggestion.Description)" -ForegroundColor White
            Write-Host "       Reason: $($suggestion.Reason)" -ForegroundColor Gray
        }
    }
    
    if ($mediumPriority -and $Verbose) {
        Write-Host "   🟡 Medium Priority:" -ForegroundColor Yellow
        foreach ($suggestion in $mediumPriority) {
            Write-Host "     • $($suggestion.Command) - $($suggestion.Description)" -ForegroundColor White
            Write-Host "       Reason: $($suggestion.Reason)" -ForegroundColor Gray
        }
    }
    
    if ($lowPriority -and $Verbose) {
        Write-Host "   🟢 Low Priority:" -ForegroundColor Green
        foreach ($suggestion in $lowPriority) {
            Write-Host "     • $($suggestion.Command) - $($suggestion.Description)" -ForegroundColor White
        }
    }
    
    Write-Host ""
}

function Start-InteractiveMode {
    Write-Rocket "🎯 Interactive Development Assistant"
    Write-Host "====================================" -ForegroundColor Magenta
    Write-Host ""
    
    Write-Info "What would you like to do?"
    Write-Host "  1. 🚀 Quick Start (setup + start development)"
    Write-Host "  2. 🔧 Full Setup (complete environment setup)"
    Write-Host "  3. ⚡ Turbo Mode (optimized for maximum performance)"
    Write-Host "  4. 🧪 Testing Workflow (comprehensive testing)"
    Write-Host "  5. 📊 Performance Analysis (monitoring + optimization)"
    Write-Host "  6. 🛠️  Maintenance (updates, cleanup, health check)"
    Write-Host "  7. 🚢 Deployment Prep (production readiness)"
    Write-Host "  8. 🆘 Problem Solver (diagnose and fix issues)"
    Write-Host ""
    
    $choice = Read-Host "Enter your choice (1-8) or 'custom' for manual command"
    
    switch ($choice) {
        "1" { Invoke-QuickStart }
        "2" { Invoke-FullSetup }
        "3" { Invoke-TurboMode }
        "4" { Invoke-TestingWorkflow }
        "5" { Invoke-PerformanceAnalysis }
        "6" { Invoke-MaintenanceWorkflow }
        "7" { Invoke-DeploymentPrep }
        "8" { Invoke-ProblemSolver }
        "custom" { Invoke-CustomCommand }
        default {
            Write-Warning "Invalid choice. Starting Quick Start..."
            Invoke-QuickStart
        }
    }
}

function Invoke-QuickStart {
    Write-Lightning "⚡ QUICK START WORKFLOW"
    Write-Host "=======================" -ForegroundColor Yellow
    Write-Host ""
    
    # Check prerequisites
    Write-Step "Checking prerequisites..."
    $issues = Test-Prerequisites
    
    if ($issues.Count -gt 0) {
        Write-Warning "Prerequisites check failed:"
        foreach ($issue in $issues) {
            Write-Host "   • $issue" -ForegroundColor Red
        }
        Write-Host ""
        $fix = Read-Host "Would you like me to try fixing these automatically? (y/N)"
        if ($fix -match "^[Yy]") {
            Fix-Prerequisites $issues
        } else {
            return
        }
    }
    
    # Environment setup
    if (-not (Test-Path ".env")) {
        Write-Step "Setting up environment..."
        & ".\scripts\ultimate-dev-setup.ps1" -Mode Quick -SkipAzure
    }
    
    # Start services
    Write-Step "Starting Docker services..."
    docker-compose -f docker-compose.turbo.yml up -d --remove-orphans
    
    # Wait for services
    Write-Step "Waiting for services to be ready..."
    Wait-ForServices
    
    # Start development server
    Write-Step "Starting development server..."
    Start-Process -FilePath "npx" -ArgumentList @("tsx", "src/index.ts") -WindowStyle Hidden
    
    Write-Celebrate "🎉 Quick Start Complete!"
    Write-Info "Your development environment is ready!"
    Write-Host ""
    
    # Show next steps
    Write-Brain "💡 Suggested Next Steps:"
    Write-Host "   • Open VS Code: code ."
    Write-Host "   • Run tests: .\ultimate-dev-cli.ps1 test"
    Write-Host "   • View performance: http://localhost:9090"
    Write-Host "   • Check status: .\ultimate-dev-cli.ps1 status"
}

function Invoke-TurboMode {
    Write-Lightning "🚀 TURBO MODE ACTIVATED"
    Write-Host "========================" -ForegroundColor Red
    Write-Host ""
    
    Write-Info "Turbo mode optimizes for maximum development speed and performance."
    Write-Host ""
    
    # Stop any existing services
    Write-Step "Stopping existing services..."
    docker-compose down -v --remove-orphans 2>$null
    
    # Start optimized services
    Write-Step "Starting turbo-optimized services..."
    docker-compose -f docker-compose.turbo.yml up -d --force-recreate
    
    # Enable performance monitoring
    Write-Step "Enabling performance monitoring..."
    $env:ENABLE_METRICS = "true"
    $env:METRICS_PORT = "9090"
    $env:HOT_RELOAD = "true"
    $env:TURBO_MODE = "true"
    
    # Start intelligent development server
    Write-Step "Starting intelligent development server..."
    Start-Process -FilePath "pwsh" -ArgumentList @("-File", "scripts\intelligent-dev-server.ps1", "-Mode", "Fast", "-Turbo") -WindowStyle Minimized
    
    # Wait for everything to be ready
    Write-Step "Optimizing startup sequence..."
    Wait-ForTurboServices
    
    Write-Celebrate "🚀 TURBO MODE READY!"
    Write-Lightning "⚡ Maximum performance configuration active!"
    Write-Host ""
    
    # Show performance stats
    Show-PerformanceStats
}

function Invoke-TestingWorkflow {
    Write-Brain "🧪 COMPREHENSIVE TESTING WORKFLOW"
    Write-Host "===================================" -ForegroundColor Green
    Write-Host ""
    
    Write-Info "Running intelligent test workflow..."
    
    # Pre-test checks
    Write-Step "Running pre-test validation..."
    & ".\scripts\quality-gate.ps1" -Stage "pre-commit" -SkipTests
    
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Quality gate issues found. Fixing automatically..."
        & ".\scripts\quality-gate.ps1" -Stage "pre-commit" -Fix -SkipTests
    }
    
    # Run test suite with intelligence
    Write-Step "Running intelligent test suite..."
    
    # Unit tests first
    Write-Info "Phase 1: Unit Tests"
    npm run test:unit
    
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Unit tests passed ✓"
        
        # Integration tests
        Write-Info "Phase 2: Integration Tests"
        npm run test:integration
        
        if ($LASTEXITCODE -eq 0) {
            Write-Success "Integration tests passed ✓"
            
            # Performance tests
            Write-Info "Phase 3: Performance Tests"
            npm run test:integration:performance
            
            if ($LASTEXITCODE -eq 0) {
                Write-Success "Performance tests passed ✓"
                
                # Coverage analysis
                Write-Info "Phase 4: Coverage Analysis"
                npm run test:coverage
                
                Show-TestingSummary
            }
        }
    }
    
    Write-Celebrate "🧪 Testing workflow complete!"
}

function Invoke-PerformanceAnalysis {
    Write-Brain "📊 PERFORMANCE ANALYSIS & OPTIMIZATION"
    Write-Host "=======================================" -ForegroundColor Blue
    Write-Host ""
    
    # Start performance monitoring
    Write-Step "Starting performance monitoring dashboard..."
    
    # Ensure services are running
    docker-compose -f docker-compose.turbo.yml up -d prometheus grafana node-exporter
    
    # Run performance benchmarks
    Write-Step "Running performance benchmarks..."
    npm run benchmark:memory
    npm run benchmark:graph-client
    npm run benchmark:cache
    
    # Analyze bundle size
    Write-Step "Analyzing bundle size..."
    npm run analyze:bundle
    npm run analyze:deps
    
    # Show performance dashboard
    Write-Info "Performance Dashboard: http://localhost:3000"
    Write-Info "Prometheus Metrics: http://localhost:9090"
    Write-Info "Node Metrics: http://localhost:9100/metrics"
    
    # Open dashboards automatically
    if ($Interactive) {
        $open = Read-Host "Open performance dashboards? (Y/n)"
        if ($open -notmatch "^[Nn]") {
            Start-Process "http://localhost:3000"
            Start-Process "http://localhost:9090"
        }
    }
    
    Write-Celebrate "📊 Performance analysis ready!"
}

function Invoke-ProblemSolver {
    Write-Brain "🔍 INTELLIGENT PROBLEM SOLVER"
    Write-Host "==============================" -ForegroundColor Red
    Write-Host ""
    
    Write-Info "Analyzing your development environment for issues..."
    
    $issues = @()
    
    # System health check
    Write-Step "Checking system health..."
    $systemIssues = Get-SystemHealth
    $issues += $systemIssues
    
    # Project health check
    Write-Step "Checking project health..."
    $projectIssues = Get-ProjectHealth
    $issues += $projectIssues
    
    # Service health check
    Write-Step "Checking service health..."
    $serviceIssues = Get-ServiceHealth
    $issues += $serviceIssues
    
    # Code health check
    Write-Step "Checking code health..."
    $codeIssues = Get-CodeHealth
    $issues += $codeIssues
    
    if ($issues.Count -eq 0) {
        Write-Celebrate "🎉 No issues found! Your environment is healthy!")
        return
    }
    
    Write-Warning "Found $($issues.Count) issues:"
    Write-Host ""
    
    foreach ($issue in $issues) {
        Write-Host "❌ $($issue.Category): $($issue.Description)" -ForegroundColor Red
        if ($issue.Solution) {
            Write-Host "   💡 Solution: $($issue.Solution)" -ForegroundColor Yellow
        }
        if ($issue.AutoFix) {
            Write-Host "   🔧 Auto-fix available: $($issue.AutoFix)" -ForegroundColor Green
        }
        Write-Host ""
    }
    
    # Offer to fix issues automatically
    $autoFixableIssues = $issues | Where-Object { $_.AutoFix }
    
    if ($autoFixableIssues.Count -gt 0) {
        $fix = Read-Host "Found $($autoFixableIssues.Count) auto-fixable issues. Fix them now? (Y/n)"
        if ($fix -notmatch "^[Nn]") {
            foreach ($issue in $autoFixableIssues) {
                Write-Step "Fixing: $($issue.Description)"
                try {
                    Invoke-Expression $issue.AutoFix
                    Write-Success "Fixed: $($issue.Description)"
                } catch {
                    Write-Error "Failed to fix: $($issue.Description) - $($_.Exception.Message)"
                }
            }
        }
    }
}

# Helper functions for intelligent analysis
function Test-Prerequisites {
    $issues = @()
    
    try {
        $nodeVersion = node --version
        if (-not $nodeVersion -or [version]($nodeVersion -replace '^v') -lt [version]"18.0.0") {
            $issues += "Node.js 18+ required (current: $nodeVersion)"
        }
    } catch {
        $issues += "Node.js not installed"
    }
    
    try {
        docker --version | Out-Null
        docker info | Out-Null 2>&1
        if ($LASTEXITCODE -ne 0) {
            $issues += "Docker daemon not running"
        }
    } catch {
        $issues += "Docker not available"
    }
    
    if (-not (Test-Path "package.json")) {
        $issues += "Not in a valid Node.js project directory"
    }
    
    return $issues
}

function Get-TypeScriptErrors {
    try {
        $result = & npx tsc --noEmit --skipLibCheck 2>&1
        $errors = $result | Where-Object { $_ -match 'error TS\d+:' }
        return $errors
    } catch {
        return @()
    }
}

function Get-LintIssues {
    try {
        $result = & npx eslint src tests --ext .ts,.js --format json 2>$null
        $json = $result | ConvertFrom-Json -ErrorAction SilentlyContinue
        $errorCount = ($json | Measure-Object -Property errorCount -Sum -ErrorAction SilentlyContinue).Sum
        return $errorCount
    } catch {
        return 0
    }
}

function Test-RecentTestRun {
    $testResults = Get-ChildItem -Path "." -Filter "*.xml" -Recurse -ErrorAction SilentlyContinue |
                   Where-Object { $_.Name -match "test" -and $_.LastWriteTime -gt (Get-Date).AddHours(-2) }
    return $testResults.Count -gt 0
}

function Get-TestCoverage {
    if (Test-Path "coverage\lcov-report\index.html") {
        try {
            $content = Get-Content "coverage\lcov-report\index.html" -Raw
            if ($content -match 'class="strong">(\d+(?:\.\d+)?)%') {
                return [double]$matches[1]
            }
        } catch {
            # Ignore errors
        }
    }
    return 0
}

function Wait-ForServices {
    $services = @(
        @{ Name = "ChromaDB"; Url = "http://localhost:8000/api/v1/heartbeat"; MaxWait = 30 },
        @{ Name = "Redis"; Url = "redis://localhost:6379"; MaxWait = 10 },
        @{ Name = "PostgreSQL"; Port = 5432; MaxWait = 15 }
    )
    
    foreach ($service in $services) {
        Write-Step "Waiting for $($service.Name)..."
        $waited = 0
        $ready = $false
        
        while ($waited -lt $service.MaxWait -and -not $ready) {
            try {
                if ($service.Url) {
                    $response = Invoke-WebRequest -Uri $service.Url -TimeoutSec 2 -ErrorAction Stop
                    $ready = $response.StatusCode -eq 200
                } elseif ($service.Port) {
                    $connection = Test-NetConnection -ComputerName "localhost" -Port $service.Port -InformationLevel Quiet -WarningAction SilentlyContinue
                    $ready = $connection.TcpTestSucceeded
                }
            } catch {
                Start-Sleep -Seconds 2
                $waited += 2
                Write-Host "." -NoNewline
            }
        }
        
        if ($ready) {
            Write-Success "$($service.Name) is ready"
        } else {
            Write-Warning "$($service.Name) not ready after $($service.MaxWait)s"
        }
    }
}

function Show-PerformanceStats {
    Write-Info "🔥 Performance Statistics:"
    
    # Memory usage
    $memory = Get-Process -Name "node" -ErrorAction SilentlyContinue | Measure-Object -Property WorkingSet64 -Sum
    if ($memory.Sum -gt 0) {
        Write-Host "   Memory: $([math]::Round($memory.Sum / 1MB, 1)) MB" -ForegroundColor Yellow
    }
    
    # Service response times
    $services = @(
        @{ Name = "ChromaDB"; Url = "http://localhost:8000/api/v1/heartbeat" },
        @{ Name = "MCP Server"; Url = "http://localhost:8080/health" }
    )
    
    foreach ($service in $services) {
        try {
            $start = Get-Date
            $response = Invoke-WebRequest -Uri $service.Url -TimeoutSec 2 -ErrorAction Stop
            $duration = ((Get-Date) - $start).TotalMilliseconds
            Write-Host "   $($service.Name): $($duration.ToString('F0'))ms" -ForegroundColor Green
        } catch {
            Write-Host "   $($service.Name): Unavailable" -ForegroundColor Red
        }
    }
    
    Write-Host ""
}

# Command router with intelligent suggestions
function Invoke-Command {
    param([string]$Cmd, [string]$Sub)
    
    # Track command for suggestions
    $script:CliState.LastCommand = $Cmd
    $script:CliState.CommandHistory += @{
        Command = $Cmd
        SubCommand = $Sub
        Timestamp = Get-Date
    }
    
    # Performance tracking
    $commandStart = Get-Date
    
    try {
        # Route to appropriate command handler
        switch ($Cmd.ToLower()) {
            "setup" { Invoke-SetupCommand $Sub }
            "start" { Invoke-StartCommand $Sub }
            "test" { Invoke-TestCommand $Sub }
            "build" { Invoke-BuildCommand $Sub }
            "docker" { Invoke-DockerCommand $Sub }
            "turbo" { Invoke-TurboMode }
            "fix" { Invoke-FixCommand $Sub }
            "analyze" { Invoke-AnalyzeCommand $Sub }
            "monitor" { Invoke-MonitorCommand $Sub }
            "status" { Invoke-StatusCommand }
            "suggest" { Show-IntelligentSuggestions (Get-IntelligentSuggestions "development") }
            default { 
                Write-Error "Unknown command: $Cmd"
                Write-Brain "💡 Did you mean one of these?"
                Get-CommandSuggestions $Cmd | ForEach-Object {
                    Write-Host "   • $_" -ForegroundColor Yellow
                }
            }
        }
        
        # Track performance
        $duration = ((Get-Date) - $commandStart).TotalMilliseconds
        $script:CliState.Performance.Commands += @{
            Command = "$Cmd $Sub"
            Duration = $duration
            Success = $true
        }
        
    } catch {
        Write-Error "Command failed: $($_.Exception.Message)"
        
        $script:CliState.Performance.Commands += @{
            Command = "$Cmd $Sub"
            Duration = ((Get-Date) - $commandStart).TotalMilliseconds
            Success = $false
            Error = $_.Exception.Message
        }
    }
}

# Main execution logic
try {
    Show-Banner
    
    # Initialize CLI state
    $script:CliState.Performance.StartTime = Get-Date
    
    if ($Interactive -or -not $Command) {
        Start-InteractiveMode
    } else {
        # Get and show intelligent suggestions
        if ($cliConfig.EnableSuggestions) {
            $suggestions = Get-IntelligentSuggestions "startup" $script:CliState.LastCommand
            Show-IntelligentSuggestions $suggestions
        }
        
        # Execute the requested command
        Invoke-Command $Command $SubCommand
        
        # Show post-command suggestions
        if ($cliConfig.EnableSuggestions -and -not $Interactive) {
            $postSuggestions = Get-IntelligentSuggestions "development" $Command
            if ($postSuggestions.Count -gt 0 -and $postSuggestions.Count -le 3) {
                Show-IntelligentSuggestions $postSuggestions
            }
        }
    }
    
    # Show session summary if verbose
    if ($Verbose -and $script:CliState.Performance.Commands.Count -gt 0) {
        $totalDuration = ($script:CliState.Performance.Commands | Measure-Object -Property Duration -Sum).Sum
        $successfulCommands = ($script:CliState.Performance.Commands | Where-Object { $_.Success }).Count
        
        Write-Host ""
        Write-Info "📊 Session Summary:"
        Write-Host "   Commands executed: $($script:CliState.Performance.Commands.Count)"
        Write-Host "   Successful: $successfulCommands"
        Write-Host "   Total time: $($totalDuration.ToString('F0'))ms"
        Write-Host "   Session duration: $((((Get-Date) - $script:CliState.Performance.StartTime).TotalSeconds).ToString('F1'))s"
    }
    
    Write-Celebrate "🎯 Development session complete!")
    
} catch {
    Write-Error "CLI execution failed: $($_.Exception.Message)"
    
    if ($Verbose) {
        Write-Host "Stack trace:" -ForegroundColor Red
        Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    }
    
    exit 1
}