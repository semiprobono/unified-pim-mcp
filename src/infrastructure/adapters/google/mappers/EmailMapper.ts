import { Attachment, Email, EmailBody, EmailEntity } from '../../../../domain/entities/Email.js';
import { EmailAddress } from '../../../../domain/value-objects/EmailAddress.js';
import { UnifiedId } from '../../../../domain/value-objects/UnifiedId.js';
import { Platform } from '../../../../domain/value-objects/Platform.js';
import {
  EmailMetadata,
  EmailMetadataImpl,
} from '../../../../domain/value-objects/EmailMetadata.js';

/**
 * Maps between Microsoft Graph email format and domain Email entity
 */
export class EmailMapper {
  /**
   * Transforms Graph API response to domain Email entity
   */
  static toDomainEmail(graphEmail: any, userEmail?: string): Email {
    // Extract email addresses
    const from = this.toEmailAddress(graphEmail.from?.emailAddress);
    const to = this.toEmailAddresses(graphEmail.toRecipients || []);
    const cc = graphEmail.ccRecipients ? this.toEmailAddresses(graphEmail.ccRecipients) : undefined;
    const bcc = graphEmail.bccRecipients
      ? this.toEmailAddresses(graphEmail.bccRecipients)
      : undefined;
    const replyTo = graphEmail.replyTo ? this.toEmailAddresses(graphEmail.replyTo) : undefined;

    // Extract body
    const body: EmailBody = {
      content: graphEmail.body?.content || '',
      contentType: graphEmail.body?.contentType === 'html' ? 'html' : 'text',
      preview: graphEmail.bodyPreview || undefined,
    };

    // Extract attachments
    const attachments: Attachment[] = (graphEmail.attachments || []).map((att: any) => ({
      id: att.id,
      name: att.name,
      contentType: att.contentType,
      size: att.size,
      contentBytes: att.contentBytes,
      downloadUrl: att['@odata.mediaContentType'] ? undefined : att['@microsoft.graph.downloadUrl'],
      isInline: att.isInline || false,
    }));

    // Map importance
    const importance = this.mapImportance(graphEmail.importance);

    // Create unified ID
    const unifiedId = UnifiedId.fromString(`microsoft_email_${graphEmail.id}`);

    // Create platform IDs map
    const platformIds = new Map<Platform, string>();
    platformIds.set('microsoft', graphEmail.id);

    // Create metadata with all required properties
    const metadata = EmailMetadataImpl.createMinimal(
      'microsoft',
      graphEmail.internetMessageId || graphEmail.id,
      Number(graphEmail.bodyPreview?.length || 0),
      userEmail ? graphEmail.from?.emailAddress?.address === userEmail : false
    );

    return new EmailEntity(
      unifiedId,
      platformIds,
      from,
      to,
      graphEmail.subject || '',
      body,
      attachments,
      new Date(graphEmail.receivedDateTime || graphEmail.createdDateTime),
      graphEmail.isRead || false,
      graphEmail.isDraft || false,
      importance,
      metadata,
      cc,
      bcc,
      replyTo,
      graphEmail.sentDateTime ? new Date(graphEmail.sentDateTime) : undefined,
      graphEmail.conversationId,
      graphEmail.internetMessageId,
      graphEmail.categories || []
    );
  }

