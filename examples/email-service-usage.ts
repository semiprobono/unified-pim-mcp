/**
 * Example usage of the EmailService
 * This demonstrates how to integrate the EmailService into your application
 */

import { Logger } from '../src/shared/logging/Logger.js';
import { ConfigManager } from '../src/shared/config/ConfigManager.js';
import { SecurityManager } from '../src/shared/security/SecurityManager.js';
import {
  MsalConfig,
  MsalAuthProvider,
  TokenRefreshService,
  GraphClient,
  RateLimiter,
  CircuitBreaker,
  ChromaDbInitializer,
  CacheManager,
  ErrorHandler,
  EmailService
} from '../src/infrastructure/adapters/microsoft/index.js';

async function setupEmailService() {
  // Initialize dependencies
  const logger = new Logger('EmailServiceExample');
  const configManager = new ConfigManager();
  const securityManager = new SecurityManager(configManager, logger);

  // Configure MSAL for authentication
  const msalConfig = new MsalConfig(
    process.env.MS_CLIENT_ID!,
    process.env.MS_CLIENT_SECRET,
    process.env.MS_TENANT_ID || 'common',
    'http://localhost:3000/auth/callback',
    logger
  );

  // Initialize auth provider
  const authProvider = new MsalAuthProvider(
    msalConfig,
    logger,
    !!process.env.MS_CLIENT_SECRET
  );

  // Initialize token service
  const tokenService = new TokenRefreshService(
    authProvider,
    securityManager,
    logger
  );

  // Initialize rate limiter
  const rateLimiter = new RateLimiter(
    {
      maxRequests: 10000,
      windowMs: 600000,
      maxConcurrent: 5,
      retryAfter: 1000
    },
    logger
  );

  // Initialize circuit breaker
  const circuitBreaker = new CircuitBreaker(
    {
      failureThreshold: 5,
      resetTimeout: 60000,
      monitoringPeriod: 120000,
      halfOpenRequests: 3
    },
    logger
  );

  // Initialize Graph client
  const graphClient = new GraphClient(
    authProvider,
    tokenService,
    rateLimiter,
    circuitBreaker,
    logger
  );

  // Initialize ChromaDB for search
  const chromaDb = new ChromaDbInitializer(
    configManager,
    logger
  );
  await chromaDb.initialize();

  // Initialize cache manager
  const cacheManager = new CacheManager(
    {
      ttl: 3600,
      maxSize: 1000,
      checkPeriod: 600
    },
    logger
  );

  // Initialize error handler
  const errorHandler = new ErrorHandler(
    {
      maxRetries: 3,
      retryDelay: 1000,
      exponentialBackoff: true
    },
    logger
  );

  // Create EmailService instance
  const emailService = new EmailService(
    graphClient,
    cacheManager,
    chromaDb,
    errorHandler,
    logger
  );

  return emailService;
}

// Example: Search and process emails
async function searchAndProcessEmails() {
  const emailService = await setupEmailService();

  // Search for unread emails from the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const searchResult = await emailService.searchEmails({
    isRead: false,
    dateFrom: sevenDaysAgo,
    importance: 'high',
    limit: 50,
    orderBy: 'receivedDateTime',
    orderDirection: 'desc'
  });

  if (searchResult.success && searchResult.data) {
    console.log(`Found ${searchResult.data.totalCount} unread high-importance emails`);

    for (const email of searchResult.data.emails) {
      console.log(`
        Subject: ${email.subject}
        From: ${email.from.displayString}
        Date: ${email.receivedDateTime}
        Has Attachments: ${email.hasAttachments}
      `);

      // Mark as read
      await emailService.markAsRead(email.id.toString());
    }

    // Check if there are more pages
    if (searchResult.data.pagination.hasNextPage) {
      console.log('More emails available on next page');
    }
  }
}

