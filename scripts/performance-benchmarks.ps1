#Requires -Version 7.0

<#
.SYNOPSIS
    Comprehensive Performance Benchmarking Suite for Unified PIM MCP
    
.DESCRIPTION
    Advanced performance benchmarking and load testing system that establishes
    baseline metrics, identifies bottlenecks, and provides optimization insights
    for maximum development productivity.
    
.PARAMETER Suite
    Benchmark suite to run: all, memory, api, database, integration
    
.PARAMETER Duration
    Test duration in seconds (default: 60)
    
.PARAMETER Concurrency
    Number of concurrent operations (default: 10)
    
.PARAMETER Output
    Output format: console, json, html, all
    
.PARAMETER Baseline
    Save results as new baseline

.EXAMPLE
    .\performance-benchmarks.ps1 -Suite all -Duration 120 -Output html
    
.EXAMPLE
    .\performance-benchmarks.ps1 -Suite memory -Baseline
#>

[CmdletBinding()]
param(
    [Parameter(HelpMessage = "Benchmark suite to run")]
    [ValidateSet("all", "memory", "api", "database", "integration", "stress")]
    [string]$Suite = "all",
    
    [Parameter(HelpMessage = "Test duration in seconds")]
    [int]$Duration = 60,
    
    [Parameter(HelpMessage = "Concurrent operations")]
    [int]$Concurrency = 10,
    
    [Parameter(HelpMessage = "Output format")]
    [ValidateSet("console", "json", "html", "all")]
    [string]$Output = "console",
    
    [Parameter(HelpMessage = "Save as baseline")]
    [switch]$Baseline
)

