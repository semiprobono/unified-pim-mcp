import { describe, it, expect } from '@jest/globals';
import { EmailAddress } from '../../../../src/domain/value-objects/EmailAddress';

describe('EmailAddress', () => {
  describe('constructor', () => {
    it('should create valid email address', () => {
      const email = new EmailAddress('test@example.com');
      expect(email.address).toBe('test@example.com');
    });

    it('should throw error for invalid email', () => {
      expect(() => new EmailAddress('invalid-email')).toThrow('Invalid email address');
    });

    it('should accept display name and type', () => {
      const email = new EmailAddress('test@example.com', 'Test User', 'work', true);
      expect(email.displayName).toBe('Test User');
      expect(email.type).toBe('work');
      expect(email.isPrimary).toBe(true);
    });
  });

  describe('static factory methods', () => {
    it('should create email from string', () => {
      const email = EmailAddress.fromString('test@example.com');
      expect(email.address).toBe('test@example.com');
    });

    it('should create work email', () => {
      const email = EmailAddress.work('work@company.com', 'Work User');
      expect(email.type).toBe('work');
      expect(email.displayName).toBe('Work User');
    });

    it('should create primary email', () => {
      const email = EmailAddress.primary('primary@example.com');
      expect(email.isPrimary).toBe(true);
    });
  });

  describe('properties', () => {
    it('should extract local part', () => {
      const email = new EmailAddress('user@domain.com');
      expect(email.localPart).toBe('user');
    });

    it('should extract domain', () => {
      const email = new EmailAddress('user@domain.com');
      expect(email.domain).toBe('domain.com');
    });

    it('should extract TLD', () => {
      const email = new EmailAddress('user@domain.co.uk');
      expect(email.tld).toBe('uk');
    });

    it('should detect provider', () => {
      const gmailEmail = new EmailAddress('user@gmail.com');
      expect(gmailEmail.provider).toBe('Gmail');
      
      const outlookEmail = new EmailAddress('user@outlook.com');
      expect(outlookEmail.provider).toBe('Outlook');
    });

    it('should detect platform services', () => {
      const gmailEmail = new EmailAddress('user@gmail.com');
      expect(gmailEmail.isGoogle).toBe(true);
      expect(gmailEmail.isMicrosoft).toBe(false);
      
      const outlookEmail = new EmailAddress('user@outlook.com');
      expect(outlookEmail.isMicrosoft).toBe(true);
      expect(outlookEmail.isGoogle).toBe(false);
    });
  });

  describe('methods', () => {
    it('should check equality', () => {
      const email1 = new EmailAddress('test@example.com');
      const email2 = new EmailAddress('test@example.com');
      const email3 = new EmailAddress('other@example.com');
      
      expect(email1.equals(email2)).toBe(true);
      expect(email1.equals(email3)).toBe(false);
    });

    it('should create display string', () => {
      const emailWithName = new EmailAddress('test@example.com', 'Test User');
      expect(emailWithName.displayString).toBe('Test User <test@example.com>');
      
      const emailWithoutName = new EmailAddress('test@example.com');
      expect(emailWithoutName.displayString).toBe('test@example.com');
    });

    it('should generate initials', () => {
      const emailWithName = new EmailAddress('test@example.com', 'John Doe');
      expect(emailWithName.initials).toBe('JD');
      
      const emailWithoutName = new EmailAddress('john.doe@example.com');
      expect(emailWithoutName.initials).toBe('JD');
    });

    it('should validate email', () => {
      const validEmail = new EmailAddress('valid@example.com');
      const validation = validEmail.validate();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should serialize to JSON', () => {
      const email = new EmailAddress('test@example.com', 'Test User', 'work', true);
      const json = email.toJSON();
      
      expect(json['address']).toBe('test@example.com');
      expect(json['displayName']).toBe('Test User');
      expect(json['type']).toBe('work');
      expect(json['isPrimary']).toBe(true);
    });
  });
});