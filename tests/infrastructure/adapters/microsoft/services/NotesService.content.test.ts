// @ts-nocheck - Suppressing all TypeScript checking for this test file due to Jest mock type issues
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { NotesService } from '../../../../../src/infrastructure/adapters/microsoft/services/NotesService';
import { GraphClient } from '../../../../../src/infrastructure/adapters/microsoft/clients/GraphClient';
import { Logger } from '../../../../../src/shared/logging/Logger';

// Mock external dependencies
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/CacheManager');
jest.mock('../../../../../src/infrastructure/adapters/microsoft/cache/ChromaDbInitializer');

// @ts-ignore - Suppressing Jest mock type issues in test file
const createMockCollection = () => ({
  upsert: jest.fn().mockResolvedValue(undefined),
  query: jest.fn().mockResolvedValue({ 
    ids: [[]],
    documents: [[]],
    metadatas: [[]]
  }),
  delete: jest.fn().mockResolvedValue(undefined)
});

// @ts-ignore - Suppressing Jest mock type issues in test file
jest.mock('chromadb', () => ({
  ChromaClient: jest.fn().mockImplementation(() => ({
    getOrCreateCollection: jest.fn().mockResolvedValue(createMockCollection())
  }))
}));

describe('NotesService Content and OneNote Features Tests', () => {
  let notesService: NotesService;
  let mockGraphClient: jest.Mocked<GraphClient>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    // Create mocks with proper typing
    mockGraphClient = {
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      put: jest.fn(),
      batch: jest.fn(),
      paginate: jest.fn(),
      getAllPages: jest.fn(),
      uploadLargeFile: jest.fn(),
      testConnection: jest.fn(),
      // @ts-ignore - Suppressing Jest mock type issues in test file
      authenticateUser: jest.fn(),
      refreshToken: jest.fn(),
      isAuthenticated: jest.fn().mockReturnValue(true),
      getCurrentUser: jest.fn().mockResolvedValue({ id: 'test-user-123' }),
      setUserId: jest.fn(),
      getRateLimit: jest.fn(),
      getHealthStatus: jest.fn(),
      dispose: jest.fn()
    } as jest.Mocked<GraphClient>;

    // @ts-ignore - Suppressing Jest mock type issues in test file
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as jest.Mocked<Logger>;

    // Create service instance
    notesService = new NotesService(mockGraphClient, mockLogger);
  });

  describe('HTML Content Processing', () => {
    it('should handle rich HTML content with formatting', async () => {
      const richHtmlContent = `
        <html>
          <head><title>Rich Content Page</title></head>
          <body>
            <h1>Main Heading</h1>
            <h2>Sub Heading</h2>
            <p><strong>Bold text</strong> and <em>italic text</em></p>
            <ul>
              <li>First item</li>
              <li>Second item with <a href="https://example.com">link</a></li>
            </ul>
            <ol>
              <li>Numbered item</li>
              <li>Another numbered item</li>
            </ol>
            <blockquote>This is a quote</blockquote>
            <p style="color: blue; font-size: 14px;">Styled paragraph</p>
          </body>
        </html>
      `;

      const mockCreateResponse = { id: 'rich-content-page' };
      const mockGetPageResponse = {
        id: 'rich-content-page',
        title: 'Rich Content Page',
        parentSection: { id: 'section-1' },
        content: richHtmlContent
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Rich Content Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Rich Content Page',
        content: {
          htmlContent: richHtmlContent,
          textContent: 'Main Heading Sub Heading Bold text and italic text...',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      });

      expect(page.title).toBe('Rich Content Page');
      expect(page.content.htmlContent).toContain('<h1>Main Heading</h1>');
      expect(page.content.htmlContent).toContain('<strong>Bold text</strong>');
      expect(page.content.htmlContent).toContain('<a href="https://example.com">link</a>');

      // Verify HTML was sent in correct format
      expect(mockGraphClient.post).toHaveBeenCalledWith(
        '/me/onenote/sections/section-1/pages',
        expect.stringContaining('<!DOCTYPE html>'),
        expect.objectContaining({
          headers: { 'Content-Type': 'text/html' }
        })
      );
    });

    it('should handle malicious HTML content with script injection attempts', async () => {
      const maliciousHtml = `
        <html>
          <body>
            <p>Normal content</p>
            <script>alert('XSS attack');</script>
            <img src="x" onerror="alert('Image XSS')">
            <div onclick="maliciousFunction()">Click me</div>
            <iframe src="javascript:alert('Iframe XSS')"></iframe>
            <object data="javascript:alert('Object XSS')"></object>
            <embed src="javascript:alert('Embed XSS')">
            <link rel="stylesheet" href="javascript:alert('Link XSS')">
            <style>body { background: url('javascript:alert("CSS XSS")'); }</style>
            <p onmouseover="alert('Event XSS')">Hover me</p>
          </body>
        </html>
      `;

      const mockCreateResponse = { id: 'malicious-page' };
      const sanitizedContent = `
        <html>
          <head><title>Sanitized Content</title></head>
          <body>
            <p>Normal content</p>
            <p>Potentially harmful content has been removed</p>
          </body>
        </html>
      `;

      const mockGetPageResponse = {
        id: 'malicious-page',
        title: 'Sanitized Content',
        parentSection: { id: 'section-1' },
        content: sanitizedContent // OneNote should sanitize this
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Security Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Security Test Page',
        content: {
          htmlContent: maliciousHtml,
          textContent: 'Normal content',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      });

      // OneNote should have sanitized the content
      expect(page.content.htmlContent).not.toContain('<script>');
      expect(page.content.htmlContent).not.toContain('onerror=');
      expect(page.content.htmlContent).not.toContain('onclick=');
      expect(page.content.htmlContent).not.toContain('javascript:');
    });

    it('should handle Unicode and special characters in content', async () => {
      const unicodeContent = `
        <html>
          <body>
            <h1>🚀 Unicode Test 测试 éñöüß</h1>
            <p>Emojis: 👍 🎯 🌟 ❤️ 🔥</p>
            <p>Chinese: 你好世界 机器学习 人工智能</p>
            <p>Japanese: こんにちは 機械学習 人工知能</p>
            <p>Korean: 안녕하세요 기계학습 인공지능</p>
            <p>Arabic: مرحبا تعلم الآلة الذكاء الاصطناعي</p>
            <p>Russian: Привет машинное обучение искусственный интеллект</p>
            <p>Special chars: ∑∏∆∇∂∫∞≠≤≥±×÷ℝℂℕℤ</p>
            <p>Symbols: ♠♣♥♦★☆▲▼◆◇○●□■</p>
          </body>
        </html>
      `;

      const mockCreateResponse = { id: 'unicode-page' };
      const mockGetPageResponse = {
        id: 'unicode-page',
        title: '🚀 Unicode Test 测试 éñöüß',
        parentSection: { id: 'section-1' },
        content: unicodeContent
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'International Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: '🚀 Unicode Test 测试 éñöüß',
        content: {
          htmlContent: unicodeContent,
          textContent: 'Unicode content with special characters',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      });

      expect(page.title).toBe('🚀 Unicode Test 测试 éñöüß');
      expect(page.content.htmlContent).toContain('你好世界');
      expect(page.content.htmlContent).toContain('こんにちは');
      expect(page.content.htmlContent).toContain('안녕하세요');
      expect(page.content.htmlContent).toContain('مرحبا');
      expect(page.content.htmlContent).toContain('Привет');
      expect(page.content.htmlContent).toContain('♠♣♥♦');
    });

    it('should handle extremely large HTML content', async () => {
      const largeContentSize = 5 * 1024 * 1024; // 5MB
      const largeText = 'A'.repeat(largeContentSize);
      const largeHtmlContent = `
        <html>
          <body>
            <h1>Large Content Test</h1>
            <p>${largeText}</p>
          </body>
        </html>
      `;

      const mockCreateResponse = { id: 'large-content-page' };
      const mockGetPageResponse = {
        id: 'large-content-page',
        title: 'Large Content Test',
        parentSection: { id: 'section-1' },
        content: largeHtmlContent
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Large Content Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const startTime = Date.now();
      
      const page = await notesService.createPage({
        title: 'Large Content Test',
        content: {
          htmlContent: largeHtmlContent,
          textContent: largeText,
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      });

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      expect(page.title).toBe('Large Content Test');
      expect(page.content.htmlContent).toContain(largeText);
      
      // Should handle large content within reasonable time
      expect(executionTime).toBeLessThan(10000);
    });

    it('should handle malformed HTML gracefully', async () => {
      const malformedHtml = `
        <html>
          <body>
            <h1>Malformed HTML Test
            <p>Unclosed paragraph
            <div>Nested without closing
              <span>Another unclosed
            <ul>
              <li>Item 1
              <li>Item 2
            <table>
              <tr>
                <td>Cell 1
                <td>Cell 2
            <script>Unclosed script
            <style>Unclosed style
          </body>
        <!-- Missing closing html tag
      `;

      const mockCreateResponse = { id: 'malformed-page' };
      const correctedHtml = `
        <html>
          <body>
            <h1>Malformed HTML Test</h1>
            <p>Unclosed paragraph</p>
            <div>Nested content
              <span>Fixed content</span>
            </div>
            <ul>
              <li>Item 1</li>
              <li>Item 2</li>
            </ul>
            <table>
              <tr>
                <td>Cell 1</td>
                <td>Cell 2</td>
              </tr>
            </table>
          </body>
        </html>
      `;

      const mockGetPageResponse = {
        id: 'malformed-page',
        title: 'Malformed HTML Test',
        parentSection: { id: 'section-1' },
        content: correctedHtml // OneNote should fix malformed HTML
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'HTML Test Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Malformed HTML Test',
        content: {
          htmlContent: malformedHtml,
          textContent: 'Malformed HTML content',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      });

      // OneNote should have corrected the HTML structure
      expect(page.content.htmlContent).toContain('</h1>');
      expect(page.content.htmlContent).toContain('</p>');
      expect(page.content.htmlContent).not.toContain('<script>');
    });
  });

  describe('OneNote-Specific Features', () => {
    it('should handle OneNote checkbox and todo items', async () => {
      const todoContent = `
        <html>
          <body>
            <h1>Task List</h1>
            <p><input type="checkbox" data-tag="to-do" /> Complete project proposal</p>
            <p><input type="checkbox" data-tag="to-do" checked /> Review documents</p>
            <p><input type="checkbox" data-tag="to-do" /> Send follow-up email</p>
            <p><input type="checkbox" data-tag="to-do" checked /> Update timeline</p>
            <h2>Important Tasks</h2>
            <p><input type="checkbox" data-tag="important" /> Critical task 1</p>
            <p><input type="checkbox" data-tag="important" checked /> Critical task 2</p>
          </body>
        </html>
      `;

      const mockCreateResponse = { id: 'todo-page' };
      const mockGetPageResponse = {
        id: 'todo-page',
        title: 'Task List',
        parentSection: { id: 'section-1' },
        content: todoContent,
        tags: ['tasks', 'todo', 'checklist']
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Task Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Task List',
        content: {
          htmlContent: todoContent,
          textContent: 'Task list with checkboxes',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1',
        tags: ['tasks', 'todo', 'checklist']
      });

      expect(page.title).toBe('Task List');
      expect(page.content.htmlContent).toContain('data-tag="to-do"');
      expect(page.content.htmlContent).toContain('data-tag="important"');
      expect(page.content.htmlContent).toContain('checked');
      expect(page.tags).toContain('tasks');
      expect(page.tags).toContain('todo');
    });

    it('should handle OneNote ink and drawing content', async () => {
      const inkContent = `
        <html>
          <body>
            <h1>Drawing and Ink Notes</h1>
            <div data-id="ink-container">
              <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
                <path d="M 10 50 Q 50 10 100 50 T 200 50" stroke="blue" stroke-width="3" fill="none"/>
                <circle cx="300" cy="150" r="30" stroke="red" stroke-width="2" fill="yellow"/>
                <rect x="50" y="200" width="100" height="50" stroke="green" stroke-width="2" fill="lightgreen"/>
              </svg>
            </div>
            <p>Text mixed with drawings</p>
            <div data-id="ink-recognition">
              <p data-ink-content="handwritten">This was handwritten and recognized</p>
            </div>
          </body>
        </html>
      `;

      const mockCreateResponse = { id: 'ink-page' };
      const mockGetPageResponse = {
        id: 'ink-page',
        title: 'Drawing and Ink Notes',
        parentSection: { id: 'section-1' },
        content: inkContent,
        hasInkContent: true
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Creative Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Drawing and Ink Notes',
        content: {
          htmlContent: inkContent,
          textContent: 'Drawing and ink content',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      });

      expect(page.title).toBe('Drawing and Ink Notes');
      expect(page.content.htmlContent).toContain('svg');
      expect(page.content.htmlContent).toContain('data-id="ink-container"');
      expect(page.content.htmlContent).toContain('data-ink-content="handwritten"');
    });

    it('should handle mathematical equations and formulas', async () => {
      const mathContent = `
        <html>
          <body>
            <h1>Mathematical Equations</h1>
            <div data-mathml="true">
              <math xmlns="http://www.w3.org/1998/Math/MathML">
                <mrow>
                  <mi>E</mi>
                  <mo>=</mo>
                  <mi>m</mi>
                  <msup>
                    <mi>c</mi>
                    <mn>2</mn>
                  </msup>
                </mrow>
              </math>
            </div>
            <p>Inline equation: <span data-mathml="inline">x² + y² = z²</span></p>
            <div data-mathml="true">
              <math xmlns="http://www.w3.org/1998/Math/MathML">
                <mrow>
                  <mi>f</mi>
                  <mo>(</mo>
                  <mi>x</mi>
                  <mo>)</mo>
                  <mo>=</mo>
                  <mfrac>
                    <mn>1</mn>
                    <mrow>
                      <mn>1</mn>
                      <mo>+</mo>
                      <msup>
                        <mi>e</mi>
                        <mrow>
                          <mo>-</mo>
                          <mi>x</mi>
                        </mrow>
                      </msup>
                    </mrow>
                  </mfrac>
                </mrow>
              </math>
            </div>
            <p>Chemistry: H₂O + NaCl → H₂O·NaCl</p>
          </body>
        </html>
      `;

      const mockCreateResponse = { id: 'math-page' };
      const mockGetPageResponse = {
        id: 'math-page',
        title: 'Mathematical Equations',
        parentSection: { id: 'section-1' },
        content: mathContent,
        hasMathContent: true
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Science Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Mathematical Equations',
        content: {
          htmlContent: mathContent,
          textContent: 'Mathematical equations and formulas',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      });

      expect(page.title).toBe('Mathematical Equations');
      expect(page.content.htmlContent).toContain('data-mathml="true"');
      expect(page.content.htmlContent).toContain('<math xmlns="http://www.w3.org/1998/Math/MathML">');
      expect(page.content.htmlContent).toContain('<mfrac>');
      expect(page.content.htmlContent).toContain('<msup>');
    });

    it('should handle tables with complex structures', async () => {
      const tableContent = `
        <html>
          <body>
            <h1>Data Tables</h1>
            <table border="1" style="border-collapse: collapse;">
              <thead>
                <tr style="background-color: #f2f2f2;">
                  <th rowspan="2">Category</th>
                  <th colspan="3">Q1 2023</th>
                  <th colspan="3">Q2 2023</th>
                </tr>
                <tr style="background-color: #f2f2f2;">
                  <th>Jan</th>
                  <th>Feb</th>
                  <th>Mar</th>
                  <th>Apr</th>
                  <th>May</th>
                  <th>Jun</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Revenue</strong></td>
                  <td style="text-align: right;">$10,000</td>
                  <td style="text-align: right;">$12,000</td>
                  <td style="text-align: right;">$15,000</td>
                  <td style="text-align: right;">$18,000</td>
                  <td style="text-align: right;">$20,000</td>
                  <td style="text-align: right;">$22,000</td>
                </tr>
                <tr>
                  <td><strong>Expenses</strong></td>
                  <td style="text-align: right;">$8,000</td>
                  <td style="text-align: right;">$9,000</td>
                  <td style="text-align: right;">$10,000</td>
                  <td style="text-align: right;">$12,000</td>
                  <td style="text-align: right;">$13,000</td>
                  <td style="text-align: right;">$14,000</td>
                </tr>
                <tr style="background-color: #e6f3ff;">
                  <td><strong>Profit</strong></td>
                  <td style="text-align: right;"><strong>$2,000</strong></td>
                  <td style="text-align: right;"><strong>$3,000</strong></td>
                  <td style="text-align: right;"><strong>$5,000</strong></td>
                  <td style="text-align: right;"><strong>$6,000</strong></td>
                  <td style="text-align: right;"><strong>$7,000</strong></td>
                  <td style="text-align: right;"><strong>$8,000</strong></td>
                </tr>
              </tbody>
            </table>
          </body>
        </html>
      `;

      const mockCreateResponse = { id: 'table-page' };
      const mockGetPageResponse = {
        id: 'table-page',
        title: 'Data Tables',
        parentSection: { id: 'section-1' },
        content: tableContent,
        hasTableContent: true
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Business Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Data Tables',
        content: {
          htmlContent: tableContent,
          textContent: 'Financial data in table format',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      });

      expect(page.title).toBe('Data Tables');
      expect(page.content.htmlContent).toContain('<table');
      expect(page.content.htmlContent).toContain('rowspan="2"');
      expect(page.content.htmlContent).toContain('colspan="3"');
      expect(page.content.htmlContent).toContain('<thead>');
      expect(page.content.htmlContent).toContain('<tbody>');
    });

    it('should handle file attachments and embedded objects', async () => {
      const attachmentContent = `
        <html>
          <body>
            <h1>Document with Attachments</h1>
            <p>Please review the attached documents:</p>
            <div data-attachment="true">
              <object data="project-proposal.pdf" type="application/pdf" width="600" height="400">
                <p>Project Proposal PDF - <a href="project-proposal.pdf">Download</a></p>
              </object>
            </div>
            <p>Spreadsheet data:</p>
            <div data-attachment="true">
              <object data="financial-data.xlsx" type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
                <p>Financial Data Excel - <a href="financial-data.xlsx">Download</a></p>
              </object>
            </div>
            <p>Image content:</p>
            <img src="chart-image.png" alt="Sales Chart" style="max-width: 100%;" data-attachment="image" />
          </body>
        </html>
      `;

      const mockCreateResponse = { id: 'attachment-page' };
      const mockGetPageResponse = {
        id: 'attachment-page',
        title: 'Document with Attachments',
        parentSection: { id: 'section-1' },
        content: attachmentContent,
        attachments: [
          {
            id: 'attachment-1',
            name: 'project-proposal.pdf',
            contentType: 'application/pdf',
            size: 2048000
          },
          {
            id: 'attachment-2', 
            name: 'financial-data.xlsx',
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            size: 512000
          },
          {
            id: 'attachment-3',
            name: 'chart-image.png',
            contentType: 'image/png',
            size: 256000
          }
        ]
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Document Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Document with Attachments',
        content: {
          htmlContent: attachmentContent,
          textContent: 'Document with PDF, Excel, and image attachments',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      });

      expect(page.title).toBe('Document with Attachments');
      expect(page.hasAttachments).toBe(true);
      expect(page.attachments).toHaveLength(3);
      expect(page.attachments[0].name).toBe('project-proposal.pdf');
      expect(page.attachments[1].name).toBe('financial-data.xlsx');
      expect(page.attachments[2].name).toBe('chart-image.png');
      expect(page.content.htmlContent).toContain('data-attachment="true"');
    });

    it('should handle OneNote tags and categorization', async () => {
      const taggedContent = `
        <html>
          <body>
            <h1>Tagged Content</h1>
            <p data-tag="important">This is important information</p>
            <p data-tag="question">What should we do about this?</p>
            <p data-tag="idea">💡 Great idea for improvement</p>
            <p data-tag="critical">🚨 Critical issue to address</p>
            <p data-tag="remember">📝 Don't forget this detail</p>
            <div data-tag="definition">
              <h3>Definition</h3>
              <p>Machine Learning: A subset of AI that enables computers to learn without explicit programming.</p>
            </div>
            <p data-tag="to-do">Complete the project documentation</p>
            <p data-tag="address">Contact: John Doe, 123 Main St</p>
          </body>
        </html>
      `;

      const mockCreateResponse = { id: 'tagged-page' };
      const mockGetPageResponse = {
        id: 'tagged-page',
        title: 'Tagged Content',
        parentSection: { id: 'section-1' },
        content: taggedContent,
        tags: ['important', 'question', 'idea', 'critical', 'remember', 'definition', 'to-do', 'address']
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Tagged Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Tagged Content',
        content: {
          htmlContent: taggedContent,
          textContent: 'Content with various OneNote tags',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1',
        tags: ['important', 'question', 'idea', 'critical', 'remember', 'definition', 'to-do', 'address']
      });

      expect(page.title).toBe('Tagged Content');
      expect(page.tags).toContain('important');
      expect(page.tags).toContain('question');
      expect(page.tags).toContain('idea');
      expect(page.tags).toContain('critical');
      expect(page.content.htmlContent).toContain('data-tag="important"');
      expect(page.content.htmlContent).toContain('data-tag="to-do"');
    });
  });

  describe('Content Validation and Error Handling', () => {
    it('should handle content that exceeds OneNote limits', async () => {
      // OneNote has content size limits
      const oversizedContent = 'X'.repeat(100 * 1024 * 1024); // 100MB content
      const oversizedHtml = `
        <html>
          <body>
            <h1>Oversized Content Test</h1>
            <p>${oversizedContent}</p>
          </body>
        </html>
      `;

      const error = new Error('Request entity too large');
      error.name = 'RequestEntityTooLarge';
      mockGraphClient.post.mockRejectedValueOnce(error);

      await expect(notesService.createPage({
        title: 'Oversized Content',
        content: {
          htmlContent: oversizedHtml,
          textContent: oversizedContent,
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      })).rejects.toThrow('Request entity too large');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to create page',
        expect.objectContaining({
          error: expect.any(Error)
        })
      );
    });

    it('should handle invalid content types gracefully', async () => {
      const invalidContent = {
        title: 'Invalid Content Type',
        content: {
          htmlContent: '<p>Valid HTML</p>',
          textContent: 'Valid text',
          contentType: 'application/octet-stream' as any // Invalid content type
        },
        sectionId: 'section-1'
      };

      const error = new Error('Unsupported content type');
      error.name = 'UnsupportedMediaType';
      mockGraphClient.post.mockRejectedValueOnce(error);

      await expect(notesService.createPage(invalidContent)).rejects.toThrow('Unsupported content type');
    });

    it('should handle missing required HTML structure', async () => {
      const incompleteHtml = '<p>Just a paragraph without proper HTML structure</p>';

      const mockCreateResponse = { id: 'incomplete-page' };
      const correctedHtml = `
        <html>
          <head><title>Auto-corrected Page</title></head>
          <body>
            <p>Just a paragraph without proper HTML structure</p>
          </body>
        </html>
      `;

      const mockGetPageResponse = {
        id: 'incomplete-page',
        title: 'Auto-corrected Page',
        parentSection: { id: 'section-1' },
        content: correctedHtml
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Test Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Incomplete HTML Test',
        content: {
          htmlContent: incompleteHtml,
          textContent: 'Just a paragraph',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      });

      // OneNote should auto-correct to proper HTML structure
      expect(page.content.htmlContent).toContain('<html>');
      expect(page.content.htmlContent).toContain('<head>');
      expect(page.content.htmlContent).toContain('<body>');
    });

    it('should handle content encoding issues', async () => {
      const encodingTestContent = `
        <html>
          <body>
            <h1>Encoding Test 🔤</h1>
            <p>UTF-8: ñáéíóú àèìòù âêîôû äëïöü</p>
            <p>Latin-1: ¡¿çÇ®©™€</p>
            <p>Symbols: †‡•…‰‹›""''–—</p>
            <p>Math: ±×÷≠≤≥∞∑∏∆∇∂∫</p>
          </body>
        </html>
      `;

      const mockCreateResponse = { id: 'encoding-page' };
      const mockGetPageResponse = {
        id: 'encoding-page',
        title: 'Encoding Test 🔤',
        parentSection: { id: 'section-1' },
        content: encodingTestContent
      };

      const mockSectionResponse = {
        id: 'section-1',
        displayName: 'Encoding Section',
        notebookId: 'notebook-1'
      };

      mockGraphClient.post.mockResolvedValueOnce(mockCreateResponse);
      mockGraphClient.get
        .mockResolvedValueOnce(mockGetPageResponse)
        .mockResolvedValueOnce(mockSectionResponse);

      const page = await notesService.createPage({
        title: 'Encoding Test 🔤',
        content: {
          htmlContent: encodingTestContent,
          textContent: 'Special characters and encoding test',
          contentType: 'text/html' as const
        },
        sectionId: 'section-1'
      });

      expect(page.title).toContain('🔤');
      expect(page.content.htmlContent).toContain('ñáéíóú');
      expect(page.content.htmlContent).toContain('©™€');
      expect(page.content.htmlContent).toContain('∞∑∏');
    });
  });
});