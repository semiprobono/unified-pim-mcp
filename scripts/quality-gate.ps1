#Requires -Version 7.0

<#
.SYNOPSIS
    Comprehensive Quality Gate for Unified PIM MCP
    
.DESCRIPTION
    Ultra-comprehensive pre-commit quality gate that ensures code quality,
    security, performance, and maintainability standards. Integrates multiple
    tools for maximum code quality assurance.
    
.PARAMETER Stage
    Quality gate stage: pre-commit, pre-push, or ci
    
.PARAMETER Fix
    Automatically fix issues where possible
    
.PARAMETER Verbose
    Enable verbose output for debugging
    
.PARAMETER SkipTests
    Skip running tests (for faster checks)
    
.PARAMETER SecurityOnly
    Run only security-related checks

.EXAMPLE
    .\quality-gate.ps1 -Stage pre-commit -Fix
    
.EXAMPLE
    .\quality-gate.ps1 -Stage ci -Verbose
#>

[CmdletBinding()]
param(
    [Parameter(HelpMessage = "Quality gate stage")]
    [ValidateSet("pre-commit", "pre-push", "ci", "manual")]
    [string]$Stage = "pre-commit",
    
    [Parameter(HelpMessage = "Auto-fix issues")]
    [switch]$Fix,
    
    [Parameter(HelpMessage = "Verbose output")]
    [switch]$Verbose,
    
    [Parameter(HelpMessage = "Skip tests")]
    [switch]$SkipTests,
    
    [Parameter(HelpMessage = "Security checks only")]
    [switch]$SecurityOnly
)

