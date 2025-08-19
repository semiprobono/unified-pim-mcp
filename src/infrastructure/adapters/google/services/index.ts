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

export { FileService } from './FileService.js';
export type { 
  FileQueryOptions, 
  FileSearchResult,
  FileMetadataInput,
  SharePermissionsInput
} from './FileService.js';

export { NotesService } from './NotesService.js';
export type { 
  NoteQueryOptions, 
  NoteSearchResult,
  CreateNotebookInput,
  CreateSectionInput,
  CreatePageInput,
  UpdateNoteInput
} from './NotesService.js';