# Color output functions
function Write-Success { param([string]$Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host "ℹ️  $Message" -ForegroundColor Cyan }
function Write-Warning { param([string]$Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param([string]$Message) Write-Host "❌ $Message" -ForegroundColor Red }
function Write-Benchmark { param([string]$Message) Write-Host "📊 $Message" -ForegroundColor Blue }
function Write-Performance { param([string]$Message) Write-Host "🚀 $Message" -ForegroundColor Magenta }

# Benchmark results storage
$script:BenchmarkResults = @{
    Metadata = @{
        Timestamp = Get-Date
        Suite = $Suite
        Duration = $Duration
        Concurrency = $Concurrency
        Environment = @{
            NodeVersion = ""
            Platform = $env:OS
            Memory = ""
            CPU = ""
        }
    }
    Results = @{}
    Baselines = @{}
    Summary = @{
        TotalTests = 0
        PassedTests = 0
        FailedTests = 0
        TotalDuration = 0
        OverallScore = 0
    }
}

function Start-PerformanceBenchmarks {
    Write-Host ""
    Write-Performance "🚀 COMPREHENSIVE PERFORMANCE BENCHMARKING"
    Write-Host "===========================================" -ForegroundColor Magenta
    Write-Host ""
    
    Write-Info "Configuration:"
    Write-Host "   Suite: $Suite"
    Write-Host "   Duration: $Duration seconds"
    Write-Host "   Concurrency: $Concurrency"
    Write-Host "   Output: $Output"
    Write-Host "   Baseline: $($Baseline.IsPresent)"
    Write-Host ""
    
    # Initialize environment info
    Initialize-EnvironmentInfo
    
    # Load existing baselines
    Load-Baselines
    
    # Start benchmarking
    $totalStart = Get-Date
    
    switch ($Suite.ToLower()) {
        "all" {
            Invoke-MemoryBenchmarks
            Invoke-ApiBenchmarks
            Invoke-DatabaseBenchmarks
            Invoke-IntegrationBenchmarks
        }
        "memory" { Invoke-MemoryBenchmarks }
        "api" { Invoke-ApiBenchmarks }
        "database" { Invoke-DatabaseBenchmarks }
        "integration" { Invoke-IntegrationBenchmarks }
        "stress" { Invoke-StressBenchmarks }
    }
    
    $script:BenchmarkResults.Summary.TotalDuration = ((Get-Date) - $totalStart).TotalSeconds
    
    # Generate reports
    Generate-BenchmarkReport
    
    # Save baseline if requested
    if ($Baseline) {
        Save-Baseline
    }
    
    # Show summary
    Show-BenchmarkSummary
}

function Initialize-EnvironmentInfo {
    Write-Benchmark "Collecting environment information..."
    
    try {
        $script:BenchmarkResults.Metadata.Environment.NodeVersion = node --version
    } catch {
        $script:BenchmarkResults.Metadata.Environment.NodeVersion = "Unknown"
    }
    
    try {
        $memInfo = Get-CimInstance -ClassName Win32_ComputerSystem
        $script:BenchmarkResults.Metadata.Environment.Memory = "$([math]::Round($memInfo.TotalPhysicalMemory / 1GB, 1)) GB"
    } catch {
        $script:BenchmarkResults.Metadata.Environment.Memory = "Unknown"
    }
    
    try {
        $cpuInfo = Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1
        $script:BenchmarkResults.Metadata.Environment.CPU = $cpuInfo.Name
    } catch {
        $script:BenchmarkResults.Metadata.Environment.CPU = "Unknown"
    }
}

function Load-Baselines {
    $baselineFile = "performance-baselines.json"
    
    if (Test-Path $baselineFile) {
        try {
            $content = Get-Content $baselineFile -Raw | ConvertFrom-Json
            $script:BenchmarkResults.Baselines = $content
            Write-Success "Loaded existing baselines"
        } catch {
            Write-Warning "Could not load baselines: $($_.Exception.Message)"
        }
    } else {
        Write-Info "No existing baselines found"
    }
}

function Invoke-MemoryBenchmarks {
    Write-Benchmark "Running memory benchmarks..."
    
    $memoryResults = @{
        TestName = "Memory Performance"
        StartTime = Get-Date
        Metrics = @{}
        Status = "Running"
    }
    
    try {
        # Baseline memory usage
        $baselineMemory = Get-ProcessMemory
        Write-Info "Baseline memory: $($baselineMemory.WorkingSet) MB"
        
        # Memory allocation test
        Write-Info "Testing memory allocation patterns..."
        $allocationStart = Get-Date
        $allocations = @()
        
        for ($i = 0; $i -lt 1000; $i++) {
            $allocations += New-Object byte[] 1048576  # 1MB allocations
            if ($i % 100 -eq 0) {
                [System.GC]::Collect()
                [System.GC]::WaitForPendingFinalizers()
            }
        }
        
        $allocationTime = ((Get-Date) - $allocationStart).TotalMilliseconds
        $peakMemory = Get-ProcessMemory
        
        # Memory cleanup test
        Write-Info "Testing memory cleanup..."
        $cleanupStart = Get-Date
        $allocations = $null
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
        [System.GC]::Collect()
        
        $cleanupTime = ((Get-Date) - $cleanupStart).TotalMilliseconds
        $postCleanupMemory = Get-ProcessMemory
        
        # ChromaDB memory test
        Write-Info "Testing ChromaDB memory usage..."
        $chromaMemoryTest = Test-ChromaDBMemory
        
        # Populate results
        $memoryResults.Metrics = @{
            BaselineMemory = $baselineMemory.WorkingSet
            PeakMemory = $peakMemory.WorkingSet
            PostCleanupMemory = $postCleanupMemory.WorkingSet
            AllocationTime = $allocationTime
            CleanupTime = $cleanupTime
            MemoryLeakage = $postCleanupMemory.WorkingSet - $baselineMemory.WorkingSet
            ChromaDBMemory = $chromaMemoryTest
            GCCollections = [System.GC]::CollectionCount(0) + [System.GC]::CollectionCount(1) + [System.GC]::CollectionCount(2)
        }
        
        $memoryResults.Status = "Completed"
        $memoryResults.Duration = ((Get-Date) - $memoryResults.StartTime).TotalSeconds
        
        # Evaluate performance
        $memoryScore = Evaluate-MemoryPerformance $memoryResults.Metrics
        $memoryResults.Score = $memoryScore
        
        Write-Success "Memory benchmarks completed (Score: $memoryScore/100)"
        
    } catch {
        $memoryResults.Status = "Failed"
        $memoryResults.Error = $_.Exception.Message
        Write-Error "Memory benchmarks failed: $($_.Exception.Message)"
    }
    
    $script:BenchmarkResults.Results["Memory"] = $memoryResults
    $script:BenchmarkResults.Summary.TotalTests++
    
    if ($memoryResults.Status -eq "Completed") {
        $script:BenchmarkResults.Summary.PassedTests++
    } else {
        $script:BenchmarkResults.Summary.FailedTests++
    }
}

function Invoke-ApiBenchmarks {
    Write-Benchmark "Running API benchmarks..."
    
    $apiResults = @{
        TestName = "API Performance"
        StartTime = Get-Date
        Metrics = @{}
        Status = "Running"
    }
    
    try {
        # Ensure MCP server is running
        $serverProcess = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
            $_.ProcessName -eq "node" -and $_.MainWindowTitle -like "*tsx*"
        }
        
        if (-not $serverProcess) {
            Write-Info "Starting MCP server for benchmarks..."
            $serverProcess = Start-Process -FilePath "npx" -ArgumentList @("tsx", "src/index.ts") -PassThru -WindowStyle Hidden
            Start-Sleep -Seconds 5
        }
        
        # API response time test
        Write-Info "Testing API response times..."
        $responseTimeResults = Test-APIResponseTimes
        
        # Throughput test
        Write-Info "Testing API throughput..."
        $throughputResults = Test-APIThroughput $Concurrency $Duration
        
        # Load test
        Write-Info "Running API load test..."
        $loadTestResults = Test-APILoadHandling $Concurrency
        
        # Error handling test
        Write-Info "Testing API error handling..."
        $errorHandlingResults = Test-APIErrorHandling
        
        # Populate results
        $apiResults.Metrics = @{
            AverageResponseTime = $responseTimeResults.AverageResponseTime
            MedianResponseTime = $responseTimeResults.MedianResponseTime
            P95ResponseTime = $responseTimeResults.P95ResponseTime
            P99ResponseTime = $responseTimeResults.P99ResponseTime
            MaxThroughput = $throughputResults.MaxThroughput
            AverageThroughput = $throughputResults.AverageThroughput
            ErrorRate = $throughputResults.ErrorRate
            ConcurrentHandling = $loadTestResults.ConcurrentRequests
            MemoryUnderLoad = $loadTestResults.MemoryUsage
            ErrorHandling = $errorHandlingResults
        }
        
        $apiResults.Status = "Completed"
        $apiResults.Duration = ((Get-Date) - $apiResults.StartTime).TotalSeconds
        
        # Evaluate performance
        $apiScore = Evaluate-APIPerformance $apiResults.Metrics
        $apiResults.Score = $apiScore
        
        Write-Success "API benchmarks completed (Score: $apiScore/100)"
        
    } catch {
        $apiResults.Status = "Failed"
        $apiResults.Error = $_.Exception.Message
        Write-Error "API benchmarks failed: $($_.Exception.Message)"
    }
    
    $script:BenchmarkResults.Results["API"] = $apiResults
    $script:BenchmarkResults.Summary.TotalTests++
    
    if ($apiResults.Status -eq "Completed") {
        $script:BenchmarkResults.Summary.PassedTests++
    } else {
        $script:BenchmarkResults.Summary.FailedTests++
    }
}

function Invoke-DatabaseBenchmarks {
    Write-Benchmark "Running database benchmarks..."
    
    $dbResults = @{
        TestName = "Database Performance"
        StartTime = Get-Date
        Metrics = @{}
        Status = "Running"
    }
    
    try {
        # Test ChromaDB performance
        Write-Info "Testing ChromaDB query performance..."
        $chromaResults = Test-ChromaDBPerformance
        
        # Test Redis performance
        Write-Info "Testing Redis cache performance..."
        $redisResults = Test-RedisPerformance
        
        # Test PostgreSQL performance
        Write-Info "Testing PostgreSQL performance..."
        $postgresResults = Test-PostgreSQLPerformance
        
        # Populate results
        $dbResults.Metrics = @{
            ChromaDB = $chromaResults
            Redis = $redisResults
            PostgreSQL = $postgresResults
        }
        
        $dbResults.Status = "Completed"
        $dbResults.Duration = ((Get-Date) - $dbResults.StartTime).TotalSeconds
        
        # Evaluate performance
        $dbScore = Evaluate-DatabasePerformance $dbResults.Metrics
        $dbResults.Score = $dbScore
        
        Write-Success "Database benchmarks completed (Score: $dbScore/100)"
        
    } catch {
        $dbResults.Status = "Failed"
        $dbResults.Error = $_.Exception.Message
        Write-Error "Database benchmarks failed: $($_.Exception.Message)"
    }
    
    $script:BenchmarkResults.Results["Database"] = $dbResults
    $script:BenchmarkResults.Summary.TotalTests++
    
    if ($dbResults.Status -eq "Completed") {
        $script:BenchmarkResults.Summary.PassedTests++
    } else {
        $script:BenchmarkResults.Summary.FailedTests++
    }
}

function Invoke-IntegrationBenchmarks {
    Write-Benchmark "Running integration benchmarks..."
    
    $integrationResults = @{
        TestName = "Integration Performance"
        StartTime = Get-Date
        Metrics = @{}
        Status = "Running"
    }
    
    try {
        # End-to-end workflow test
        Write-Info "Testing end-to-end workflow performance..."
        $e2eResults = Test-E2EWorkflowPerformance
        
        # Microsoft Graph simulation
        Write-Info "Testing Microsoft Graph integration performance..."
        $graphResults = Test-GraphIntegrationPerformance
        
        # Authentication flow test
        Write-Info "Testing authentication flow performance..."
        $authResults = Test-AuthenticationPerformance
        
        # Populate results
        $integrationResults.Metrics = @{
            EndToEndWorkflow = $e2eResults
            GraphIntegration = $graphResults
            Authentication = $authResults
        }
        
        $integrationResults.Status = "Completed"
        $integrationResults.Duration = ((Get-Date) - $integrationResults.StartTime).TotalSeconds
        
        # Evaluate performance
        $integrationScore = Evaluate-IntegrationPerformance $integrationResults.Metrics
        $integrationResults.Score = $integrationScore
        
        Write-Success "Integration benchmarks completed (Score: $integrationScore/100)"
        
    } catch {
        $integrationResults.Status = "Failed"
        $integrationResults.Error = $_.Exception.Message
        Write-Error "Integration benchmarks failed: $($_.Exception.Message)"
    }
    
    $script:BenchmarkResults.Results["Integration"] = $integrationResults
    $script:BenchmarkResults.Summary.TotalTests++
    
    if ($integrationResults.Status -eq "Completed") {
        $script:BenchmarkResults.Summary.PassedTests++
    } else {
        $script:BenchmarkResults.Summary.FailedTests++
    }
}

# Helper functions for specific benchmarks
function Get-ProcessMemory {
    $process = Get-Process -Id $PID
    return @{
        WorkingSet = [math]::Round($process.WorkingSet64 / 1MB, 2)
        PrivateMemorySize = [math]::Round($process.PrivateMemorySize64 / 1MB, 2)
        VirtualMemorySize = [math]::Round($process.VirtualMemorySize64 / 1MB, 2)
    }
}

function Test-ChromaDBMemory {
    try {
        # Simulate ChromaDB operations
        $operations = 100
        $startMemory = Get-ProcessMemory
        
        for ($i = 0; $i -lt $operations; $i++) {
            # Simulate vector operations
            $vectors = @()
            for ($j = 0; $j -lt 100; $j++) {
                $vectors += [Array]::CreateInstance([double], 384)
            }
        }
        
        $endMemory = Get-ProcessMemory
        
        return @{
            MemoryIncrease = $endMemory.WorkingSet - $startMemory.WorkingSet
            Operations = $operations
        }
    } catch {
        return @{ Error = $_.Exception.Message }
    }
}

function Test-APIResponseTimes {
    $urls = @(
        "http://localhost:8080/health",
        "http://localhost:8080/api/status"
    )
    
    $responseTimes = @()
    
    foreach ($url in $urls) {
        for ($i = 0; $i -lt 10; $i++) {
            try {
                $start = Get-Date
                $response = Invoke-WebRequest -Uri $url -TimeoutSec 5 -ErrorAction Stop
                $duration = ((Get-Date) - $start).TotalMilliseconds
                $responseTimes += $duration
            } catch {
                $responseTimes += 5000  # Timeout value
            }
        }
    }
    
    $sortedTimes = $responseTimes | Sort-Object
    
    return @{
        AverageResponseTime = ($responseTimes | Measure-Object -Average).Average
        MedianResponseTime = $sortedTimes[[math]::Floor($sortedTimes.Count / 2)]
        P95ResponseTime = $sortedTimes[[math]::Floor($sortedTimes.Count * 0.95)]
        P99ResponseTime = $sortedTimes[[math]::Floor($sortedTimes.Count * 0.99)]
    }
}

function Test-APIThroughput {
    param([int]$Concurrency, [int]$Duration)
    
    $jobs = @()
    $results = @()
    $endTime = (Get-Date).AddSeconds($Duration)
    
    # Start concurrent jobs
    for ($i = 0; $i -lt $Concurrency; $i++) {
        $job = Start-Job -ScriptBlock {
            param($EndTime)
            
            $requests = 0
            $errors = 0
            
            while ((Get-Date) -lt $EndTime) {
                try {
                    $response = Invoke-WebRequest -Uri "http://localhost:8080/health" -TimeoutSec 2
                    $requests++
                } catch {
                    $errors++
                }
            }
            
            return @{ Requests = $requests; Errors = $errors }
        } -ArgumentList $endTime
        
        $jobs += $job
    }
    
    # Wait for jobs to complete
    $jobs | Wait-Job | ForEach-Object {
        $result = Receive-Job $_
        $results += $result
        Remove-Job $_
    }
    
    $totalRequests = ($results | Measure-Object -Property Requests -Sum).Sum
    $totalErrors = ($results | Measure-Object -Property Errors -Sum).Sum
    
    return @{
        MaxThroughput = $totalRequests / $Duration
        AverageThroughput = $totalRequests / $Duration
        ErrorRate = if ($totalRequests -gt 0) { ($totalErrors / $totalRequests) * 100 } else { 0 }
        TotalRequests = $totalRequests
        TotalErrors = $totalErrors
    }
}

function Generate-BenchmarkReport {
    Write-Benchmark "Generating benchmark report..."
    
    $reportDir = "performance-reports"
    if (-not (Test-Path $reportDir)) {
        New-Item -ItemType Directory -Path $reportDir | Out-Null
    }
    
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    
    # Generate JSON report
    if ($Output -eq "json" -or $Output -eq "all") {
        $jsonFile = "$reportDir\benchmark-$timestamp.json"
        $script:BenchmarkResults | ConvertTo-Json -Depth 10 | Set-Content $jsonFile -Encoding UTF8
        Write-Success "JSON report saved to: $jsonFile"
    }
    
    # Generate HTML report
    if ($Output -eq "html" -or $Output -eq "all") {
        $htmlFile = "$reportDir\benchmark-$timestamp.html"
        $htmlContent = Generate-HTMLReport
        $htmlContent | Set-Content $htmlFile -Encoding UTF8
        Write-Success "HTML report saved to: $htmlFile"
        
        if ($Output -eq "html") {
            Start-Process $htmlFile
        }
    }
    
    # Console report is always shown
    Show-ConsoleReport
}

function Generate-HTMLReport {
    # HTML report template with charts and detailed analysis
    $html = @"
<!DOCTYPE html>
<html>
<head>
    <title>Unified PIM MCP - Performance Benchmark Report</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; }
        .metric-card { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .metric-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #333; }
        .metric-value { font-size: 24px; font-weight: bold; color: #667eea; }
        .score { font-size: 36px; font-weight: bold; margin: 10px 0; }
        .score.excellent { color: #4caf50; }
        .score.good { color: #ff9800; }
        .score.poor { color: #f44336; }
        .chart-container { width: 100%; height: 300px; margin: 20px 0; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
        .status-pass { color: #4caf50; font-weight: bold; }
        .status-fail { color: #f44336; font-weight: bold; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🚀 Performance Benchmark Report</h1>
        <p>Generated: $((Get-Date).ToString("yyyy-MM-dd HH:mm:ss"))</p>
        <p>Suite: $($script:BenchmarkResults.Metadata.Suite) | Duration: $($script:BenchmarkResults.Metadata.Duration)s | Environment: $($script:BenchmarkResults.Metadata.Environment.NodeVersion)</p>
    </div>
    
    <div class="metrics-grid">
        <div class="metric-card">
            <div class="metric-title">📊 Overall Performance Score</div>
            <div class="score $((Get-ScoreClass $script:BenchmarkResults.Summary.OverallScore))">
                $($script:BenchmarkResults.Summary.OverallScore)/100
            </div>
            <div>Tests: $($script:BenchmarkResults.Summary.PassedTests)/$($script:BenchmarkResults.Summary.TotalTests) passed</div>
        </div>
"@
    
    # Add individual test results
    foreach ($testName in $script:BenchmarkResults.Results.Keys) {
        $test = $script:BenchmarkResults.Results[$testName]
        $html += @"
        <div class="metric-card">
            <div class="metric-title">$testName Performance</div>
            <div class="score $((Get-ScoreClass $test.Score))">$($test.Score)/100</div>
            <div>Status: <span class="status-$(if ($test.Status -eq 'Completed') {'pass'} else {'fail'})">$($test.Status)</span></div>
            <div>Duration: $($test.Duration.ToString('F2'))s</div>
        </div>
"@
    }
    
    $html += @"
    </div>
    
    <div class="metric-card">
        <div class="metric-title">📈 Performance Trends</div>
        <div class="chart-container">
            <canvas id="performanceChart"></canvas>
        </div>
    </div>
    
    <script>
        // Performance chart
        const ctx = document.getElementById('performanceChart').getContext('2d');
        const chart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: [$(($script:BenchmarkResults.Results.Keys | ForEach-Object { "'$_'" }) -join ', ')],
                datasets: [{
                    label: 'Performance Scores',
                    data: [$(($script:BenchmarkResults.Results.Values | ForEach-Object { $_.Score }) -join ', ')],
                    borderColor: 'rgb(102, 126, 234)',
                    backgroundColor: 'rgba(102, 126, 234, 0.2)',
                }]
            },
            options: {
                scales: {
                    r: {
                        min: 0,
                        max: 100
                    }
                }
            }
        });
    </script>
</body>
</html>
"@
    
    return $html
}

function Show-BenchmarkSummary {
    Write-Host ""
    Write-Performance "📊 BENCHMARK RESULTS SUMMARY"
    Write-Host "=============================" -ForegroundColor Magenta
    Write-Host ""
    
    # Calculate overall score
    $scores = $script:BenchmarkResults.Results.Values | Where-Object { $_.Score } | ForEach-Object { $_.Score }
    $overallScore = if ($scores.Count -gt 0) { [math]::Round(($scores | Measure-Object -Average).Average, 1) } else { 0 }
    $script:BenchmarkResults.Summary.OverallScore = $overallScore
    
    Write-Info "Overall Performance Score: $overallScore/100"
    Write-Host "   Tests Passed: $($script:BenchmarkResults.Summary.PassedTests)/$($script:BenchmarkResults.Summary.TotalTests)"
    Write-Host "   Total Duration: $($script:BenchmarkResults.Summary.TotalDuration.ToString('F1'))s"
    Write-Host ""
    
    # Individual test results
    Write-Info "Individual Test Results:"
    foreach ($testName in $script:BenchmarkResults.Results.Keys) {
        $test = $script:BenchmarkResults.Results[$testName]
        $icon = if ($test.Status -eq "Completed") { "✅" } else { "❌" }
        $scoreColor = if ($test.Score -ge 80) { "Green" } elseif ($test.Score -ge 60) { "Yellow" } else { "Red" }
        
        Write-Host "   $icon $testName" -NoNewline
        Write-Host " - Score: $($test.Score)/100" -ForegroundColor $scoreColor -NoNewline
        Write-Host " ($($test.Duration.ToString('F1'))s)"
    }
    Write-Host ""
    
    # Performance recommendations
    Show-PerformanceRecommendations
    
    Write-Performance "🎯 Benchmark analysis complete!")
}

function Show-PerformanceRecommendations {
    Write-Info "💡 Performance Recommendations:"
    
    $recommendations = @()
    
    # Analyze results and provide recommendations
    if ($script:BenchmarkResults.Results.ContainsKey("Memory")) {
        $memory = $script:BenchmarkResults.Results["Memory"]
        if ($memory.Score -lt 70) {
            $recommendations += "• Optimize memory usage - consider implementing object pooling"
            $recommendations += "• Review garbage collection settings"
        }
    }
    
    if ($script:BenchmarkResults.Results.ContainsKey("API")) {
        $api = $script:BenchmarkResults.Results["API"]
        if ($api.Score -lt 70) {
            $recommendations += "• Implement API response caching"
            $recommendations += "• Consider request batching for better throughput"
        }
    }
    
    if ($script:BenchmarkResults.Results.ContainsKey("Database")) {
        $db = $script:BenchmarkResults.Results["Database"]
        if ($db.Score -lt 70) {
            $recommendations += "• Optimize database queries"
            $recommendations += "• Consider implementing connection pooling"
        }
    }
    
    if ($recommendations.Count -eq 0) {
        Write-Success "• No performance issues detected - your system is well optimized!"
    } else {
        foreach ($rec in $recommendations) {
            Write-Host "   $rec" -ForegroundColor Yellow
        }
    }
    Write-Host ""
}

# Main execution
try {
    Start-PerformanceBenchmarks
} catch {
    Write-Error "Benchmark execution failed: $($_.Exception.Message)"
    exit 1
}