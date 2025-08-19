# Azure AD Manual Setup Guide for Unified PIM MCP

## Phase 1: Azure AD Application Registration

### Step 1: Create Azure AD Application
1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Fill in the application details:
   - **Name**: `Unified PIM MCP (Development)`
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: 
     - Type: **Web**
     - URI: `http://localhost:8080/auth/callback`

### Step 2: Configure Additional Redirect URIs
After registration, go to **Authentication** and add:
- `http://localhost:3000/auth/callback`
- `http://127.0.0.1:8080/auth/callback`
- `msal{client-id}://auth` (replace {client-id} with your actual client ID)

### Step 3: Configure API Permissions
1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph** > **Delegated permissions**
4. Add the following permissions:

#### Required Permissions:
- **User.Read** - Read user profile
- **Mail.Read** - Read user mail
- **Mail.ReadWrite** - Read and write user mail
- **Mail.Send** - Send mail as user
- **Calendars.Read** - Read user calendars
- **Calendars.ReadWrite** - Read and write user calendars
- **Contacts.Read** - Read user contacts
- **Contacts.ReadWrite** - Read and write user contacts
- **Tasks.Read** - Read user tasks
- **Tasks.ReadWrite** - Read and write user tasks
- **Files.Read.All** - Read all files
- **Files.ReadWrite.All** - Read and write all files

5. Click **Grant admin consent** for your organization

### Step 4: Copy Configuration Values
From the **Overview** page, copy:
- **Application (client) ID**
- **Directory (tenant) ID**

## Phase 2: Environment Configuration

### Step 1: Create .env.local File
Create `C:\Users\brand\unified-pim-mcp\.env.local` with:

```env
# Azure AD Configuration
AZURE_CLIENT_ID=your-client-id-here
AZURE_TENANT_ID=your-tenant-id-here
AZURE_AUTHORITY=https://login.microsoftonline.com/your-tenant-id-here
AZURE_REDIRECT_URI=http://localhost:8080/auth/callback

# ChromaDB Configuration
CHROMADB_HOST=localhost
CHROMADB_PORT=8000

# Application Configuration
NODE_ENV=development
LOG_LEVEL=debug
```

### Step 2: Create Azure Configuration File
Create `C:\Users\brand\unified-pim-mcp\config\azure\Development.json` with:

```json
{
  "appId": "your-client-id-here",
  "tenantId": "your-tenant-id-here",
  "environment": "Development",
  "redirectUri": "http://localhost:8080/auth/callback",
  "authority": "https://login.microsoftonline.com/your-tenant-id-here",
  "scopes": [
    "User.Read",
    "Mail.Read",
    "Mail.ReadWrite",
    "Mail.Send",
    "Calendars.Read",
    "Calendars.ReadWrite",
    "Contacts.Read",
    "Contacts.ReadWrite",
    "Tasks.Read",
    "Tasks.ReadWrite",
    "Files.Read.All",
    "Files.ReadWrite.All"
  ],
  "created": "2025-08-18T21:55:00.000Z"
}
```

## Phase 3: Testing the Setup

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Start Services
```bash
npm run docker:up
```

### Step 3: Test Authentication
```bash
npm run dev:microsoft
```

## Security Notes

1. **Never commit** `.env.local` to version control
2. For production, use **Azure Key Vault** for secrets
3. Regularly rotate client secrets if using confidential client flow
4. Monitor application permissions and usage

## Troubleshooting

### Common Issues:
1. **AADSTS65001**: User hasn't consented to permissions
   - Solution: Ensure admin consent is granted

2. **AADSTS50011**: Invalid redirect URI
   - Solution: Verify redirect URI matches exactly

3. **AADSTS700016**: Application not found
   - Solution: Verify client ID is correct

## Next Steps
After completing the manual setup:
1. Test OAuth flow: `npm run test:integration:auth`
2. Validate Graph API: `npm run dev:microsoft`
3. Run full integration tests: `npm run test:integration`