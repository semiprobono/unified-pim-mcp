# Unified PIM MCP Development CLI
# A comprehensive command-line interface for common development tasks

[CmdletBinding()]
param(
    [Parameter(Position=0, Mandatory=$true)]
    [ValidateSet(
        "setup", "start", "stop", "restart", "test", "lint", "format", 
        "build", "clean", "logs", "status", "platform", "mock", "db",
        "coverage", "docs", "deps", "help"
    )]
    [string]$Command,
    
    [Parameter(Position=1)]
    [string]$SubCommand = "",
    
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Args = @(),
    
    [switch]$Watch,
    [switch]$Verbose,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-ColorOutput {
    param([string]$Text, [string]$Color = "White", [switch]$NoNewline)
    if ($NoNewline) {
        Write-Host $Text -ForegroundColor $Color -NoNewline
    } else {
        Write-Host $Text -ForegroundColor $Color
    }
}

function Write-Banner {
    param([string]$Title)
    Write-ColorOutput "`n=== $Title ===" "Green"
}

function Write-Step {
    param([string]$Message)
    Write-ColorOutput "🔄 $Message..." "Yellow"
}

function Write-Success {
    param([string]$Message)
    Write-ColorOutput "✅ $Message" "Green"
}

function Write-Error {
    param([string]$Message)
    Write-ColorOutput "❌ $Message" "Red"
}

function Write-Warning {
    param([string]$Message)
    Write-ColorOutput "⚠️  $Message" "Yellow"
}

function Write-Info {
    param([string]$Message)
    Write-ColorOutput "ℹ️  $Message" "Cyan"
}

# Execute command with error handling
function Invoke-DevCommand {
    param([string]$Command, [string]$Description = "")
    
    if ($Description) {
        Write-Step $Description
    }
    
    if ($Verbose) {
        Write-ColorOutput "Executing: $Command" "Gray"
    }
    
    try {
        Invoke-Expression $Command
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne $null) {
            throw "Command failed with exit code $LASTEXITCODE"
        }
        if ($Description) {
            Write-Success $Description.Replace("...", "")
        }
        return $true
    } catch {
        Write-Error "Failed: $($Description.Replace('...', '')) - $($_.Exception.Message)"
        return $false
    }
}

