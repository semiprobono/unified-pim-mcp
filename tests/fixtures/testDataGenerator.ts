import { faker } from '@faker-js/faker';

/**
 * Test Data Generator
 * 
 * Generates realistic test data for integration tests:
 * - Email data with proper structure
 * - User profiles and authentication data
 * - Calendar events and appointments
 * - Contact information
 * - File attachments and metadata
 */

export interface TestEmailData {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  toRecipients: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  ccRecipients?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  bccRecipients?: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
  }>;
  body: {
    contentType: 'text' | 'html';
    content: string;
  };
  receivedDateTime: string;
  sentDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  importance: 'low' | 'normal' | 'high';
  categories: string[];
  conversationId: string;
  parentFolderId: string;
  attachments?: TestAttachmentData[];
}

export interface TestAttachmentData {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;
  lastModifiedDateTime: string;
  contentBytes?: string;
}

export interface TestCalendarEventData {
  id: string;
  subject: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
    address?: {
      street: string;
      city: string;
      state: string;
      countryOrRegion: string;
      postalCode: string;
    };
  };
  attendees: Array<{
    emailAddress: {
      name: string;
      address: string;
    };
    status: {
      response: 'none' | 'accepted' | 'declined' | 'tentativelyAccepted';
      time: string;
    };
  }>;
  organizer: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  body: {
    contentType: 'text' | 'html';
    content: string;
  };
  importance: 'low' | 'normal' | 'high';
  showAs: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere';
  sensitivity: 'normal' | 'personal' | 'private' | 'confidential';
  categories: string[];
}

export interface TestContactData {
  id: string;
  displayName: string;
  givenName: string;
  surname: string;
  emailAddresses: Array<{
    name?: string;
    address: string;
  }>;
  businessPhones: string[];
  homePhones: string[];
  mobilePhone?: string;
  businessAddress?: {
    street: string;
    city: string;
    state: string;
    countryOrRegion: string;
    postalCode: string;
  };
  homeAddress?: {
    street: string;
    city: string;
    state: string;
    countryOrRegion: string;
    postalCode: string;
  };
  companyName?: string;
  jobTitle?: string;
  department?: string;
  categories: string[];
}

export interface TestUserData {
  id: string;
  displayName: string;
  givenName: string;
  surname: string;
  userPrincipalName: string;
  mail: string;
  mobilePhone?: string;
  officeLocation?: string;
  jobTitle?: string;
  department?: string;
  accountEnabled: boolean;
}

/**
 * Email Data Generator
 */
export class EmailDataGenerator {
  static generateEmails(count: number): TestEmailData[] {
    return Array.from({ length: count }, () => this.generateEmail());
  }

  static generateEmail(overrides?: Partial<TestEmailData>): TestEmailData {
    const hasAttachments = faker.datatype.boolean(0.3); // 30% chance
    const isRead = faker.datatype.boolean(0.7); // 70% read
    const importance = faker.helpers.arrayElement(['low', 'normal', 'high']);
    const contentType = faker.helpers.arrayElement(['text', 'html']);

    return {
      id: faker.string.uuid(),
      subject: this.generateEmailSubject(),
      from: {
        emailAddress: {
          name: faker.person.fullName(),
          address: faker.internet.email()
        }
      },
      toRecipients: Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => ({
        emailAddress: {
          name: faker.person.fullName(),
          address: faker.internet.email()
        }
      })),
      ccRecipients: faker.datatype.boolean(0.3) ? Array.from({ length: faker.number.int({ min: 1, max: 2 }) }, () => ({
        emailAddress: {
          name: faker.person.fullName(),
          address: faker.internet.email()
        }
      })) : undefined,
      body: {
        contentType,
        content: contentType === 'html' ? this.generateHtmlEmailBody() : this.generateTextEmailBody()
      },
      receivedDateTime: faker.date.recent({ days: 30 }).toISOString(),
      sentDateTime: faker.date.recent({ days: 30 }).toISOString(),
      isRead,
      hasAttachments,
      importance,
      categories: faker.helpers.arrayElements(['Personal', 'Work', 'Important', 'Travel', 'Finance'], { min: 0, max: 2 }),
      conversationId: faker.string.uuid(),
      parentFolderId: faker.helpers.arrayElement(['inbox', 'sent', 'drafts', 'deleted']),
      attachments: hasAttachments ? this.generateAttachments(faker.number.int({ min: 1, max: 3 })) : undefined,
      ...overrides
    };
  }

  private static generateEmailSubject(): string {
    const subjects = [
      'Weekly Team Meeting',
      'Project Update - Q4 2024',
      'Budget Review Meeting',
      'New Product Launch',
      'Training Session Reminder',
      'Client Proposal Review',
      'Monthly Performance Report',
      'System Maintenance Notification',
      'Holiday Schedule Update',
      'Conference Call - Strategic Planning',
      'Quarterly Business Review',
      'Employee Onboarding Checklist',
      'IT Security Update',
      'Marketing Campaign Results',
      'Vendor Contract Renewal',
      'Customer Feedback Summary',
      'Technical Documentation Review',
      'Annual Performance Evaluation',
      'Office Relocation Notice',
      'Software License Renewal'
    ];

    return faker.helpers.arrayElement(subjects);
  }

  private static generateTextEmailBody(): string {
    const paragraphs = faker.number.int({ min: 1, max: 4 });
    return Array.from({ length: paragraphs }, () => faker.lorem.paragraph()).join('\n\n');
  }

  private static generateHtmlEmailBody(): string {
    const content = this.generateTextEmailBody();
    return `
      <html>
        <body>
          <h2>${faker.lorem.sentence()}</h2>
          ${content.split('\n\n').map(p => `<p>${p}</p>`).join('\n')}
          <br>
          <p>Best regards,<br>${faker.person.fullName()}</p>
        </body>
      </html>
    `;
  }

  private static generateAttachments(count: number): TestAttachmentData[] {
    return Array.from({ length: count }, () => ({
      id: faker.string.uuid(),
      name: faker.system.fileName(),
      contentType: faker.helpers.arrayElement([
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
        'text/plain'
      ]),
      size: faker.number.int({ min: 1024, max: 5242880 }), // 1KB to 5MB
      isInline: faker.datatype.boolean(0.1), // 10% inline
      lastModifiedDateTime: faker.date.recent({ days: 7 }).toISOString(),
      contentBytes: faker.datatype.boolean(0.5) ? faker.string.alphanumeric(100) : undefined
    }));
  }
}

