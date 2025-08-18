import { EmailAddress } from '../value-objects/EmailAddress.js';
import { UnifiedId } from '../value-objects/UnifiedId.js';
import { Platform } from '../value-objects/Platform.js';
import { EmailMetadata } from '../value-objects/EmailMetadata.js';

export interface EmailBody {
  content: string;
  contentType: 'text' | 'html';
  preview?: string;
}

export interface Attachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string  | undefined; // Base64 encoded
  downloadUrl?: string;
  isInline: boolean;
}

export interface Email {
  readonly id: UnifiedId;
  readonly platformIds: Map<Platform, string>;
  readonly from: EmailAddress;
  readonly to: EmailAddress[];
  readonly cc?: EmailAddress[] ;
  readonly bcc?: EmailAddress[] | undefined;
  readonly replyTo?: EmailAddress[] | undefined;
  readonly subject: string;
  readonly body: EmailBody;
  readonly attachments: Attachment[];
  readonly receivedDateTime: Date;
  readonly sentDateTime?: Date | undefined;
  readonly isRead: boolean;
  readonly isDraft: boolean;
  readonly importance: 'low' | 'normal' | 'high';
  readonly hasAttachments: boolean;
  readonly conversationId?: string | undefined;
  readonly internetMessageId?: string | undefined;
  readonly categories: string[];
  readonly metadata: EmailMetadata;
}

export class EmailEntity implements Email {
  constructor(
    public readonly id: UnifiedId,
    public readonly platformIds: Map<Platform, string>,
    public readonly from: EmailAddress,
    public readonly to: EmailAddress[],
    public readonly subject: string,
    public readonly body: EmailBody,
    public readonly attachments: Attachment[],
    public readonly receivedDateTime: Date,
    public readonly isRead: boolean,
    public readonly isDraft: boolean,
    public readonly importance: 'low' | 'normal' | 'high',
    public readonly metadata: EmailMetadata,
    public readonly cc?: EmailAddress[],
    public readonly bcc?: EmailAddress[],
    public readonly replyTo?: EmailAddress[],
    public readonly sentDateTime?: Date,
    public readonly conversationId?: string,
    public readonly internetMessageId?: string,
    public readonly categories: string[] = []
  ) {}

  get hasAttachments(): boolean {
    return this.attachments.length > 0;
  }

  /**
   * Creates a reply email template
   */
  createReply(from: EmailAddress, replyAll: boolean = false): Partial<Email> | undefined {
    const replyTo = this.replyTo && this.replyTo.length > 0 ? this.replyTo : [this.from];
    const recipients = replyAll ? [...replyTo, ...this.to, ...(this.cc || [])] : replyTo;
    
    // Remove the reply sender from recipients
    const filteredRecipients = recipients.filter(addr => !addr.equals(from));

    return {
      from,
      to: filteredRecipients,
      subject: this.subject.startsWith('Re: ') ? this.subject : `Re: ${this.subject}`,
      body: {
        content: `\n\n--- Original Message ---\nFrom: ${this.from.toString()}\nSent: ${this.receivedDateTime.toISOString()}\nTo: ${this.to.map(t => t.toString()).join('; ')}\nSubject: ${this.subject}\n\n${this.body.content}`,
        contentType: this.body.contentType
      },
      attachments: [],
      conversationId: this.conversationId,
      importance: 'normal' as const,
      isDraft: true,
      isRead: true,
      receivedDateTime: new Date(),
      categories: []
    };
  }

  /**
   * Creates a forward email template
   */
  createForward(from: EmailAddress): Partial<Email> | undefined {
    return {
      from,
      to: [],
      subject: this.subject.startsWith('Fwd: ') ? this.subject : `Fwd: ${this.subject}`,
      body: {
        content: `--- Forwarded Message ---\nFrom: ${this.from.toString()}\nSent: ${this.receivedDateTime.toISOString()}\nTo: ${this.to.map(t => t.toString()).join('; ')}\nSubject: ${this.subject}\n\n${this.body.content}`,
        contentType: this.body.contentType
      },
      attachments: [...this.attachments], // Forward all attachments
      importance: 'normal' as const,
      isDraft: true,
      isRead: true,
      receivedDateTime: new Date(),
      categories: []
    };
  }

  /**
   * Marks email as read/unread
   */
  markAsRead(read: boolean): EmailEntity | undefined {
    return new EmailEntity(
      this.id,
      this.platformIds,
      this.from,
      this.to,
      this.subject,
      this.body,
      this.attachments,
      this.receivedDateTime,
      read,
      this.isDraft,
      this.importance,
      this.metadata,
      this.cc,
      this.bcc,
      this.replyTo,
      this.sentDateTime,
      this.conversationId,
      this.internetMessageId,
      this.categories
    );
  }

  /**
   * Adds categories to email
   */
  addCategories(newCategories: string[]): EmailEntity | undefined {
    const updatedCategories = [...new Set([...this.categories, ...newCategories])];
    
    return new EmailEntity(
      this.id,
      this.platformIds,
      this.from,
      this.to,
      this.subject,
      this.body,
      this.attachments,
      this.receivedDateTime,
      this.isRead,
      this.isDraft,
      this.importance,
      this.metadata,
      this.cc,
      this.bcc,
      this.replyTo,
      this.sentDateTime,
      this.conversationId,
      this.internetMessageId,
      updatedCategories
    );
  }

  /**
   * Converts to plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id.toString(),
      platformIds: Object.fromEntries(this.platformIds),
      from: this.from.toJSON(),
      to: this.to.map(addr => addr.toJSON()),
      cc: this.cc?.map(addr => addr.toJSON()),
      bcc: this.bcc?.map(addr => addr.toJSON()),
      replyTo: this.replyTo?.map(addr => addr.toJSON()),
      subject: this.subject,
      body: this.body,
      attachments: this.attachments,
      receivedDateTime: this.receivedDateTime.toISOString(),
      sentDateTime: this.sentDateTime?.toISOString(),
      isRead: this.isRead,
      isDraft: this.isDraft,
      importance: this.importance,
      hasAttachments: this.hasAttachments,
      conversationId: this.conversationId,
      internetMessageId: this.internetMessageId,
      categories: this.categories,
      metadata: this.metadata
    };
  }
}