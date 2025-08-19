import { Platform } from '../../src/domain/value-objects/Platform.js';
import {
  PlatformPort,
  PlatformResult,
  SearchCriteria,
} from '../../src/domain/interfaces/PlatformPort.js';
import { Email } from '../../src/domain/entities/Email.js';
import { CalendarEvent } from '../../src/domain/entities/CalendarEvent.js';
import { Contact } from '../../src/domain/entities/Contact.js';
import { Task } from '../../src/domain/entities/Task.js';
import { File } from '../../src/domain/entities/File.js';

/**
 * Mock platform adapter for testing
 */
export class PlatformAdapterMock implements PlatformPort {
  public readonly platform: Platform;
  public isAvailable = true;
  public isAuthenticated = true;

  private emails: Email[] = [];
  private events: CalendarEvent[] = [];
  private contacts: Contact[] = [];
  private tasks: Task[] = [];
  private files: File[] = [];

  constructor(platform: Platform) {
    this.platform = platform;
  }

  // Authentication methods
  async authenticate(): Promise<boolean> {
    this.isAuthenticated = true;
    return true;
  }

  async refreshToken(): Promise<boolean> {
    return true;
  }

  async isTokenValid(): Promise<boolean> {
    return this.isAuthenticated;
  }

  // Email operations
  async fetchEmails(criteria: SearchCriteria): Promise<PlatformResult<Email[]>> {
    return {
      success: true,
      data: this.emails.slice(0, criteria.limit || 10),
    };
  }

  async getEmail(id: string): Promise<PlatformResult<Email>> {
    const email = this.emails.find(e => e.id.toString() === id);
    return {
      success: !!email,
      data: email,
      error: email ? undefined : 'Email not found',
    };
  }

  async sendEmail(email: Partial<Email>): Promise<PlatformResult<string>> {
    const id = `${this.platform}_email_${Date.now()}`;
    return {
      success: true,
      data: id,
    };
  }

  async updateEmail(id: string, updates: Partial<Email>): Promise<PlatformResult<Email>> {
    const emailIndex = this.emails.findIndex(e => e.id.toString() === id);
    if (emailIndex === -1) {
      return {
        success: false,
        error: 'Email not found',
      };
    }

    // Mock update
    const updatedEmail = { ...this.emails[emailIndex], ...updates };
    this.emails[emailIndex] = updatedEmail as Email;

    return {
      success: true,
      data: updatedEmail as Email,
    };
  }

  async deleteEmail(id: string): Promise<PlatformResult<boolean>> {
    const index = this.emails.findIndex(e => e.id.toString() === id);
    if (index === -1) {
      return {
        success: false,
        error: 'Email not found',
      };
    }

    this.emails.splice(index, 1);
    return {
      success: true,
      data: true,
    };
  }

  async searchEmails(query: string, criteria?: SearchCriteria): Promise<PlatformResult<Email[]>> {
    const filtered = this.emails.filter(
      email =>
        email.subject.toLowerCase().includes(query.toLowerCase()) ||
        email.body.content.toLowerCase().includes(query.toLowerCase())
    );

    return {
      success: true,
      data: filtered.slice(0, criteria?.limit || 10),
    };
  }

  // Calendar operations (simplified implementations)
  async fetchEvents(): Promise<PlatformResult<CalendarEvent[]>> {
    return { success: true, data: this.events };
  }

  async getEvent(id: string): Promise<PlatformResult<CalendarEvent>> {
    const event = this.events.find(e => e.id.toString() === id);
    return {
      success: !!event,
      data: event,
      error: event ? undefined : 'Event not found',
    };
  }

  async createEvent(event: Partial<CalendarEvent>): Promise<PlatformResult<string>> {
    const id = `${this.platform}_event_${Date.now()}`;
    return { success: true, data: id };
  }

  async updateEvent(
    id: string,
    updates: Partial<CalendarEvent>
  ): Promise<PlatformResult<CalendarEvent>> {
    const eventIndex = this.events.findIndex(e => e.id.toString() === id);
    if (eventIndex === -1) {
      return { success: false, error: 'Event not found' };
    }

    const updatedEvent = { ...this.events[eventIndex], ...updates };
    this.events[eventIndex] = updatedEvent as CalendarEvent;
    return { success: true, data: updatedEvent as CalendarEvent };
  }

