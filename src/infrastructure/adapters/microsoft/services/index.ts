/**
 * Microsoft Graph Services
 * Export all service implementations
 */

export { EmailService } from './EmailService.js';
export type { EmailQueryOptions, EmailSearchResult } from './EmailService.js';

export { CalendarService } from './CalendarService.js';
export type { 
  CalendarQueryOptions, 
  CalendarSearchResult, 
  FreeTimeOptions, 
  FreeTimeSlot 
} from './CalendarService.js';

export { ContactsService } from './ContactsService.js';
export type { ContactQueryOptions, ContactSearchResult } from './ContactsService.js';

export { TaskService } from './TaskService.js';
export type { 
  TaskQueryOptions, 
  TaskSearchResult,
  CreateTaskInput,
  UpdateTaskInput
} from './TaskService.js';

// export { FileService } from './FileService.js';
