# PowerShell Script to Generate Mock Data for Development
# This script creates mock data files for testing the Unified PIM MCP server

[CmdletBinding()]
param(
    [string]$OutputDir = "tests/mocks/data",
    [int]$EmailCount = 10,
    [int]$ContactCount = 15,
    [int]$EventCount = 8,
    [int]$TaskCount = 12,
    [int]$FileCount = 5
)

$ErrorActionPreference = "Stop"

Write-Host "🎭 Generating Mock Data for Unified PIM MCP" -ForegroundColor Green

# Ensure output directory exists
if (-not (Test-Path $OutputDir)) {
    New-Item -Type Directory -Path $OutputDir -Force | Out-Null
    Write-Host "📁 Created mock data directory: $OutputDir" -ForegroundColor Yellow
}

# Helper function to generate random dates
function Get-RandomDate {
    param([int]$DaysBack = 30)
    $start = (Get-Date).AddDays(-$DaysBack)
    $end = Get-Date
    $range = ($end - $start).TotalDays
    return $start.AddDays((Get-Random) * $range / [int]::MaxValue)
}

# Helper function to generate random person names
function Get-RandomName {
    $firstNames = @("Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry", "Iris", "Jack", "Kate", "Liam", "Mia", "Noah", "Olivia", "Paul", "Quinn", "Ruby", "Sam", "Tina")
    $lastNames = @("Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin")
    
    $first = Get-Random -InputObject $firstNames
    $last = Get-Random -InputObject $lastNames
    return @{
        first = $first
        last = $last
        full = "$first $last"
        email = "$($first.ToLower()).$($last.ToLower())@example.com"
    }
}

# Generate Mock Emails
Write-Host "📧 Generating $EmailCount mock emails..." -ForegroundColor Yellow

$mockEmails = @()
$subjects = @(
    "Project Update - Q4 Planning",
    "Weekly Team Meeting Notes",
    "Budget Review Required",
    "Client Feedback on Proposal",
    "Security Update Notification",
    "Training Session Reminder",
    "Vacation Request Approval",
    "New Feature Deployment",
    "Monthly Sales Report",
    "System Maintenance Window"
)

for ($i = 1; $i -le $EmailCount; $i++) {
    $sender = Get-RandomName
    $recipient = Get-RandomName
    $date = Get-RandomDate -DaysBack 7
    
    $email = @{
        id = "email_$i"
        unifiedId = @{
            platform = Get-Random -InputObject @("microsoft", "google")
            platformId = "msg_$(Get-Random -Minimum 100000 -Maximum 999999)"
            entityType = "email"
        }
        subject = Get-Random -InputObject $subjects
        from = @{
            name = $sender.full
            email = $sender.email
        }
        to = @(@{
            name = $recipient.full
            email = $recipient.email
        })
        body = @{
            content = "This is a mock email body for testing purposes. It contains sample content to simulate real email data."
            contentType = "text/plain"
        }
        receivedDateTime = $date.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        isRead = (Get-Random) % 2 -eq 0
        hasAttachments = (Get-Random) % 3 -eq 0
        metadata = @{
            messageId = "<msg_$i@example.com>"
            threadId = "thread_$((Get-Random -Minimum 1 -Maximum 5))"
            labels = @("inbox", "work")
            priority = Get-Random -InputObject @("high", "normal", "low")
        }
    }
    
    $mockEmails += $email
}

$mockEmails | ConvertTo-Json -Depth 10 | Out-File -FilePath "$OutputDir/emails.json" -Encoding UTF8
Write-Host "✅ Generated $EmailCount emails" -ForegroundColor Green

# Generate Mock Contacts
Write-Host "👥 Generating $ContactCount mock contacts..." -ForegroundColor Yellow

$mockContacts = @()
$companies = @("Acme Corp", "TechStart Inc", "Global Solutions", "Innovation Labs", "Future Systems", "Digital Dynamics")

for ($i = 1; $i -le $ContactCount; $i++) {
    $person = Get-RandomName
    
    $contact = @{
        id = "contact_$i"
        unifiedId = @{
            platform = Get-Random -InputObject @("microsoft", "google")
            platformId = "contact_$(Get-Random -Minimum 100000 -Maximum 999999)"
            entityType = "contact"
        }
        name = @{
            first = $person.first
            last = $person.last
            display = $person.full
        }
        emails = @(@{
            address = $person.email
            type = "work"
            primary = $true
        })
        phones = @(@{
            number = "+1-555-$(Get-Random -Minimum 100 -Maximum 999)-$(Get-Random -Minimum 1000 -Maximum 9999)"
            type = "mobile"
            primary = $true
        })
        organization = Get-Random -InputObject $companies
        jobTitle = Get-Random -InputObject @("Manager", "Developer", "Analyst", "Director", "Consultant", "Specialist")
        createdDateTime = (Get-RandomDate -DaysBack 180).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        metadata = @{
            categories = @("business")
            starred = (Get-Random) % 4 -eq 0
            photoUrl = "https://example.com/avatar_$i.jpg"
        }
    }
    
    $mockContacts += $contact
}

