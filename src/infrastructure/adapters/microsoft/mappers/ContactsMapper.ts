import { Contact, ContactEntity, Address, Organization, InstantMessaging, SocialProfile } from '../../../../domain/entities/Contact.js';
import { EmailAddress } from '../../../../domain/value-objects/EmailAddress.js';
import { PhoneNumber } from '../../../../domain/value-objects/PhoneNumber.js';
import { PersonName } from '../../../../domain/value-objects/PersonName.js';
import { ContactMetadata, ContactMetadataImpl } from '../../../../domain/value-objects/ContactMetadata.js';
import { UnifiedId } from '../../../../domain/value-objects/UnifiedId.js';
import { Platform } from '../../../../domain/value-objects/Platform.js';

/**
 * Mapper for converting between Microsoft Graph contact format and domain entities
 */
export class ContactsMapper {
  /**
   * Convert Graph API contact to domain entity
   */
  static toDomainContact(graphContact: any): Contact {
    const id = new UnifiedId('contact', graphContact.id);
    const platformIds = new Map([['microsoft' as Platform, graphContact.id]]);

    // Map name
    const name = new PersonName(
      graphContact.givenName || '',
      graphContact.surname || '',
      graphContact.middleName,
      graphContact.displayName || `${graphContact.givenName || ''} ${graphContact.surname || ''}`.trim(),
      graphContact.nickName,
      graphContact.title
    );

    // Map email addresses
    const emails = (graphContact.emailAddresses || []).map((email: any, index: number) => 
      new EmailAddress(
        email.address,
        email.name || email.address,
        this.mapEmailType(email.type),
        index === 0 // First is primary
      )
    );

    // Map phone numbers
    const phones = this.mapPhoneNumbers(graphContact);

    // Map addresses
    const addresses = this.mapAddresses(graphContact);

    // Map organization
    const organization = this.mapOrganization(graphContact);

    // Map IM addresses
    const imAddresses = this.mapImAddresses(graphContact);

    // Map social profiles
    const socialProfiles = this.mapSocialProfiles(graphContact);

    // Map metadata
    const metadata = new ContactMetadataImpl(
      'microsoft' as Platform,
      graphContact.id,
      new Date(graphContact.createdDateTime || Date.now()),
      new Date(graphContact.lastModifiedDateTime || Date.now()),
      new Date(),
      false,
      'outlook',
      graphContact.parentFolderId,
      undefined,
      graphContact.webUrl,
      graphContact.changeKey,
      graphContact['@odata.etag'],
      graphContact.personalNotes,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      graphContact.companyName,
      undefined,
      undefined,
      graphContact.nickName,
      graphContact.middleName,
      graphContact.fileAs,
      graphContact.displayName
    );

    return new ContactEntity(
      id,
      platformIds,
      name,
      emails,
      phones,
      addresses,
      graphContact.categories || [],
      imAddresses,
      socialProfiles,
      new Date(graphContact.createdDateTime || Date.now()),
      new Date(graphContact.lastModifiedDateTime || Date.now()),
      metadata,
      organization,
      graphContact.birthday ? new Date(graphContact.birthday) : undefined,
      graphContact.anniversary ? new Date(graphContact.anniversary) : undefined,
      graphContact.personalNotes,
      graphContact.photo?.['@odata.mediaContentType'] ? 
        `/me/contacts/${graphContact.id}/photo/$value` : undefined
    );
  }

  /**
   * Convert multiple Graph API contacts to domain entities
   */
  static toDomainContacts(graphContacts: any[]): Contact[] {
    return graphContacts.map(contact => this.toDomainContact(contact));
  }

  /**
   * Convert domain contact to Graph API format for creation/update
   */
  static toGraphContact(contact: Partial<Contact>): any {
    const graphContact: any = {};

    // Map name
    if (contact.name) {
      graphContact.givenName = contact.name.givenName;
      graphContact.surname = contact.name.surname;
      graphContact.middleName = contact.name.middleName;
      graphContact.displayName = contact.name.displayName;
      graphContact.title = contact.name.title;
      graphContact.nickName = contact.name.nickname;
    }

    // Map email addresses
    if (contact.emails) {
      graphContact.emailAddresses = contact.emails.map(email => ({
        address: email.address,
        name: email.displayName,
        type: this.mapEmailTypeToGraph(email.type)
      }));
    }

    // Map phone numbers
    if (contact.phones) {
      contact.phones.forEach((phone, index) => {
        const phoneType = this.mapPhoneTypeToGraph(phone.type);
        if (phoneType === 'businessPhones') {
          if (!graphContact.businessPhones) graphContact.businessPhones = [];
          graphContact.businessPhones.push(phone.number);
        } else if (phoneType === 'homePhones') {
          if (!graphContact.homePhones) graphContact.homePhones = [];
          graphContact.homePhones.push(phone.number);
        } else if (phoneType === 'mobilePhone') {
          graphContact.mobilePhone = phone.number;
        }
      });
    }

    // Map addresses
    if (contact.addresses) {
      contact.addresses.forEach(address => {
        const addressType = this.mapAddressTypeToGraph(address.type);
        graphContact[addressType] = {
          street: address.street,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          countryOrRegion: address.country
        };
      });
    }

    // Map organization
    if (contact.organization) {
      graphContact.companyName = contact.organization.name;
      graphContact.department = contact.organization.department;
      graphContact.jobTitle = contact.organization.title;
      graphContact.officeLocation = contact.organization.officeLocation;
    }

    // Map other fields
    if (contact.birthday) {
      graphContact.birthday = contact.birthday.toISOString();
    }

    if (contact.anniversary) {
      graphContact.anniversary = contact.anniversary.toISOString();
    }

    if (contact.notes) {
      graphContact.personalNotes = contact.notes;
    }

    if (contact.categories) {
      graphContact.categories = contact.categories;
    }

    // Map IM addresses
    if (contact.imAddresses && contact.imAddresses.length > 0) {
      graphContact.imAddresses = contact.imAddresses.map(im => im.address);
    }

    return graphContact;
  }