/**
 * Calendar Event Data Generator
 */
export class CalendarEventDataGenerator {
  static generateEvents(count: number): TestCalendarEventData[] {
    return Array.from({ length: count }, () => this.generateEvent());
  }

  static generateEvent(overrides?: Partial<TestCalendarEventData>): TestCalendarEventData {
    const startDate = faker.date.future();
    const endDate = new Date(startDate.getTime() + faker.number.int({ min: 30, max: 240 }) * 60000); // 30min to 4h

    return {
      id: faker.string.uuid(),
      subject: this.generateEventSubject(),
      start: {
        dateTime: startDate.toISOString(),
        timeZone: 'UTC'
      },
      end: {
        dateTime: endDate.toISOString(),
        timeZone: 'UTC'
      },
      location: faker.datatype.boolean(0.7) ? {
        displayName: this.generateLocation(),
        address: {
          street: faker.location.streetAddress(),
          city: faker.location.city(),
          state: faker.location.state(),
          countryOrRegion: faker.location.country(),
          postalCode: faker.location.zipCode()
        }
      } : undefined,
      attendees: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => ({
        emailAddress: {
          name: faker.person.fullName(),
          address: faker.internet.email()
        },
        status: {
          response: faker.helpers.arrayElement(['none', 'accepted', 'declined', 'tentativelyAccepted']),
          time: faker.date.recent({ days: 1 }).toISOString()
        }
      })),
      organizer: {
        emailAddress: {
          name: faker.person.fullName(),
          address: faker.internet.email()
        }
      },
      body: {
        contentType: 'html',
        content: `<p>${faker.lorem.paragraphs(2, '<br><br>')}</p>`
      },
      importance: faker.helpers.arrayElement(['low', 'normal', 'high']),
      showAs: faker.helpers.arrayElement(['free', 'tentative', 'busy', 'oof', 'workingElsewhere']),
      sensitivity: faker.helpers.arrayElement(['normal', 'personal', 'private', 'confidential']),
      categories: faker.helpers.arrayElements(['Meeting', 'Appointment', 'Reminder', 'Travel', 'Personal'], { min: 0, max: 2 }),
      ...overrides
    };
  }

  private static generateEventSubject(): string {
    const subjects = [
      'Daily Standup',
      'Sprint Planning',
      'Client Meeting',
      'Design Review',
      'Code Review Session',
      'Architecture Discussion',
      'Product Demo',
      'Retrospective Meeting',
      'Team Building Event',
      'Training Workshop',
      'Conference Call',
      'Strategy Session',
      'Budget Meeting',
      'Performance Review',
      'Interview - Candidate Name',
      'Project Kickoff',
      'Milestone Review',
      'Vendor Meeting',
      'Executive Briefing',
      'Technical Deep Dive'
    ];

    return faker.helpers.arrayElement(subjects);
  }

  private static generateLocation(): string {
    const locations = [
      'Conference Room A',
      'Conference Room B',
      'Meeting Room 1',
      'Board Room',
      'Training Room',
      'Main Office',
      'Client Site',
      'Video Conference',
      'Cafeteria',
      'Building Lobby',
      'Offsite Location',
      'Remote/Online'
    ];

    return faker.helpers.arrayElement(locations);
  }
}

