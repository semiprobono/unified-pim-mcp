import { UnifiedId } from '../value-objects/UnifiedId.js';
import { Platform } from '../value-objects/Platform.js';
import { EmailAddress } from '../value-objects/EmailAddress.js';
import { PhoneNumber } from '../value-objects/PhoneNumber.js';
import { PersonName } from '../value-objects/PersonName.js';
import { ContactMetadata } from '../value-objects/ContactMetadata.js';

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  type: 'home' | 'work' | 'other';
}

export interface Organization {
  name: string;
  department?: string;
  title?: string;
  officeLocation?: string;
}

export interface InstantMessaging {
  address: string;
  protocol: 'skype' | 'teams' | 'slack' | 'discord' | 'other';
  type: 'personal' | 'work';
}

export interface SocialProfile {
  url: string;
  platform: 'linkedin' | 'twitter' | 'facebook' | 'instagram' | 'github' | 'other';
  username?: string;
}

export interface Contact {
  readonly id: UnifiedId;
  readonly platformIds: Map<Platform, string>;
  readonly name: PersonName;
  readonly emails: EmailAddress[];
  readonly phones: PhoneNumber[];
  readonly addresses: Address[];
  readonly organization?: Organization | undefined;
  readonly birthday?: Date | undefined;
  readonly anniversary?: Date | undefined;
  readonly notes?: string | undefined;
  readonly categories: string[];
  readonly imAddresses: InstantMessaging[];
  readonly socialProfiles: SocialProfile[];
  readonly photoUrl?: string | undefined;
  readonly createdDateTime: Date;
  readonly lastModifiedDateTime: Date;
  readonly metadata: ContactMetadata;
}

export class ContactEntity implements Contact {
  constructor(
    public readonly id: UnifiedId,
    public readonly platformIds: Map<Platform, string>,
    public readonly name: PersonName,
    public readonly emails: EmailAddress[],
    public readonly phones: PhoneNumber[],
    public readonly addresses: Address[],
    public readonly categories: string[],
    public readonly imAddresses: InstantMessaging[],
    public readonly socialProfiles: SocialProfile[],
    public readonly createdDateTime: Date,
    public readonly lastModifiedDateTime: Date,
    public readonly metadata: ContactMetadata,
    public readonly organization?: Organization,
    public readonly birthday?: Date,
    public readonly anniversary?: Date,
    public readonly notes?: string,
    public readonly photoUrl?: string
  ) {}

  /**
   * Gets the primary email address
   */
  get primaryEmail(): EmailAddress {
    return this.emails.find(email => email.isPrimary) || this.emails[0];
  }

  /**
   * Gets the primary phone number
   */
  get primaryPhone(): PhoneNumber {
    return this.phones.find(phone => phone.isPrimary) || this.phones[0];
  }

  /**
   * Gets work email addresses
   */
  get workEmails(): EmailAddress[] {
    return this.emails.filter(email => email.type === 'work');
  }

  /**
   * Gets personal email addresses
   */
  get personalEmails(): EmailAddress[] {
    return this.emails.filter(email => email.type === 'personal');
  }

  /**
   * Gets work phone numbers
   */
  get workPhones(): PhoneNumber[] {
    return this.phones.filter(phone => phone.type === 'work');
  }

  /**
   * Gets personal phone numbers
   */
  get personalPhones(): PhoneNumber[] {
    return this.phones.filter(phone => phone.type === 'home' || phone.type === 'mobile');
  }

  /**
   * Gets work addresses
   */
  get workAddresses(): Address[] {
    return this.addresses.filter(addr => addr.type === 'work');
  }

  /**
   * Gets home addresses
   */
  get homeAddresses(): Address[] {
    return this.addresses.filter(addr => addr.type === 'home');
  }

  /**
   * Checks if contact has an email address
   */
  hasEmail(email: EmailAddress): boolean | undefined {
    return this.emails.some(e => e.equals(email));
  }

  /**
   * Checks if contact has a phone number
   */
  hasPhone(phone: PhoneNumber): boolean | undefined {
    return this.phones.some(p => p.equals(phone));
  }

  /**
   * Adds an email address
   */
  addEmail(email: EmailAddress): ContactEntity {
    if (this.hasEmail(email)) {
      return this;
    }

    const updatedEmails = [...this.emails, email];
    return new ContactEntity(
      this.id,
      this.platformIds,
      this.name,
      updatedEmails,
      this.phones,
      this.addresses,
      this.categories,
      this.imAddresses,
      this.socialProfiles,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.organization,
      this.birthday,
      this.anniversary,
      this.notes,
      this.photoUrl
    );
  }

  /**
   * Adds a phone number
   */
  addPhone(phone: PhoneNumber): ContactEntity {
    if (this.hasPhone(phone)) {
      return this;
    }

    const updatedPhones = [...this.phones, phone];
    return new ContactEntity(
      this.id,
      this.platformIds,
      this.name,
      this.emails,
      updatedPhones,
      this.addresses,
      this.categories,
      this.imAddresses,
      this.socialProfiles,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.organization,
      this.birthday,
      this.anniversary,
      this.notes,
      this.photoUrl
    );
  }