  /**
   * Transform domain Email to Graph API format for sending
   */
  static toGraphEmail(domainEmail: Partial<Email>): any {
    const graphEmail: any = {
      message: {
        subject: domainEmail.subject,
        body: domainEmail.body
          ? {
              contentType: domainEmail.body.contentType === 'html' ? 'HTML' : 'Text',
              content: domainEmail.body.content,
            }
          : undefined,
        toRecipients: domainEmail.to
          ? domainEmail.to.map(addr => this.toGraphEmailAddress(addr))
          : [],
        ccRecipients: domainEmail.cc
          ? domainEmail.cc.map(addr => this.toGraphEmailAddress(addr))
          : undefined,
        bccRecipients: domainEmail.bcc
          ? domainEmail.bcc.map(addr => this.toGraphEmailAddress(addr))
          : undefined,
        replyTo: domainEmail.replyTo
          ? domainEmail.replyTo.map(addr => this.toGraphEmailAddress(addr))
          : undefined,
        importance: domainEmail.importance
          ? this.mapImportanceToGraph(domainEmail.importance)
          : 'normal',
        categories: domainEmail.categories,
        attachments: domainEmail.attachments
          ? domainEmail.attachments.map(att => this.toGraphAttachment(att))
          : undefined,
      },
    };

    // Add save to sent items flag if not a draft
    if (!domainEmail.isDraft) {
      graphEmail.saveToSentItems = true;
    }

    return graphEmail;
  }

  /**
   * Convert Graph email address to domain EmailAddress
   */
  private static toEmailAddress(graphEmailAddress: any): EmailAddress {
    if (!graphEmailAddress) {
      return new EmailAddress('unknown@unknown.com');
    }
    return new EmailAddress(
      graphEmailAddress.address || 'unknown@unknown.com',
      graphEmailAddress.name || undefined
    );
  }

  /**
   * Convert array of Graph email addresses to domain EmailAddress array
   */
  private static toEmailAddresses(graphEmailAddresses: any[]): EmailAddress[] {
    return graphEmailAddresses.map(addr => this.toEmailAddress(addr.emailAddress || addr));
  }

  /**
   * Convert domain EmailAddress to Graph format
   */
  private static toGraphEmailAddress(emailAddress: EmailAddress): any {
    return {
      emailAddress: {
        address: emailAddress.address,
        name: emailAddress.displayName,
      },
    };
  }

  /**
   * Convert domain attachment to Graph format
   */
  private static toGraphAttachment(attachment: Attachment): any {
    if (attachment.contentBytes) {
      // File attachment
      return {
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: attachment.name,
        contentType: attachment.contentType,
        contentBytes: attachment.contentBytes,
        isInline: attachment.isInline,
      };
    } else if (attachment.downloadUrl) {
      // Reference attachment
      return {
        '@odata.type': '#microsoft.graph.referenceAttachment',
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.size,
        isInline: attachment.isInline,
        sourceUrl: attachment.downloadUrl,
      };
    }
    return null;
  }

  /**
   * Map Graph importance to domain importance
   */
  private static mapImportance(graphImportance?: string): 'low' | 'normal' | 'high' {
    switch (graphImportance?.toLowerCase()) {
      case 'low':
        return 'low';
      case 'high':
        return 'high';
      default:
        return 'normal';
    }
  }

  /**
   * Map domain importance to Graph importance
   */
  private static mapImportanceToGraph(importance: 'low' | 'normal' | 'high'): string {
    switch (importance) {
      case 'low':
        return 'Low';
      case 'high':
        return 'High';
      default:
        return 'Normal';
    }
  }

  /**
   * Convert batch of Graph emails to domain emails
   */
  static toDomainEmails(graphEmails: any[]): Email[] {
    return graphEmails.map(email => this.toDomainEmail(email));
  }

  /**
   * Create update payload for Graph API from partial email
   */
  static toGraphUpdate(updates: Partial<Email>): any {
    const graphUpdate: any = {};

    if (updates.isRead !== undefined) {
      graphUpdate.isRead = updates.isRead;
    }

    if (updates.importance !== undefined) {
      graphUpdate.importance = this.mapImportanceToGraph(updates.importance);
    }

    if (updates.categories !== undefined) {
      graphUpdate.categories = updates.categories;
    }

    if (updates.subject !== undefined) {
      graphUpdate.subject = updates.subject;
    }

    if (updates.body !== undefined) {
      graphUpdate.body = {
        contentType: updates.body.contentType === 'html' ? 'HTML' : 'Text',
        content: updates.body.content,
      };
    }

    return graphUpdate;
  }
}