$mockContacts | ConvertTo-Json -Depth 10 | Out-File -FilePath "$OutputDir/contacts.json" -Encoding UTF8
Write-Host "✅ Generated $ContactCount contacts" -ForegroundColor Green

# Generate Mock Calendar Events
Write-Host "📅 Generating $EventCount mock calendar events..." -ForegroundColor Yellow

$mockEvents = @()
$eventTitles = @(
    "Team Standup Meeting",
    "Client Presentation",
    "Code Review Session",
    "Project Planning",
    "1:1 with Manager",
    "Lunch with Stakeholders",
    "Training Workshop",
    "Sprint Retrospective"
)

for ($i = 1; $i -le $EventCount; $i++) {
    $startDate = Get-RandomDate -DaysBack 14
    $duration = Get-Random -Minimum 30 -Maximum 180 # 30 minutes to 3 hours
    $endDate = $startDate.AddMinutes($duration)
    
    $event = @{
        id = "event_$i"
        unifiedId = @{
            platform = Get-Random -InputObject @("microsoft", "google")
            platformId = "event_$(Get-Random -Minimum 100000 -Maximum 999999)"
            entityType = "calendar_event"
        }
        title = Get-Random -InputObject $eventTitles
        description = "Mock calendar event for development and testing purposes."
        start = @{
            dateTime = $startDate.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            timeZone = "UTC"
        }
        end = @{
            dateTime = $endDate.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            timeZone = "UTC"
        }
        location = @{
            displayName = Get-Random -InputObject @("Conference Room A", "Online", "Office Building", "Client Site")
        }
        attendees = @(@{
            email = (Get-RandomName).email
            name = (Get-RandomName).full
            status = Get-Random -InputObject @("accepted", "tentative", "declined")
        })
        isAllDay = $false
        recurrence = $null
        metadata = @{
            meetingUrl = if ((Get-Random) % 2 -eq 0) { "https://teams.microsoft.com/l/meetup-join/..." } else { $null }
            isOnline = (Get-Random) % 2 -eq 0
            organizer = (Get-RandomName).email
        }
    }
    
    $mockEvents += $event
}

$mockEvents | ConvertTo-Json -Depth 10 | Out-File -FilePath "$OutputDir/events.json" -Encoding UTF8
Write-Host "✅ Generated $EventCount calendar events" -ForegroundColor Green

# Generate Mock Tasks
Write-Host "📝 Generating $TaskCount mock tasks..." -ForegroundColor Yellow

$mockTasks = @()
$taskTitles = @(
    "Review project documentation",
    "Implement new feature",
    "Fix critical bug",
    "Update user interface",
    "Write unit tests",
    "Prepare presentation",
    "Research new technology",
    "Conduct code review",
    "Deploy to production",
    "Update dependencies"
)

for ($i = 1; $i -le $TaskCount; $i++) {
    $createdDate = Get-RandomDate -DaysBack 30
    $dueDate = $createdDate.AddDays(Get-Random -Minimum 1 -Maximum 14)
    
    $task = @{
        id = "task_$i"
        unifiedId = @{
            platform = Get-Random -InputObject @("microsoft", "google")
            platformId = "task_$(Get-Random -Minimum 100000 -Maximum 999999)"
            entityType = "task"
        }
        title = Get-Random -InputObject $taskTitles
        description = "Mock task description for development and testing purposes."
        status = Get-Random -InputObject @("notStarted", "inProgress", "completed")
        priority = Get-Random -InputObject @("high", "normal", "low")
        createdDateTime = $createdDate.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        dueDateTime = $dueDate.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        completedDateTime = if ((Get-Random) % 3 -eq 0) { $dueDate.AddDays(-1).ToString("yyyy-MM-ddTHH:mm:ss.fffZ") } else { $null }
        metadata = @{
            assignedTo = (Get-RandomName).email
            category = Get-Random -InputObject @("work", "personal", "project")
            estimatedHours = Get-Random -Minimum 1 -Maximum 8
            tags = @("development", "testing")
        }
    }
    
    $mockTasks += $task
}

$mockTasks | ConvertTo-Json -Depth 10 | Out-File -FilePath "$OutputDir/tasks.json" -Encoding UTF8
Write-Host "✅ Generated $TaskCount tasks" -ForegroundColor Green

# Generate Mock Files
Write-Host "📁 Generating $FileCount mock files..." -ForegroundColor Yellow

$mockFiles = @()
$fileNames = @(
    "Project Requirements.docx",
    "Budget Spreadsheet.xlsx",
    "Presentation Slides.pptx",
    "System Architecture.pdf",
    "Meeting Notes.txt"
)