  /**
   * Updates organization information
   */
  updateOrganization(organization: Organization): ContactEntity {
    return new ContactEntity(
      this.id,
      this.platformIds,
      this.name,
      this.emails,
      this.phones,
      this.addresses,
      this.categories,
      this.imAddresses,
      this.socialProfiles,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      organization,
      this.birthday,
      this.anniversary,
      this.notes,
      this.photoUrl
    );
  }

  /**
   * Adds categories to contact
   */
  addCategories(newCategories: string[]): ContactEntity {
    const updatedCategories = [...new Set([...this.categories, ...newCategories])];

    return new ContactEntity(
      this.id,
      this.platformIds,
      this.name,
      this.emails,
      this.phones,
      this.addresses,
      updatedCategories,
      this.imAddresses,
      this.socialProfiles,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.organization,
      this.birthday,
      this.anniversary,
      this.notes,
      this.photoUrl
    );
  }

  /**
   * Updates notes
   */
  updateNotes(notes: string): ContactEntity {
    return new ContactEntity(
      this.id,
      this.platformIds,
      this.name,
      this.emails,
      this.phones,
      this.addresses,
      this.categories,
      this.imAddresses,
      this.socialProfiles,
      this.createdDateTime,
      new Date(), // Update lastModifiedDateTime
      this.metadata,
      this.organization,
      this.birthday,
      this.anniversary,
      notes,
      this.photoUrl
    );
  }

  /**
   * Gets a display name for the contact
   */
  get displayName(): string {
    if (this.name.displayName) {
      return this.name.displayName;
    }

    if (this.name.givenName && this.name.surname) {
      return `${this.name.givenName} ${this.name.surname}`;
    }

    if (this.name.givenName) {
      return this.name.givenName;
    }

    if (this.primaryEmail) {
      return this.primaryEmail.address;
    }

    return 'Unknown Contact';
  }

  /**
   * Checks if this contact might be a duplicate of another
   */
  possibleDuplicate(other: Contact): boolean | undefined {
    // Check for exact name match
    if (this.name.equals(other.name)) {
      return true;
    }

    // Check for shared email addresses
    const sharedEmails = this.emails.some(email =>
      other.emails.some(otherEmail => email.equals(otherEmail))
    );
    if (sharedEmails) {
      return true;
    }

    // Check for shared phone numbers
    const sharedPhones = this.phones.some(phone =>
      other.phones.some(otherPhone => phone.equals(otherPhone))
    );
    if (sharedPhones) {
      return true;
    }

    return false;
  }

  /**
   * Merges data from another contact (for deduplication)
   */
  mergeWith(other: Contact): ContactEntity {
    // Use the more complete name
    const mergedName = this.name.isMoreCompleteThan(other.name) ? this.name : other.name;

    // Merge emails (deduplicated)
    const allEmails = [...this.emails, ...other.emails];
    const uniqueEmails = allEmails.filter(
      (email, index, arr) => arr.findIndex(e => e.equals(email)) === index
    );

    // Merge phones (deduplicated)
    const allPhones = [...this.phones, ...other.phones];
    const uniquePhones = allPhones.filter(
      (phone, index, arr) => arr.findIndex(p => p.equals(phone)) === index
    );

    // Merge addresses
    const uniqueAddresses = [...this.addresses, ...other.addresses];

    // Merge categories
    const mergedCategories = [...new Set([...this.categories, ...other.categories])];

    // Use the more recent organization info
    const mergedOrganization = this.organization || other.organization;

    // Use the more complete notes
    const mergedNotes =
      this.notes && other.notes ? `${this.notes}\n\n${other.notes}` : this.notes || other.notes;

    // Merge platform IDs
    const mergedPlatformIds = new Map([...this.platformIds, ...other.platformIds]);

    return new ContactEntity(
      this.id, // Keep original ID
      mergedPlatformIds,
      mergedName,
      uniqueEmails,
      uniquePhones,
      uniqueAddresses,
      mergedCategories,
      [...this.imAddresses, ...other.imAddresses],
      [...this.socialProfiles, ...other.socialProfiles],
      this.createdDateTime < other.createdDateTime ? this.createdDateTime : other.createdDateTime,
      new Date(),
      this.metadata,
      mergedOrganization,
      this.birthday || other.birthday,
      this.anniversary || other.anniversary,
      mergedNotes,
      this.photoUrl || other.photoUrl
    );
  }

  /**
   * Converts to plain object for serialization
   */
  toJSON(): Record<string, any> {
    return {
      id: this.id.toString(),
      platformIds: Object.fromEntries(this.platformIds),
      name: this.name.toJSON(),
      emails: this.emails.map(email => email.toJSON()),
      phones: this.phones.map(phone => phone.toJSON()),
      addresses: this.addresses,
      organization: this.organization,
      birthday: this.birthday?.toISOString(),
      anniversary: this.anniversary?.toISOString(),
      notes: this.notes,
      categories: this.categories,
      imAddresses: this.imAddresses,
      socialProfiles: this.socialProfiles,
      photoUrl: this.photoUrl,
      createdDateTime: this.createdDateTime.toISOString(),
      lastModifiedDateTime: this.lastModifiedDateTime.toISOString(),
      displayName: this.displayName,
      primaryEmail: this.primaryEmail?.toJSON(),
      primaryPhone: this.primaryPhone?.toJSON(),
      metadata: this.metadata,
    };
  }
}