# Main command handlers
switch ($Command.ToLower()) {
    "setup" {
        Write-Banner "Development Environment Setup"
        
        switch ($SubCommand.ToLower()) {
            "full" {
                Invoke-DevCommand "& .\scripts\setup-dev-env.ps1" "Setting up full development environment"
            }
            "minimal" {
                Invoke-DevCommand "& .\scripts\setup-dev-env.ps1 -Minimal" "Setting up minimal development environment"
            }
            "docker" {
                Invoke-DevCommand "npm run docker:up" "Starting Docker services"
            }
            "" {
                Invoke-DevCommand "& .\scripts\setup-dev-env.ps1" "Setting up development environment"
            }
            default {
                Write-Error "Unknown setup command: $SubCommand"
                Write-Info "Available: full, minimal, docker"
            }
        }
    }
    
    "start" {
        Write-Banner "Starting Development Server"
        
        switch ($SubCommand.ToLower()) {
            "dev" {
                if ($Watch) {
                    Invoke-DevCommand "npm run dev" "Starting development server with hot reload"
                } else {
                    Invoke-DevCommand "npm run build && npm start" "Building and starting production server"
                }
            }
            "docker" {
                Invoke-DevCommand "npm run docker:up" "Starting Docker services"
            }
            "all" {
                Invoke-DevCommand "npm run docker:up" "Starting Docker services"
                Start-Sleep -Seconds 5
                Invoke-DevCommand "npm run dev" "Starting development server"
            }
            "" {
                Invoke-DevCommand "npm run dev" "Starting development server"
            }
            default {
                Write-Error "Unknown start command: $SubCommand"
                Write-Info "Available: dev, docker, all"
            }
        }
    }
    
    "stop" {
        Write-Banner "Stopping Services"
        
        # Stop Node.js processes
        Write-Step "Stopping Node.js development servers"
        Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { 
            $_.CommandLine -like "*tsx*" -or $_.CommandLine -like "*src/index.ts*" 
        } | ForEach-Object { 
            Stop-Process -Id $_.Id -Force
            Write-Success "Stopped process PID: $($_.Id)"
        }
        
        # Stop Docker services
        if ($SubCommand -eq "all" -or $SubCommand -eq "docker" -or $SubCommand -eq "") {
            Invoke-DevCommand "npm run docker:down" "Stopping Docker services"
        }
    }
    
    "restart" {
        Write-Banner "Restarting Services"
        
        # Stop services
        & $MyInvocation.MyCommand.Path stop $SubCommand
        Start-Sleep -Seconds 2
        
        # Start services
        & $MyInvocation.MyCommand.Path start $SubCommand
    }
    
    "test" {
        Write-Banner "Running Tests"
        
        switch ($SubCommand.ToLower()) {
            "unit" {
                if ($Watch) {
                    Invoke-DevCommand "npm run test:unit -- --watch" "Running unit tests in watch mode"
                } else {
                    Invoke-DevCommand "npm run test:unit" "Running unit tests"
                }
            }
            "integration" {
                Invoke-DevCommand "npm run test:integration" "Running integration tests"
            }
            "e2e" {
                Invoke-DevCommand "npm run test:e2e" "Running E2E tests"
            }
            "coverage" {
                Invoke-DevCommand "npm run test:coverage" "Running tests with coverage"
                if (-not $Verbose) {
                    Write-Info "Coverage report generated in ./coverage/"
                }
            }
            "debug" {
                Invoke-DevCommand "npm run test:debug" "Running tests in debug mode"
            }
            "" {
                if ($Watch) {
                    Invoke-DevCommand "npm run test:watch" "Running all tests in watch mode"
                } else {
                    Invoke-DevCommand "npm test" "Running all tests"
                }
            }
            default {
                Write-Error "Unknown test command: $SubCommand"
                Write-Info "Available: unit, integration, e2e, coverage, debug"
            }
        }
    }
    
    "lint" {
        Write-Banner "Code Linting"
        
        if ($SubCommand -eq "fix" -or $Force) {
            Invoke-DevCommand "npm run lint:fix" "Fixing linting issues"
        } elseif ($Watch) {
            Invoke-DevCommand "npm run lint:watch" "Watching for lint issues"
        } else {
            Invoke-DevCommand "npm run lint" "Checking code style"
        }
    }
    
    "format" {
        Write-Banner "Code Formatting"
        
        if ($SubCommand -eq "check") {
            Invoke-DevCommand "npm run format:check" "Checking code formatting"
        } else {
            Invoke-DevCommand "npm run format" "Formatting code"
        }
    }
    
    "build" {
        Write-Banner "Building Project"
        
        switch ($SubCommand.ToLower()) {
            "watch" {
                Invoke-DevCommand "npm run build:watch" "Building in watch mode"
            }
            "prod" {
                Invoke-DevCommand "npm run validate && npm run build" "Running validation and building for production"
            }
            "" {
                Invoke-DevCommand "npm run build" "Building project"
            }
            default {
                Write-Error "Unknown build command: $SubCommand"
                Write-Info "Available: watch, prod"
            }
        }
    }
    
    "clean" {
        Write-Banner "Cleaning Project"
        
        switch ($SubCommand.ToLower()) {
            "all" {
                Invoke-DevCommand "npm run clean:all" "Deep cleaning all artifacts"
            }
            "build" {
                Invoke-DevCommand "npm run clean" "Cleaning build artifacts"
            }
            "deps" {
                Write-Step "Cleaning dependencies"
                Remove-Item -Path "node_modules" -Recurse -Force -ErrorAction SilentlyContinue
                Remove-Item -Path "package-lock.json" -Force -ErrorAction SilentlyContinue
                Write-Success "Dependencies cleaned"
            }
            "" {
                Invoke-DevCommand "npm run clean" "Cleaning build artifacts"
            }
            default {
                Write-Error "Unknown clean command: $SubCommand"
                Write-Info "Available: all, build, deps"
            }
        }
    }
    
    "logs" {
        Write-Banner "Viewing Logs"
        
        switch ($SubCommand.ToLower()) {
            "docker" {
                Invoke-DevCommand "npm run docker:logs" "Showing Docker service logs"
            }
            "app" {
                $logFiles = Get-ChildItem -Path "logs" -Filter "*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
                if ($logFiles) {
                    Write-Info "Latest log file: $($logFiles[0].Name)"
                    Get-Content -Path $logFiles[0].FullName -Wait
                } else {
                    Write-Warning "No application log files found"
                }
            }
            "" {
                # Show recent logs from multiple sources
                Write-Info "Recent application logs:"
                $logFiles = Get-ChildItem -Path "logs" -Filter "*.log" -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
                if ($logFiles) {
                    Get-Content -Path $logFiles[0].FullName -Tail 20
                }
                
                Write-Info "`nDocker logs:"
                docker-compose logs --tail=10 2>$null
            }
            default {
                Write-Error "Unknown logs command: $SubCommand"
                Write-Info "Available: docker, app"
            }
        }
    }
    
    "status" {
        Write-Banner "System Status"
        
        # Development server status
        $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { 
            $_.CommandLine -like "*tsx*" -or $_.CommandLine -like "*src/index.ts*" 
        }
        
        if ($nodeProcesses) {
            Write-Success "Development server is running (PID: $($nodeProcesses[0].Id))"
        } else {
            Write-Warning "Development server is not running"
        }
        
        # Docker services status
        Write-Info "`nDocker Services:"
        try {
            $services = docker-compose ps --services 2>$null
            if ($services) {
                foreach ($service in $services) {
                    $status = docker-compose ps $service 2>$null
                    if ($status -match "Up") {
                        Write-Success "$service: Running"
                    } else {
                        Write-Warning "$service: Stopped"
                    }
                }
            } else {
                Write-Info "No Docker services configured"
            }
        } catch {
            Write-Warning "Docker not available"
        }
        
        # Platform status
        Write-Info "`nActive Platforms:"
        $envFile = ".env.development"
        if (Test-Path $envFile) {
            $activePlatforms = (Get-Content $envFile | Where-Object { $_ -match "^ACTIVE_PLATFORMS=" }) -replace "^ACTIVE_PLATFORMS=", ""
            if ($activePlatforms) {
                $platforms = $activePlatforms -split "," | ForEach-Object { $_.Trim() }
                foreach ($platform in $platforms) {
                    Write-Success $platform
                }
            } else {
                Write-Info "No platforms configured"
            }
        }
        
        # Health check
        Write-Info "`nSystem Health:"
        npm run health 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Success "All systems healthy"
        } else {
            Write-Warning "Some issues detected - run 'npm run health' for details"
        }
    }
    
    "platform" {
        Write-Banner "Platform Management"
        
        if ($SubCommand) {
            $platformArgs = @($SubCommand)
            if ($Args) { $platformArgs += $Args }
            $restartFlag = if ($Args -contains "-Restart") { "-Restart" } else { "" }
            
            Invoke-DevCommand "& .\dev-tools\platform-helpers\platform-switcher.ps1 $($platformArgs -join ' ') $restartFlag" "Managing platforms"
        } else {
            Invoke-DevCommand "& .\dev-tools\platform-helpers\platform-switcher.ps1 status -ShowConfig" "Showing platform status"
        }
    }
    
    "mock" {
        Write-Banner "Mock Data Management"
        
        switch ($SubCommand.ToLower()) {
            "generate" {
                Invoke-DevCommand "npm run generate:mocks" "Generating mock data"
            }
            "clear" {
                Write-Step "Clearing mock data"
                Remove-Item -Path "tests\mocks\data\*.json" -Force -ErrorAction SilentlyContinue
                Write-Success "Mock data cleared"
            }
            "" {
                Invoke-DevCommand "npm run generate:mocks" "Generating mock data"
            }
            default {
                Write-Error "Unknown mock command: $SubCommand"
                Write-Info "Available: generate, clear"
            }
        }
    }
    
    "db" {
        Write-Banner "Database Management"
        
        switch ($SubCommand.ToLower()) {
            "start" {
                Invoke-DevCommand "docker-compose up -d postgres" "Starting database"
            }
            "stop" {
                Invoke-DevCommand "docker-compose stop postgres" "Stopping database"
            }
            "reset" {
                Write-Step "Resetting database"
                docker-compose down -v postgres 2>$null
                docker-compose up -d postgres 2>$null
                Write-Success "Database reset"
            }
            "logs" {
                Invoke-DevCommand "docker-compose logs -f postgres" "Showing database logs"
            }
            "" {
                Write-Info "Database commands: start, stop, reset, logs"
            }
            default {
                Write-Error "Unknown db command: $SubCommand"
                Write-Info "Available: start, stop, reset, logs"
            }
        }
    }
    
    "coverage" {
        Write-Banner "Coverage Reports"
        
        switch ($SubCommand.ToLower()) {
            "open" {
                Invoke-DevCommand "npm run test:coverage:open" "Generating and opening coverage report"
            }
            "generate" {
                Invoke-DevCommand "npm run test:coverage" "Generating coverage report"
            }
            "" {
                Invoke-DevCommand "npm run test:coverage" "Generating coverage report"
            }
            default {
                Write-Error "Unknown coverage command: $SubCommand"
                Write-Info "Available: open, generate"
            }
        }
    }
    
    "docs" {
        Write-Banner "Documentation"
        
        switch ($SubCommand.ToLower()) {
            "generate" {
                Invoke-DevCommand "npm run docs:generate" "Generating API documentation"
            }
            "serve" {
                Invoke-DevCommand "npm run docs:serve" "Opening documentation"
            }
            "" {
                Invoke-DevCommand "npm run docs:generate && npm run docs:serve" "Generating and opening documentation"
            }
            default {
                Write-Error "Unknown docs command: $SubCommand"
                Write-Info "Available: generate, serve"
            }
        }
    }
    
    "deps" {
        Write-Banner "Dependency Management"
        
        switch ($SubCommand.ToLower()) {
            "check" {
                Invoke-DevCommand "npm run deps:check" "Checking for outdated dependencies"
            }
            "update" {
                Invoke-DevCommand "npm run deps:update" "Updating dependencies"
            }
            "audit" {
                Invoke-DevCommand "npm run deps:audit" "Auditing dependencies for security issues"
            }
            "fix" {
                Invoke-DevCommand "npm run deps:audit:fix" "Fixing security vulnerabilities"
            }
            "" {
                Invoke-DevCommand "npm run deps:check" "Checking dependencies"
            }
            default {
                Write-Error "Unknown deps command: $SubCommand"
                Write-Info "Available: check, update, audit, fix"
            }
        }
    }
    
    "help" {
        Write-Banner "Unified PIM MCP Development CLI Help"
        
        $commands = @(
            @{ Name = "setup"; Description = "Set up development environment"; SubCommands = "full, minimal, docker" },
            @{ Name = "start"; Description = "Start development services"; SubCommands = "dev, docker, all" },
            @{ Name = "stop"; Description = "Stop running services"; SubCommands = "all, docker" },
            @{ Name = "restart"; Description = "Restart services"; SubCommands = "same as start" },
            @{ Name = "test"; Description = "Run tests"; SubCommands = "unit, integration, e2e, coverage, debug" },
            @{ Name = "lint"; Description = "Check code style"; SubCommands = "fix" },
            @{ Name = "format"; Description = "Format code"; SubCommands = "check" },
            @{ Name = "build"; Description = "Build the project"; SubCommands = "watch, prod" },
            @{ Name = "clean"; Description = "Clean artifacts"; SubCommands = "all, build, deps" },
            @{ Name = "logs"; Description = "View logs"; SubCommands = "docker, app" },
            @{ Name = "status"; Description = "Show system status"; SubCommands = "" },
            @{ Name = "platform"; Description = "Manage platforms"; SubCommands = "microsoft, google, apple, all, none, status" },
            @{ Name = "mock"; Description = "Manage mock data"; SubCommands = "generate, clear" },
            @{ Name = "db"; Description = "Database operations"; SubCommands = "start, stop, reset, logs" },
            @{ Name = "coverage"; Description = "Coverage reports"; SubCommands = "open, generate" },
            @{ Name = "docs"; Description = "Documentation"; SubCommands = "generate, serve" },
            @{ Name = "deps"; Description = "Dependency management"; SubCommands = "check, update, audit, fix" }
        )
        
        Write-ColorOutput "`nAvailable Commands:" "Yellow"
        foreach ($cmd in $commands) {
            Write-ColorOutput "  $($cmd.Name.PadRight(12)) - $($cmd.Description)" "White"
            if ($cmd.SubCommands) {
                Write-ColorOutput "  $(' '.PadRight(12))   Sub-commands: $($cmd.SubCommands)" "Gray"
            }
        }
        
        Write-ColorOutput "`nCommon Usage:" "Yellow"
        Write-ColorOutput "  dev-cli setup           # Set up development environment" "White"
        Write-ColorOutput "  dev-cli start            # Start development server" "White"
        Write-ColorOutput "  dev-cli test -Watch      # Run tests in watch mode" "White"
        Write-ColorOutput "  dev-cli platform microsoft  # Switch to Microsoft only" "White"
        Write-ColorOutput "  dev-cli status           # Check system status" "White"
        
        Write-ColorOutput "`nFlags:" "Yellow"
        Write-ColorOutput "  -Watch                   # Enable watch mode where applicable" "White"
        Write-ColorOutput "  -Verbose                 # Show detailed output" "White"
        Write-ColorOutput "  -Force                   # Force operations (like lint fix)" "White"
    }
    
    default {
        Write-Error "Unknown command: $Command"
        Write-Info "Use 'dev-cli help' to see available commands"
        exit 1
    }
}

Write-ColorOutput ""  # Empty line at the end