for ($i = 1; $i -le $FileCount; $i++) {
    $createdDate = Get-RandomDate -DaysBack 60
    $modifiedDate = $createdDate.AddDays(Get-Random -Minimum 0 -Maximum 30)
    
    $file = @{
        id = "file_$i"
        unifiedId = @{
            platform = Get-Random -InputObject @("microsoft", "google")
            platformId = "file_$(Get-Random -Minimum 100000 -Maximum 999999)"
            entityType = "file"
        }
        name = Get-Random -InputObject $fileNames
        size = Get-Random -Minimum 1024 -Maximum 10485760 # 1KB to 10MB
        mimeType = Get-Random -InputObject @("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/pdf", "text/plain")
        createdDateTime = $createdDate.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        modifiedDateTime = $modifiedDate.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
        path = "/Documents/Project Files/"
        metadata = @{
            owner = (Get-RandomName).email
            shared = (Get-Random) % 2 -eq 0
            version = "1.$(Get-Random -Minimum 0 -Maximum 9)"
            downloadUrl = "https://example.com/files/download/file_$i"
            webUrl = "https://example.com/files/view/file_$i"
        }
    }
    
    $mockFiles += $file
}

$mockFiles | ConvertTo-Json -Depth 10 | Out-File -FilePath "$OutputDir/files.json" -Encoding UTF8
Write-Host "✅ Generated $FileCount files" -ForegroundColor Green

# Generate Mock Platform Configurations
Write-Host "⚙️ Generating mock platform configurations..." -ForegroundColor Yellow

$mockPlatforms = @{
    microsoft = @{
        enabled = $true
        config = @{
            clientId = "mock_microsoft_client_id"
            tenantId = "mock_microsoft_tenant_id"
            scopes = @("https://graph.microsoft.com/Mail.Read", "https://graph.microsoft.com/Calendars.Read", "https://graph.microsoft.com/Contacts.Read", "https://graph.microsoft.com/Files.Read")
            endpoints = @{
                authority = "https://login.microsoftonline.com/mock_tenant_id"
                graph = "https://graph.microsoft.com/v1.0"
            }
        }
        mock = $true
    }
    google = @{
        enabled = $true
        config = @{
            clientId = "mock_google_client_id"
            scopes = @("https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/contacts.readonly", "https://www.googleapis.com/auth/drive.readonly")
            endpoints = @{
                auth = "https://accounts.google.com/oauth2/auth"
                token = "https://oauth2.googleapis.com/token"
                userinfo = "https://www.googleapis.com/oauth2/v1/userinfo"
            }
        }
        mock = $true
    }
    apple = @{
        enabled = $false
        config = @{
            teamId = "mock_apple_team_id"
            clientId = "mock_apple_client_id"
            keyId = "mock_apple_key_id"
        }
        mock = $true
    }
}

$mockPlatforms | ConvertTo-Json -Depth 10 | Out-File -FilePath "$OutputDir/platforms.json" -Encoding UTF8
Write-Host "✅ Generated platform configurations" -ForegroundColor Green

# Generate summary file
$summary = @{
    generated = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    counts = @{
        emails = $EmailCount
        contacts = $ContactCount
        events = $EventCount
        tasks = $TaskCount
        files = $FileCount
    }
    files = @(
        "emails.json",
        "contacts.json", 
        "events.json",
        "tasks.json",
        "files.json",
        "platforms.json"
    )
    note = "This is mock data generated for development and testing purposes. Do not use in production."
}

$summary | ConvertTo-Json -Depth 10 | Out-File -FilePath "$OutputDir/summary.json" -Encoding UTF8

Write-Host "`n🎉 Mock Data Generation Complete!" -ForegroundColor Green
Write-Host "Generated files in: $OutputDir" -ForegroundColor Cyan
Write-Host "Total items: $($EmailCount + $ContactCount + $EventCount + $TaskCount + $FileCount)" -ForegroundColor White

# Create a simple test data loader script
$loaderScript = @'
// Mock Data Loader for Development
// Usage: const mockData = require('./tests/mocks/data/load-mock-data');

const fs = require('fs');
const path = require('path');

const dataDir = __dirname;

function loadMockData() {
  const mockData = {};
  
  const files = ['emails.json', 'contacts.json', 'events.json', 'tasks.json', 'files.json', 'platforms.json'];
  
  files.forEach(file => {
    const filePath = path.join(dataDir, file);
    if (fs.existsSync(filePath)) {
      const key = path.basename(file, '.json');
      mockData[key] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  });
  
  return mockData;
}

module.exports = loadMockData();
'@

$loaderScript | Out-File -FilePath "$OutputDir/load-mock-data.js" -Encoding UTF8
Write-Host "✅ Created data loader script" -ForegroundColor Green