# Color output functions
function Write-Success { param([string]$Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param([string]$Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Check { param([string]$Message) Write-Host "🔍 $Message" -ForegroundColor Blue }
function Write-Fix { param([string]$Message) Write-Host "🔧 $Message" -ForegroundColor Magenta }

# Quality gate results
$script:QualityResults = @{
    Checks = @()
    Errors = @()
    Warnings = @()
    Fixed = @()
    Summary = @{
        TotalChecks = 0
        PassedChecks = 0
        FailedChecks = 0
        WarningChecks = 0
        FixedIssues = 0
        Duration = 0
    }
}

function Add-QualityCheck {
    param(
        [string]$Name,
        [string]$Status,  # Pass, Fail, Warning, Fixed
        [string]$Message,
        [string[]]$Details = @(),
        [int]$Duration = 0
    )
    
    $check = @{
        Name = $Name
        Status = $Status
        Message = $Message
        Details = $Details
        Duration = $Duration
        Timestamp = Get-Date
    }
    
    $script:QualityResults.Checks += $check
    $script:QualityResults.Summary.TotalChecks++
    
    switch ($Status) {
        "Pass" { $script:QualityResults.Summary.PassedChecks++ }
        "Fail" { 
            $script:QualityResults.Summary.FailedChecks++
            $script:QualityResults.Errors += $check
        }
        "Warning" { 
            $script:QualityResults.Summary.WarningChecks++
            $script:QualityResults.Warnings += $check
        }
        "Fixed" { 
            $script:QualityResults.Summary.FixedIssues++
            $script:QualityResults.Fixed += $check
        }
    }
}

function Start-QualityGate {
    $startTime = Get-Date
    
    Write-Host ""
    Write-Success "🚀 COMPREHENSIVE QUALITY GATE"
    Write-Host "=============================" -ForegroundColor Magenta
    Write-Host ""
    
    Write-Info "Configuration:"
    Write-Host "   Stage: $Stage"
    Write-Host "   Auto-fix: $($Fix.IsPresent)"
    Write-Host "   Skip tests: $($SkipTests.IsPresent)"
    Write-Host "   Security only: $($SecurityOnly.IsPresent)"
    Write-Host ""
    
    # Get list of changed files for targeted checks
    $changedFiles = Get-ChangedFiles
    
    if ($changedFiles.Count -gt 0) {
        Write-Info "Files to check: $($changedFiles.Count)"
        if ($Verbose) {
            foreach ($file in $changedFiles) {
                Write-Host "   📝 $file" -ForegroundColor Gray
            }
            Write-Host ""
        }
    } else {
        Write-Info "No changed files detected - running full checks"
    }
    
    # Run quality checks based on stage
    if (-not $SecurityOnly) {
        Invoke-CodeFormattingChecks $changedFiles
        Invoke-LintingChecks $changedFiles
        Invoke-TypeChecks
        Invoke-DependencyChecks
        
        if (-not $SkipTests) {
            Invoke-TestChecks $changedFiles
        }
        
        Invoke-PerformanceChecks $changedFiles
        Invoke-DocumentationChecks $changedFiles
    }
    
    # Always run security checks
    Invoke-SecurityChecks $changedFiles
    
    # Stage-specific checks
    switch ($Stage) {
        "pre-push" {
            Invoke-BuildChecks
            Invoke-IntegrationChecks
        }
        "ci" {
            Invoke-BuildChecks
            Invoke-IntegrationChecks
            Invoke-CoverageChecks
            Invoke-LicenseChecks
        }
    }
    
    $endTime = Get-Date
    $script:QualityResults.Summary.Duration = ($endTime - $startTime).TotalSeconds
    
    # Generate report
    Show-QualityReport
    
    # Return exit code based on results
    $exitCode = if ($script:QualityResults.Summary.FailedChecks -gt 0) { 1 } else { 0 }
    return $exitCode
}

function Get-ChangedFiles {
    $files = @()
    
    try {
        if ($Stage -eq "pre-commit") {
            # Get staged files
            $stagedFiles = git diff --cached --name-only --diff-filter=ACM 2>$null
            if ($stagedFiles) {
                $files = $stagedFiles -split "`n" | Where-Object { $_ -and (Test-Path $_) }
            }
        } elseif ($Stage -eq "pre-push") {
            # Get files changed in current branch
            $branchFiles = git diff origin/main --name-only --diff-filter=ACM 2>$null
            if ($branchFiles) {
                $files = $branchFiles -split "`n" | Where-Object { $_ -and (Test-Path $_) }
            }
        }
    } catch {
        if ($Verbose) {
            Write-Warning "Could not get changed files from git: $($_.Exception.Message)"
        }
    }
    
    # Filter for relevant file types
    $relevantFiles = $files | Where-Object {
        $_ -match '\.(ts|js|json|md|yml|yaml)$' -and
        $_ -notmatch '(node_modules|dist|coverage|\.git)' -and
        (Test-Path $_)
    }
    
    return $relevantFiles
}

function Invoke-CodeFormattingChecks($files) {
    Write-Check "Running code formatting checks..."
    $startTime = Get-Date
    
    try {
        # Check Prettier formatting
        $prettierFiles = $files | Where-Object { $_ -match '\.(ts|js|json|md)$' }
        
        if ($prettierFiles.Count -gt 0) {
            $prettierArgs = @("--check") + $prettierFiles
            if ($Fix) {
                $prettierArgs = @("--write") + $prettierFiles
            }
            
            $prettierResult = & npx prettier $prettierArgs 2>&1
            $prettierExitCode = $LASTEXITCODE
            
            if ($prettierExitCode -eq 0) {
                if ($Fix) {
                    Add-QualityCheck "Code Formatting" "Fixed" "Prettier formatting applied to $($prettierFiles.Count) files"
                    Write-Fix "Code formatting fixed"
                } else {
                    Add-QualityCheck "Code Formatting" "Pass" "All files are properly formatted"
                    Write-Success "Code formatting ✓"
                }
            } else {
                $unformattedFiles = $prettierResult | Where-Object { $_ -match '^\[warn\]' } | ForEach-Object { 
                    ($_ -replace '^\[warn\]\s*', '') -replace '^\s*', ''
                }
                
                Add-QualityCheck "Code Formatting" "Fail" "Found $($unformattedFiles.Count) unformatted files" -Details $unformattedFiles
                Write-Error "Code formatting failed - run 'npm run format' to fix"
            }
        } else {
            Add-QualityCheck "Code Formatting" "Pass" "No relevant files to format"
        }
        
    } catch {
        Add-QualityCheck "Code Formatting" "Fail" "Formatting check failed: $($_.Exception.Message)"
        Write-Error "Formatting check error: $($_.Exception.Message)"
    }
    
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    $script:QualityResults.Checks[-1].Duration = $duration
}

function Invoke-LintingChecks($files) {
    Write-Check "Running ESLint checks..."
    $startTime = Get-Date
    
    try {
        $tsFiles = $files | Where-Object { $_ -match '\.(ts|js)$' }
        
        if ($tsFiles.Count -gt 0 -or $files.Count -eq 0) {
            $eslintArgs = @("src", "tests", "--ext", ".ts,.js", "--format", "json")
            if ($Fix) {
                $eslintArgs += "--fix"
            }
            
            $eslintResult = & npx eslint $eslintArgs 2>&1
            $eslintExitCode = $LASTEXITCODE
            
            try {
                $eslintJson = $eslintResult | ConvertFrom-Json
                $totalErrors = ($eslintJson | Measure-Object -Property errorCount -Sum).Sum
                $totalWarnings = ($eslintJson | Measure-Object -Property warningCount -Sum).Sum
                $fixableErrors = ($eslintJson | Measure-Object -Property fixableErrorCount -Sum).Sum
                $fixableWarnings = ($eslintJson | Measure-Object -Property fixableWarningCount -Sum).Sum
                
                if ($totalErrors -eq 0 -and $totalWarnings -eq 0) {
                    Add-QualityCheck "ESLint" "Pass" "No linting issues found"
                    Write-Success "ESLint ✓"
                } elseif ($totalErrors -eq 0) {
                    Add-QualityCheck "ESLint" "Warning" "$totalWarnings warnings found"
                    Write-Warning "ESLint: $totalWarnings warnings"
                } else {
                    $details = @()
                    foreach ($file in $eslintJson) {
                        if ($file.messages.Count -gt 0) {
                            $details += "$($file.filePath): $($file.errorCount) errors, $($file.warningCount) warnings"
                        }
                    }
                    
                    Add-QualityCheck "ESLint" "Fail" "$totalErrors errors, $totalWarnings warnings" -Details $details
                    Write-Error "ESLint: $totalErrors errors, $totalWarnings warnings"
                    
                    if ($Fix -and ($fixableErrors -gt 0 -or $fixableWarnings -gt 0)) {
                        Write-Fix "Fixed $fixableErrors errors and $fixableWarnings warnings"
                    }
                }
                
            } catch {
                # Fallback to text parsing if JSON parsing fails
                if ($eslintExitCode -eq 0) {
                    Add-QualityCheck "ESLint" "Pass" "No linting issues found"
                    Write-Success "ESLint ✓"
                } else {
                    Add-QualityCheck "ESLint" "Fail" "ESLint found issues"
                    Write-Error "ESLint found issues"
                }
            }
        } else {
            Add-QualityCheck "ESLint" "Pass" "No TypeScript/JavaScript files to lint"
        }
        
    } catch {
        Add-QualityCheck "ESLint" "Fail" "Linting failed: $($_.Exception.Message)"
        Write-Error "ESLint error: $($_.Exception.Message)"
    }
    
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    $script:QualityResults.Checks[-1].Duration = $duration
}

function Invoke-TypeChecks {
    Write-Check "Running TypeScript type checks..."
    $startTime = Get-Date
    
    try {
        $tscResult = & npx tsc --noEmit --skipLibCheck 2>&1
        $tscExitCode = $LASTEXITCODE
        
        if ($tscExitCode -eq 0) {
            Add-QualityCheck "TypeScript" "Pass" "No type errors found"
            Write-Success "TypeScript ✓"
        } else {
            $typeErrors = $tscResult | Where-Object { $_ -match 'error TS\d+:' }
            $errorCount = $typeErrors.Count
            
            Add-QualityCheck "TypeScript" "Fail" "$errorCount type errors found" -Details $typeErrors
            Write-Error "TypeScript: $errorCount type errors"
        }
        
    } catch {
        Add-QualityCheck "TypeScript" "Fail" "Type checking failed: $($_.Exception.Message)"
        Write-Error "TypeScript error: $($_.Exception.Message)"
    }
    
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    $script:QualityResults.Checks[-1].Duration = $duration
}

function Invoke-TestChecks($files) {
    if ($SkipTests) {
        Add-QualityCheck "Tests" "Pass" "Tests skipped by user request"
        return
    }
    
    Write-Check "Running test suite..."
    $startTime = Get-Date
    
    try {
        # Determine test strategy based on changed files
        $testFiles = $files | Where-Object { $_ -match '\.test\.(ts|js)$' }
        $sourceFiles = $files | Where-Object { $_ -match '\.(ts|js)$' -and $_ -notmatch '\.test\.(ts|js)$' }
        
        $jestArgs = @()
        
        if ($Stage -eq "pre-commit" -and ($testFiles.Count -gt 0 -or $sourceFiles.Count -gt 0)) {
            # Run related tests for changed files
            $jestArgs += @("--findRelatedTests") + $sourceFiles + $testFiles
        } else {
            # Run all tests
            $jestArgs += @("--passWithNoTests")
        }
        
        # Add coverage for CI stage
        if ($Stage -eq "ci") {
            $jestArgs += @("--coverage", "--coverageReporters", "text-summary")
        }
        
        $jestResult = & npx jest $jestArgs 2>&1
        $jestExitCode = $LASTEXITCODE
        
        # Parse test results
        $testSummary = $jestResult | Where-Object { $_ -match "Tests:|Tests\s+\d+" } | Select-Object -Last 1
        $coverageSummary = $jestResult | Where-Object { $_ -match "Coverage summary" } -Context 0, 10
        
        if ($jestExitCode -eq 0) {
            Add-QualityCheck "Tests" "Pass" "All tests passed" -Details @($testSummary)
            Write-Success "Tests ✓"
        } else {
            $failedTests = $jestResult | Where-Object { $_ -match "FAIL|FAILED" }
            Add-QualityCheck "Tests" "Fail" "Some tests failed" -Details $failedTests
            Write-Error "Tests failed"
        }
        
    } catch {
        Add-QualityCheck "Tests" "Fail" "Test execution failed: $($_.Exception.Message)"
        Write-Error "Test error: $($_.Exception.Message)"
    }
    
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    $script:QualityResults.Checks[-1].Duration = $duration
}

function Invoke-SecurityChecks($files) {
    Write-Check "Running security checks..."
    $startTime = Get-Date
    
    $securityIssues = @()
    
    try {
        # Check for common security patterns in code
        $securityPatterns = @{
            "Hardcoded secrets" = @(
                'password\s*[:=]\s*["\'][^"\']{8,}["\']',
                'api[_-]?key\s*[:=]\s*["\'][^"\']{20,}["\']',
                'secret\s*[:=]\s*["\'][^"\']{10,}["\']',
                'token\s*[:=]\s*["\'][^"\']{20,}["\']'
            )
            "SQL injection risks" = @(
                'query\s*\+\s*["\']',
                'SELECT.*\+.*\+',
                'INSERT.*\+.*\+'
            )
            "XSS vulnerabilities" = @(
                'innerHTML\s*=\s*.*\+',
                'document\.write\s*\('
            )
            "Insecure random" = @(
                'Math\.random\(\)',
                'new\s+Random\('
            )
        }
        
        $codeFiles = $files | Where-Object { $_ -match '\.(ts|js)$' }
        
        if ($codeFiles.Count -eq 0 -and $files.Count -eq 0) {
            $codeFiles = Get-ChildItem -Recurse -Include "*.ts", "*.js" -Path "src" -ErrorAction SilentlyContinue
        }
        
        foreach ($file in $codeFiles) {
            if (-not (Test-Path $file)) { continue }
            
            $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
            if (-not $content) { continue }
            
            foreach ($categoryName in $securityPatterns.Keys) {
                foreach ($pattern in $securityPatterns[$categoryName]) {
                    if ($content -match $pattern) {
                        $securityIssues += "$file: $categoryName - matched pattern: $pattern"
                    }
                }
            }
        }
        
        # Check npm audit
        Write-Check "Running npm audit..."
        try {
            $auditResult = npm audit --json 2>$null
            if ($auditResult) {
                $auditJson = $auditResult | ConvertFrom-Json -ErrorAction SilentlyContinue
                if ($auditJson -and $auditJson.vulnerabilities) {
                    $vulnCount = ($auditJson.vulnerabilities | Get-Member -MemberType NoteProperty).Count
                    if ($vulnCount -gt 0) {
                        $securityIssues += "npm audit found $vulnCount vulnerabilities"
                    }
                }
            }
        } catch {
            # npm audit might fail in some environments
            if ($Verbose) {
                Write-Warning "npm audit check failed: $($_.Exception.Message)"
            }
        }
        
        # Check for .env files in git
        $envFiles = git ls-files "*.env*" 2>$null
        if ($envFiles) {
            foreach ($envFile in $envFiles) {
                $securityIssues += "Environment file tracked in git: $envFile"
            }
        }
        
        if ($securityIssues.Count -eq 0) {
            Add-QualityCheck "Security" "Pass" "No security issues detected"
            Write-Success "Security ✓"
        } else {
            Add-QualityCheck "Security" "Warning" "$($securityIssues.Count) potential security issues" -Details $securityIssues
            Write-Warning "Security: $($securityIssues.Count) potential issues found"
        }
        
    } catch {
        Add-QualityCheck "Security" "Fail" "Security check failed: $($_.Exception.Message)"
        Write-Error "Security check error: $($_.Exception.Message)"
    }
    
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    $script:QualityResults.Checks[-1].Duration = $duration
}

function Invoke-DependencyChecks {
    Write-Check "Checking dependencies..."
    $startTime = Get-Date
    
    try {
        # Check for outdated dependencies
        $outdatedResult = npm outdated --json 2>$null
        $outdatedPackages = @()
        
        if ($outdatedResult) {
            try {
                $outdatedJson = $outdatedResult | ConvertFrom-Json
                $outdatedPackages = $outdatedJson.PSObject.Properties.Name
            } catch {
                # Ignore JSON parsing errors
            }
        }
        
        # Check for unused dependencies
        $unusedDeps = @()
        try {
            $depcheckResult = npx depcheck --json 2>$null
            if ($depcheckResult) {
                $depcheckJson = $depcheckResult | ConvertFrom-Json
                $unusedDeps = $depcheckJson.dependencies
            }
        } catch {
            # depcheck might not be available
        }
        
        $issues = @()
        if ($outdatedPackages.Count -gt 0) {
            $issues += "$($outdatedPackages.Count) outdated packages: $($outdatedPackages[0..4] -join ', ')"
        }
        if ($unusedDeps.Count -gt 0) {
            $issues += "$($unusedDeps.Count) potentially unused dependencies"
        }
        
        if ($issues.Count -eq 0) {
            Add-QualityCheck "Dependencies" "Pass" "Dependencies are up to date"
            Write-Success "Dependencies ✓"
        } else {
            Add-QualityCheck "Dependencies" "Warning" "Dependency issues found" -Details $issues
            Write-Warning "Dependencies: issues found"
        }
        
    } catch {
        Add-QualityCheck "Dependencies" "Warning" "Dependency check failed: $($_.Exception.Message)"
        Write-Warning "Dependency check error: $($_.Exception.Message)"
    }
    
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    $script:QualityResults.Checks[-1].Duration = $duration
}

function Invoke-PerformanceChecks($files) {
    Write-Check "Running performance checks..."
    $startTime = Get-Date
    
    try {
        $performanceIssues = @()
        
        $codeFiles = $files | Where-Object { $_ -match '\.(ts|js)$' }
        
        # Performance anti-patterns
        $performancePatterns = @{
            "Synchronous file operations" = @('fs\.readFileSync', 'fs\.writeFileSync')
            "Blocking operations in loops" = @('for\s*\([^)]*\)\s*{[^}]*await')
            "Memory leaks" = @('setInterval\s*\([^}]*\}[^}]*$', 'addEventListener.*(?!removeEventListener)')
            "Large object creation in loops" = @('for\s*\([^)]*\)\s*{[^}]*new\s+(Object|Array)')
        }
        
        foreach ($file in $codeFiles) {
            if (-not (Test-Path $file)) { continue }
            
            $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
            if (-not $content) { continue }
            
            foreach ($categoryName in $performancePatterns.Keys) {
                foreach ($pattern in $performancePatterns[$categoryName]) {
                    if ($content -match $pattern) {
                        $performanceIssues += "$file: $categoryName"
                    }
                }
            }
        }
        
        # Check bundle size (if dist exists)
        $bundleSize = 0
        if (Test-Path "dist") {
            $distFiles = Get-ChildItem -Recurse -File "dist" -ErrorAction SilentlyContinue
            $bundleSize = ($distFiles | Measure-Object -Property Length -Sum).Sum
            
            if ($bundleSize -gt 50MB) {
                $performanceIssues += "Large bundle size: $([math]::Round($bundleSize / 1MB, 2))MB"
            }
        }
        
        if ($performanceIssues.Count -eq 0) {
            Add-QualityCheck "Performance" "Pass" "No performance issues detected"
            Write-Success "Performance ✓"
        } else {
            Add-QualityCheck "Performance" "Warning" "$($performanceIssues.Count) potential performance issues" -Details $performanceIssues
            Write-Warning "Performance: $($performanceIssues.Count) potential issues"
        }
        
    } catch {
        Add-QualityCheck "Performance" "Warning" "Performance check failed: $($_.Exception.Message)"
        Write-Warning "Performance check error: $($_.Exception.Message)"
    }
    
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    $script:QualityResults.Checks[-1].Duration = $duration
}

function Invoke-DocumentationChecks($files) {
    Write-Check "Checking documentation..."
    $startTime = Get-Date
    
    try {
        $docIssues = @()
        
        # Check for README
        if (-not (Test-Path "README.md")) {
            $docIssues += "Missing README.md file"
        }
        
        # Check TypeScript files for JSDoc comments
        $tsFiles = $files | Where-Object { $_ -match '\.ts$' -and $_ -match 'src/' }
        
        foreach ($file in $tsFiles) {
            if (-not (Test-Path $file)) { continue }
            
            $content = Get-Content $file -Raw -ErrorAction SilentlyContinue
            if (-not $content) { continue }
            
            # Check for exported functions without JSDoc
            $exportedFunctions = [regex]::Matches($content, 'export\s+(function|class|interface)\s+(\w+)')
            $jsdocBlocks = [regex]::Matches($content, '/\*\*[\s\S]*?\*/')
            
            if ($exportedFunctions.Count -gt $jsdocBlocks.Count) {
                $docIssues += "$file: Missing documentation for exported members"
            }
        }
        
        if ($docIssues.Count -eq 0) {
            Add-QualityCheck "Documentation" "Pass" "Documentation checks passed"
            Write-Success "Documentation ✓"
        } else {
            Add-QualityCheck "Documentation" "Warning" "Documentation issues found" -Details $docIssues
            Write-Warning "Documentation: issues found"
        }
        
    } catch {
        Add-QualityCheck "Documentation" "Warning" "Documentation check failed: $($_.Exception.Message)"
        Write-Warning "Documentation check error: $($_.Exception.Message)"
    }
    
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    $script:QualityResults.Checks[-1].Duration = $duration
}

function Invoke-BuildChecks {
    Write-Check "Running build checks..."
    $startTime = Get-Date
    
    try {
        $buildResult = npm run build 2>&1
        $buildExitCode = $LASTEXITCODE
        
        if ($buildExitCode -eq 0) {
            Add-QualityCheck "Build" "Pass" "Build completed successfully"
            Write-Success "Build ✓"
        } else {
            $buildErrors = $buildResult | Where-Object { $_ -match 'error|Error|ERROR' }
            Add-QualityCheck "Build" "Fail" "Build failed" -Details $buildErrors
            Write-Error "Build failed"
        }
        
    } catch {
        Add-QualityCheck "Build" "Fail" "Build check failed: $($_.Exception.Message)"
        Write-Error "Build error: $($_.Exception.Message)"
    }
    
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    $script:QualityResults.Checks[-1].Duration = $duration
}

function Invoke-IntegrationChecks {
    Write-Check "Running integration tests..."
    $startTime = Get-Date
    
    try {
        if (Test-Path "tests/integration") {
            $integrationResult = npx jest tests/integration --passWithNoTests 2>&1
            $integrationExitCode = $LASTEXITCODE
            
            if ($integrationExitCode -eq 0) {
                Add-QualityCheck "Integration Tests" "Pass" "Integration tests passed"
                Write-Success "Integration tests ✓"
            } else {
                Add-QualityCheck "Integration Tests" "Fail" "Integration tests failed"
                Write-Error "Integration tests failed"
            }
        } else {
            Add-QualityCheck "Integration Tests" "Pass" "No integration tests found"
        }
        
    } catch {
        Add-QualityCheck "Integration Tests" "Fail" "Integration test check failed: $($_.Exception.Message)"
        Write-Error "Integration test error: $($_.Exception.Message)"
    }
    
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    $script:QualityResults.Checks[-1].Duration = $duration
}

function Invoke-CoverageChecks {
    Write-Check "Checking test coverage..."
    $startTime = Get-Date
    
    try {
        $coverageResult = npm run test:coverage 2>&1
        $coverageExitCode = $LASTEXITCODE
        
        # Parse coverage percentage
        $coverageLine = $coverageResult | Where-Object { $_ -match 'All files.*\d+\.\d+' } | Select-Object -Last 1
        $coveragePercent = 0
        
        if ($coverageLine -match '(\d+\.\d+)%') {
            $coveragePercent = [double]$matches[1]
        }
        
        $minCoverage = 80.0  # Configurable threshold
        
        if ($coveragePercent -ge $minCoverage) {
            Add-QualityCheck "Coverage" "Pass" "Coverage: $($coveragePercent)% (>= $minCoverage%)"
            Write-Success "Coverage: $($coveragePercent)% ✓"
        } else {
            Add-QualityCheck "Coverage" "Warning" "Coverage: $($coveragePercent)% (< $minCoverage%)"
            Write-Warning "Coverage: $($coveragePercent)% below threshold"
        }
        
    } catch {
        Add-QualityCheck "Coverage" "Warning" "Coverage check failed: $($_.Exception.Message)"
        Write-Warning "Coverage check error: $($_.Exception.Message)"
    }
    
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    $script:QualityResults.Checks[-1].Duration = $duration
}

function Invoke-LicenseChecks {
    Write-Check "Checking licenses..."
    $startTime = Get-Date
    
    try {
        # Simple license check - could be enhanced with license-checker
        $packageJson = Get-Content "package.json" | ConvertFrom-Json -ErrorAction SilentlyContinue
        
        if ($packageJson -and $packageJson.license) {
            Add-QualityCheck "License" "Pass" "License specified: $($packageJson.license)"
            Write-Success "License ✓"
        } else {
            Add-QualityCheck "License" "Warning" "No license specified in package.json"
            Write-Warning "No license specified"
        }
        
    } catch {
        Add-QualityCheck "License" "Warning" "License check failed: $($_.Exception.Message)"
        Write-Warning "License check error: $($_.Exception.Message)"
    }
    
    $duration = ((Get-Date) - $startTime).TotalMilliseconds
    $script:QualityResults.Checks[-1].Duration = $duration
}

function Show-QualityReport {
    Write-Host ""
    Write-Success "📋 QUALITY GATE RESULTS"
    Write-Host "========================" -ForegroundColor Magenta
    Write-Host ""
    
    $summary = $script:QualityResults.Summary
    
    Write-Info "Summary:"
    Write-Host "   Total Checks: $($summary.TotalChecks)"
    Write-Host "   Passed: $($summary.PassedChecks)" -ForegroundColor Green
    Write-Host "   Failed: $($summary.FailedChecks)" -ForegroundColor Red
    Write-Host "   Warnings: $($summary.WarningChecks)" -ForegroundColor Yellow
    Write-Host "   Fixed: $($summary.FixedIssues)" -ForegroundColor Magenta
    Write-Host "   Duration: $($summary.Duration.ToString('F1'))s"
    Write-Host ""
    
    # Show detailed results
    if ($Verbose -or $summary.FailedChecks -gt 0 -or $summary.WarningChecks -gt 0) {
        Write-Info "Detailed Results:"
        foreach ($check in $script:QualityResults.Checks) {
            $icon = switch ($check.Status) {
                "Pass" { "✅" }
                "Fail" { "❌" }
                "Warning" { "⚠️ " }
                "Fixed" { "🔧" }
            }
            
            $color = switch ($check.Status) {
                "Pass" { "Green" }
                "Fail" { "Red" }
                "Warning" { "Yellow" }
                "Fixed" { "Magenta" }
            }
            
            Write-Host "   $icon $($check.Name): $($check.Message)" -ForegroundColor $color
            
            if ($Verbose -and $check.Details.Count -gt 0) {
                foreach ($detail in $check.Details[0..2]) {  # Show first 3 details
                    Write-Host "      $detail" -ForegroundColor Gray
                }
                if ($check.Details.Count -gt 3) {
                    Write-Host "      ... and $($check.Details.Count - 3) more" -ForegroundColor Gray
                }
            }
        }
        Write-Host ""
    }
    
    # Show recommendations
    if ($summary.FailedChecks -gt 0) {
        Write-Info "🔧 Recommended Actions:"
        
        if ($script:QualityResults.Errors | Where-Object { $_.Name -eq "Code Formatting" }) {
            Write-Host "   • Run: npm run format" -ForegroundColor Cyan
        }
        if ($script:QualityResults.Errors | Where-Object { $_.Name -eq "ESLint" }) {
            Write-Host "   • Run: npm run lint:fix" -ForegroundColor Cyan
        }
        if ($script:QualityResults.Errors | Where-Object { $_.Name -eq "TypeScript" }) {
            Write-Host "   • Fix TypeScript errors before committing" -ForegroundColor Cyan
        }
        if ($script:QualityResults.Errors | Where-Object { $_.Name -eq "Tests" }) {
            Write-Host "   • Fix failing tests: npm test" -ForegroundColor Cyan
        }
        Write-Host ""
    }
    
    # Final verdict
    if ($summary.FailedChecks -eq 0) {
        Write-Success "🎉 All quality checks passed! Code is ready."
    } else {
        Write-Error "💥 Quality gate failed. Please fix the issues above."
    }
    Write-Host ""
}

# Main execution
try {
    $exitCode = Start-QualityGate
    exit $exitCode
} catch {
    Write-Error "Quality gate execution failed: $($_.Exception.Message)"
    exit 1
}