// Example: Send an email with attachments
async function sendEmailExample() {
  const emailService = await setupEmailService();

  const result = await emailService.sendEmail({
    subject: 'Quarterly Report',
    body: {
      content: '<h1>Quarterly Report</h1><p>Please find the attached report.</p>',
      contentType: 'html'
    },
    to: [
      {
        address: 'manager@company.com',
        displayName: 'Manager'
      }
    ],
    cc: [
      {
        address: 'team@company.com',
        displayName: 'Team'
      }
    ],
    importance: 'high',
    attachments: [
      {
        id: '1',
        name: 'Q4-Report.pdf',
        contentType: 'application/pdf',
        size: 1024000,
        contentBytes: 'base64encodedcontent...',
        isInline: false
      }
    ]
  } as any);

  if (result.success) {
    console.log(`Email sent successfully: ${result.data}`);
  } else {
    console.error(`Failed to send email: ${result.error}`);
  }
}

// Example: Reply to an email
async function replyToEmailExample() {
  const emailService = await setupEmailService();

  const emailId = 'AAMkAGI2...'; // Original email ID

  const result = await emailService.replyToEmail(
    emailId,
    {
      body: {
        content: 'Thank you for your email. I will review and get back to you soon.',
        contentType: 'text'
      }
    },
    false // Set to true for replyAll
  );

  if (result.success) {
    console.log('Reply sent successfully');
  }
}

// Example: Create and send a draft
async function createDraftExample() {
  const emailService = await setupEmailService();

  // Create draft
  const draftResult = await emailService.createDraft({
    subject: 'Draft: Project Update',
    body: {
      content: 'This is a draft email...',
      contentType: 'text'
    },
    to: [
      {
        address: 'colleague@company.com',
        displayName: 'Colleague'
      }
    ]
  } as any);

  if (draftResult.success && draftResult.data) {
    console.log(`Draft created with ID: ${draftResult.data.id}`);

    // Later, update the draft
    const updateResult = await emailService.updateEmail(
      draftResult.data.id.toString(),
      {
        body: {
          content: 'Updated draft content with more details...',
          contentType: 'text'
        }
      } as any
    );

    if (updateResult.success) {
      console.log('Draft updated successfully');
    }
  }
}

// Example: Manage email folders
async function manageFoldersExample() {
  const emailService = await setupEmailService();

  // Get all folders
  const foldersResult = await emailService.getFolders();
  
  if (foldersResult.success && foldersResult.data) {
    console.log('Email folders:');
    for (const folder of foldersResult.data) {
      console.log(`- ${folder.displayName} (${folder.id})`);
    }

    // Move an email to a specific folder
    const emailId = 'AAMkAGI2...';
    const archiveFolderId = foldersResult.data.find(f => f.displayName === 'Archive')?.id;
    
    if (archiveFolderId) {
      const moveResult = await emailService.moveToFolder(emailId, archiveFolderId);
      if (moveResult.success) {
        console.log('Email moved to Archive folder');
      }
    }
  }
}

// Example: Download email attachments
async function downloadAttachmentsExample() {
  const emailService = await setupEmailService();

  const emailId = 'AAMkAGI2...';

  // Get email with attachments
  const emailResult = await emailService.getEmail(emailId);
  
  if (emailResult.success && emailResult.data) {
    const email = emailResult.data;
    
    if (email.hasAttachments) {
      // Get all attachments
      const attachmentsResult = await emailService.getAttachments(emailId);
      
      if (attachmentsResult.success && attachmentsResult.data) {
        for (const attachment of attachmentsResult.data) {
          console.log(`Downloading attachment: ${attachment.name}`);
          
          // Download attachment content
          const contentResult = await emailService.downloadAttachment(
            emailId,
            attachment.id
          );
          
          if (contentResult.success && contentResult.data) {
            // Save to file system
            const fs = await import('fs/promises');
            await fs.writeFile(
              `./downloads/${attachment.name}`,
              contentResult.data
            );
            console.log(`Saved: ${attachment.name}`);
          }
        }
      }
    }
  }
}

// Run examples
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      console.log('=== Email Service Examples ===\n');
      
      // Uncomment the example you want to run:
      // await searchAndProcessEmails();
      // await sendEmailExample();
      // await replyToEmailExample();
      // await createDraftExample();
      // await manageFoldersExample();
      // await downloadAttachmentsExample();
      
      console.log('\n=== Examples completed ===');
    } catch (error) {
      console.error('Example failed:', error);
    }
  })();
}

export {
  setupEmailService,
  searchAndProcessEmails,
  sendEmailExample,
  replyToEmailExample,
  createDraftExample,
  manageFoldersExample,
  downloadAttachmentsExample
};