/**
 * Contact Data Generator
 */
export class ContactDataGenerator {
  static generateContacts(count: number): TestContactData[] {
    return Array.from({ length: count }, () => this.generateContact());
  }

  static generateContact(overrides?: Partial<TestContactData>): TestContactData {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const displayName = `${firstName} ${lastName}`;

    return {
      id: faker.string.uuid(),
      displayName,
      givenName: firstName,
      surname: lastName,
      emailAddresses: [
        {
          name: 'Work',
          address: faker.internet.email({ firstName, lastName })
        },
        ...(faker.datatype.boolean(0.3) ? [{
          name: 'Personal',
          address: faker.internet.email({ firstName, lastName, provider: 'gmail.com' })
        }] : [])
      ],
      businessPhones: [faker.phone.number()],
      homePhones: faker.datatype.boolean(0.5) ? [faker.phone.number()] : [],
      mobilePhone: faker.datatype.boolean(0.8) ? faker.phone.number() : undefined,
      businessAddress: {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        countryOrRegion: faker.location.country(),
        postalCode: faker.location.zipCode()
      },
      homeAddress: faker.datatype.boolean(0.6) ? {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        countryOrRegion: faker.location.country(),
        postalCode: faker.location.zipCode()
      } : undefined,
      companyName: faker.company.name(),
      jobTitle: faker.person.jobTitle(),
      department: faker.helpers.arrayElement(['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations']),
      categories: faker.helpers.arrayElements(['Business', 'Personal', 'VIP', 'Vendor', 'Client'], { min: 0, max: 2 }),
      ...overrides
    };
  }
}

/**
 * User Data Generator
 */
export class UserDataGenerator {
  static generateUsers(count: number): TestUserData[] {
    return Array.from({ length: count }, () => this.generateUser());
  }