  /**
   * Convert domain contact to Graph API update format
   */
  static toGraphUpdate(updates: Partial<Contact>): any {
    // Use the same conversion as create, Graph API accepts the same format
    return this.toGraphContact(updates);
  }

  /**
   * Map phone numbers from Graph contact
   */
  private static mapPhoneNumbers(graphContact: any): PhoneNumber[] {
    const phones: PhoneNumber[] = [];

    // Business phones
    if (graphContact.businessPhones) {
      graphContact.businessPhones.forEach((phone: string, index: number) => {
        phones.push(new PhoneNumber(
          phone,
          'work',
          index === 0 && !graphContact.mobilePhone // Primary if first and no mobile
        ));
      });
    }

    // Mobile phone
    if (graphContact.mobilePhone) {
      phones.push(new PhoneNumber(
        graphContact.mobilePhone,
        'mobile',
        true // Mobile is usually primary
      ));
    }

    // Home phones
    if (graphContact.homePhones) {
      graphContact.homePhones.forEach((phone: string) => {
        phones.push(new PhoneNumber(phone, 'home', false));
      });
    }

    // Other phones
    if (graphContact.otherPhones) {
      graphContact.otherPhones.forEach((phone: string) => {
        phones.push(new PhoneNumber(phone, 'other', false));
      });
    }

    return phones;
  }

  /**
   * Map addresses from Graph contact
   */
  private static mapAddresses(graphContact: any): Address[] {
    const addresses: Address[] = [];

    // Business address
    if (graphContact.businessAddress) {
      addresses.push({
        street: graphContact.businessAddress.street,
        city: graphContact.businessAddress.city,
        state: graphContact.businessAddress.state,
        postalCode: graphContact.businessAddress.postalCode,
        country: graphContact.businessAddress.countryOrRegion,
        type: 'work'
      });
    }

    // Home address
    if (graphContact.homeAddress) {
      addresses.push({
        street: graphContact.homeAddress.street,
        city: graphContact.homeAddress.city,
        state: graphContact.homeAddress.state,
        postalCode: graphContact.homeAddress.postalCode,
        country: graphContact.homeAddress.countryOrRegion,
        type: 'home'
      });
    }

    // Other address
    if (graphContact.otherAddress) {
      addresses.push({
        street: graphContact.otherAddress.street,
        city: graphContact.otherAddress.city,
        state: graphContact.otherAddress.state,
        postalCode: graphContact.otherAddress.postalCode,
        country: graphContact.otherAddress.countryOrRegion,
        type: 'other'
      });
    }

    return addresses;
  }

  /**
   * Map organization from Graph contact
   */
  private static mapOrganization(graphContact: any): Organization | undefined {
    if (!graphContact.companyName && !graphContact.jobTitle && !graphContact.department) {
      return undefined;
    }

    return {
      name: graphContact.companyName || '',
      department: graphContact.department,
      title: graphContact.jobTitle,
      officeLocation: graphContact.officeLocation
    };
  }

  /**
   * Map IM addresses from Graph contact
   */
  private static mapImAddresses(graphContact: any): InstantMessaging[] {
    const imAddresses: InstantMessaging[] = [];

    if (graphContact.imAddresses) {
      graphContact.imAddresses.forEach((address: string) => {
        // Try to detect protocol from address format
        let protocol: InstantMessaging['protocol'] = 'other';
        if (address.includes('skype')) protocol = 'skype';
        else if (address.includes('teams')) protocol = 'teams';
        else if (address.includes('slack')) protocol = 'slack';
        else if (address.includes('discord')) protocol = 'discord';

        imAddresses.push({
          address,
          protocol,
          type: 'work' // Default to work
        });
      });
    }

    return imAddresses;
  }

  /**
   * Map social profiles from Graph contact
   */
  private static mapSocialProfiles(graphContact: any): SocialProfile[] {
    const profiles: SocialProfile[] = [];

    // Graph API doesn't directly expose social profiles in contacts
    // This would need to be enhanced with Microsoft Graph extensions
    // or stored in a custom field

    return profiles;
  }

  /**
   * Map email type from Graph to domain
   */
  private static mapEmailType(graphType?: string): EmailAddress['type'] {
    switch (graphType?.toLowerCase()) {
      case 'business':
      case 'work':
        return 'work';
      case 'personal':
      case 'home':
        return 'personal';
      default:
        return 'other';
    }
  }

  /**
   * Map email type from domain to Graph
   */
  private static mapEmailTypeToGraph(type: EmailAddress['type']): string {
    switch (type) {
      case 'work':
        return 'business';
      case 'personal':
        return 'home';
      default:
        return 'other';
    }
  }

  /**
   * Map phone type to Graph field name
   */
  private static mapPhoneTypeToGraph(type: PhoneNumber['type']): string {
    switch (type) {
      case 'work':
        return 'businessPhones';
      case 'home':
        return 'homePhones';
      case 'mobile':
        return 'mobilePhone';
      default:
        return 'otherPhones';
    }
  }

  /**
   * Map address type to Graph field name
   */
  private static mapAddressTypeToGraph(type: Address['type']): string {
    switch (type) {
      case 'work':
        return 'businessAddress';
      case 'home':
        return 'homeAddress';
      default:
        return 'otherAddress';
    }
  }
}