  async deleteEvent(id: string): Promise<PlatformResult<boolean>> {
    const index = this.events.findIndex(e => e.id.toString() === id);
    if (index === -1) {
      return { success: false, error: 'Event not found' };
    }

    this.events.splice(index, 1);
    return { success: true, data: true };
  }

  async searchEvents(query: string): Promise<PlatformResult<CalendarEvent[]>> {
    const filtered = this.events.filter(event =>
      event.title.toLowerCase().includes(query.toLowerCase())
    );
    return { success: true, data: filtered };
  }

  // Stub implementations for other methods
  async batchEmailOperations(): Promise<any> {
    return { success: true, results: [], failedOperations: [] };
  }
  async getFreeBusyInfo(): Promise<any> {
    return { success: true, data: [] };
  }
  async findFreeTime(): Promise<any> {
    return { success: true, data: [] };
  }
  async batchEventOperations(): Promise<any> {
    return { success: true, results: [], failedOperations: [] };
  }
  async fetchContacts(): Promise<PlatformResult<Contact[]>> {
    return { success: true, data: this.contacts };
  }
  async getContact(id: string): Promise<PlatformResult<Contact>> {
    return { success: false, error: 'Not implemented' };
  }
  async createContact(): Promise<PlatformResult<string>> {
    return { success: true, data: 'mock_id' };
  }
  async updateContact(): Promise<PlatformResult<Contact>> {
    return { success: false, error: 'Not implemented' };
  }
  async deleteContact(): Promise<PlatformResult<boolean>> {
    return { success: true, data: true };
  }
  async searchContacts(): Promise<PlatformResult<Contact[]>> {
    return { success: true, data: [] };
  }
  async batchContactOperations(): Promise<any> {
    return { success: true, results: [], failedOperations: [] };
  }
  async fetchTasks(): Promise<PlatformResult<Task[]>> {
    return { success: true, data: this.tasks };
  }
  async getTask(): Promise<PlatformResult<Task>> {
    return { success: false, error: 'Not implemented' };
  }
  async createTask(): Promise<PlatformResult<string>> {
    return { success: true, data: 'mock_id' };
  }
  async updateTask(): Promise<PlatformResult<Task>> {
    return { success: false, error: 'Not implemented' };
  }
  async deleteTask(): Promise<PlatformResult<boolean>> {
    return { success: true, data: true };
  }
  async searchTasks(): Promise<PlatformResult<Task[]>> {
    return { success: true, data: [] };
  }
  async batchTaskOperations(): Promise<any> {
    return { success: true, results: [], failedOperations: [] };
  }
  async fetchFiles(): Promise<PlatformResult<File[]>> {
    return { success: true, data: this.files };
  }
  async getFile(): Promise<PlatformResult<File>> {
    return { success: false, error: 'Not implemented' };
  }
  async uploadFile(): Promise<PlatformResult<string>> {
    return { success: true, data: 'mock_id' };
  }
  async downloadFile(): Promise<PlatformResult<Buffer>> {
    return { success: true, data: Buffer.from('mock') };
  }
  async updateFile(): Promise<PlatformResult<File>> {
    return { success: false, error: 'Not implemented' };
  }
  async deleteFile(): Promise<PlatformResult<boolean>> {
    return { success: true, data: true };
  }
  async searchFiles(): Promise<PlatformResult<File[]>> {
    return { success: true, data: [] };
  }
  async batchFileOperations(): Promise<any> {
    return { success: true, results: [], failedOperations: [] };
  }
  async unifiedSearch(): Promise<any> {
    return { success: true, data: { emails: [], events: [], contacts: [], tasks: [], files: [] } };
  }
  async healthCheck(): Promise<any> {
    return { success: true, data: { status: 'healthy', latency: 10 } };
  }
  async getLastSyncTime(): Promise<Date | null> {
    return new Date();
  }
  async sync(): Promise<any> {
    return { success: true, data: { synced: 0, errors: 0, duration: 100 } };
  }
  async getRateLimitStatus(): Promise<any> {
    return { remaining: 100, reset: new Date(), limit: 1000 };
  }
  async dispose(): Promise<void> {
    /* Mock cleanup */
  }

  // Helper methods for testing
  addMockEmail(email: Email): void {
    this.emails.push(email);
  }

  addMockEvent(event: CalendarEvent): void {
    this.events.push(event);
  }

  clearMockData(): void {
    this.emails = [];
    this.events = [];
    this.contacts = [];
    this.tasks = [];
    this.files = [];
  }
}