  static generateUser(overrides?: Partial<TestUserData>): TestUserData {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const displayName = `${firstName} ${lastName}`;
    const domain = faker.helpers.arrayElement(['company.com', 'organization.org', 'business.net']);

    return {
      id: faker.string.uuid(),
      displayName,
      givenName: firstName,
      surname: lastName,
      userPrincipalName: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
      mail: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`,
      mobilePhone: faker.datatype.boolean(0.7) ? faker.phone.number() : undefined,
      officeLocation: faker.datatype.boolean(0.8) ? faker.helpers.arrayElement([
        'Building A, Floor 1',
        'Building A, Floor 2',
        'Building B, Floor 3',
        'Remote Office',
        'Main Campus'
      ]) : undefined,
      jobTitle: faker.person.jobTitle(),
      department: faker.helpers.arrayElement(['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations']),
      accountEnabled: faker.datatype.boolean(0.95), // 95% enabled
      ...overrides
    };
  }
}

/**
 * Test Scenario Generator
 * Generates realistic test scenarios with related data
 */
export class TestScenarioGenerator {
  /**
   * Generate a complete email thread scenario
   */
  static generateEmailThread(messageCount: number = 5): TestEmailData[] {
    const conversationId = faker.string.uuid();
    const baseSubject = EmailDataGenerator['generateEmailSubject']();
    const participants = Array.from({ length: faker.number.int({ min: 2, max: 4 }) }, () => ({
      name: faker.person.fullName(),
      email: faker.internet.email()
    }));

    return Array.from({ length: messageCount }, (_, index) => {
      const sender = faker.helpers.arrayElement(participants);
      const recipients = participants.filter(p => p.email !== sender.email);

      return EmailDataGenerator.generateEmail({
        conversationId,
        subject: index === 0 ? baseSubject : `RE: ${baseSubject}`,
        from: {
          emailAddress: {
            name: sender.name,
            address: sender.email
          }
        },
        toRecipients: recipients.map(r => ({
          emailAddress: {
            name: r.name,
            address: r.email
          }
        })),
        receivedDateTime: new Date(Date.now() - (messageCount - index) * 24 * 60 * 60 * 1000).toISOString(),
        sentDateTime: new Date(Date.now() - (messageCount - index) * 24 * 60 * 60 * 1000 - 60000).toISOString()
      });
    });
  }

  /**
   * Generate a meeting with related emails
   */
  static generateMeetingScenario(): { event: TestCalendarEventData; emails: TestEmailData[] } {
    const event = CalendarEventDataGenerator.generateEvent();
    const organizer = event.organizer.emailAddress;
    const attendeeEmails = event.attendees.map(a => a.emailAddress);

    // Generate invitation email
    const invitationEmail = EmailDataGenerator.generateEmail({
      subject: `Meeting Invitation: ${event.subject}`,
      from: {
        emailAddress: organizer
      },
      toRecipients: attendeeEmails.map(email => ({ emailAddress: email })),
      body: {
        contentType: 'html',
        content: `
          <p>You are invited to: ${event.subject}</p>
          <p><strong>When:</strong> ${event.start.dateTime}</p>
          <p><strong>Where:</strong> ${event.location?.displayName || 'Online'}</p>
          <p>${event.body.content}</p>
        `
      },
      categories: ['Meeting', 'Important']
    });

    // Generate follow-up emails
    const followUpEmails = Array.from({ length: faker.number.int({ min: 1, max: 3 }) }, () => {
      const sender = faker.helpers.arrayElement([organizer, ...attendeeEmails]);
      const recipients = [organizer, ...attendeeEmails].filter(email => email.address !== sender.address);

      return EmailDataGenerator.generateEmail({
        subject: `RE: Meeting Invitation: ${event.subject}`,
        from: { emailAddress: sender },
        toRecipients: recipients.slice(0, faker.number.int({ min: 1, max: recipients.length })).map(email => ({ emailAddress: email })),
        categories: ['Meeting']
      });
    });

    return {
      event,
      emails: [invitationEmail, ...followUpEmails]
    };
  }

  /**
   * Generate a project collaboration scenario
   */
  static generateProjectScenario(): {
    users: TestUserData[];
    emails: TestEmailData[];
    events: TestCalendarEventData[];
    contacts: TestContactData[];
  } {
    const projectName = faker.company.buzzPhrase();
    
    // Generate team members
    const users = UserDataGenerator.generateUsers(faker.number.int({ min: 3, max: 6 }));
    
    // Generate external contacts
    const contacts = ContactDataGenerator.generateContacts(faker.number.int({ min: 2, max: 4 }));
    
    // Generate project emails
    const emails = Array.from({ length: faker.number.int({ min: 10, max: 20 }) }, () => {
      const allParticipants = [
        ...users.map(u => ({ name: u.displayName, address: u.mail })),
        ...contacts.flatMap(c => c.emailAddresses.map(e => ({ name: c.displayName, address: e.address })))
      ];
      
      const sender = faker.helpers.arrayElement(allParticipants);
      const recipients = faker.helpers.arrayElements(
        allParticipants.filter(p => p.address !== sender.address),
        { min: 1, max: 3 }
      );

      return EmailDataGenerator.generateEmail({
        subject: `${projectName} - ${faker.helpers.arrayElement([
          'Status Update',
          'Review Required',
          'Meeting Notes',
          'Action Items',
          'Milestone Achieved',
          'Issue Escalation',
          'Resource Request',
          'Timeline Update'
        ])}`,
        from: { emailAddress: sender },
        toRecipients: recipients.map(r => ({ emailAddress: r })),
        categories: ['Project', 'Work']
      });
    });

    // Generate project meetings
    const events = Array.from({ length: faker.number.int({ min: 3, max: 8 }) }, () => {
      const organizer = faker.helpers.arrayElement(users);
      const attendees = faker.helpers.arrayElements(
        users.filter(u => u.id !== organizer.id),
        { min: 1, max: 4 }
      );

      return CalendarEventDataGenerator.generateEvent({
        subject: `${projectName} - ${faker.helpers.arrayElement([
          'Planning Meeting',
          'Sprint Review',
          'Daily Standup',
          'Design Session',
          'Client Presentation',
          'Retrospective'
        ])}`,
        organizer: {
          emailAddress: {
            name: organizer.displayName,
            address: organizer.mail
          }
        },
        attendees: attendees.map(a => ({
          emailAddress: {
            name: a.displayName,
            address: a.mail
          },
          status: {
            response: faker.helpers.arrayElement(['accepted', 'tentativelyAccepted', 'none']),
            time: faker.date.recent({ days: 1 }).toISOString()
          }
        })),
        categories: ['Project', 'Meeting']
      });
    });

    return { users, emails, events, contacts };
  }
}

/**
 * Export all generators and test data interfaces
 */
export {
  EmailDataGenerator,
  CalendarEventDataGenerator,
  ContactDataGenerator,
  UserDataGenerator,
  TestScenarioGenerator
};