// Test utilities and fixtures for OneNote data structures
import { Note, NoteContent, Notebook, Section, Page, NoteAttachment } from '../../../../../src/domain/entities/Note';

/**
 * Comprehensive test fixtures for OneNote structures
 */
export class OneNoteTestFixtures {
  
  /**
   * Create a comprehensive notebook fixture with all possible properties
   */
  static createCompleteNotebook(overrides: Partial<any> = {}): any {
    return {
      id: 'test-notebook-complete',
      displayName: 'Complete Test Notebook 📚',
      color: 'blue',
      isDefault: false,
      createdDateTime: '2023-01-01T00:00:00Z',
      lastModifiedDateTime: '2023-06-15T14:30:00Z',
      createdBy: {
        user: {
          id: 'user-123',
          displayName: 'Test User'
        }
      },
      lastModifiedBy: {
        user: {
          id: 'user-123',
          displayName: 'Test User'
        }
      },
      isShared: false,
      sectionsUrl: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks/test-notebook-complete/sections',
      sectionGroupsUrl: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks/test-notebook-complete/sectionGroups',
      links: {
        oneNoteClientUrl: {
          href: 'onenote:https://example-my.sharepoint.com/personal/user_example_onmicrosoft_com/_layouts/OneNote.aspx?id=%2Fpersonal%2Fuser_example_onmicrosoft_com%2FDocuments%2FNotebooks%2FComplete%20Test%20Notebook&wd=target%28%29'
        },
        oneNoteWebUrl: {
          href: 'https://example-my.sharepoint.com/personal/user_example_onmicrosoft_com/_layouts/OneNote.aspx?id=%2Fpersonal%2Fuser_example_onmicrosoft_com%2FDocuments%2FNotebooks%2FComplete%20Test%20Notebook&wd=target%28%29'
        }
      },
      sections: [
        {
          id: 'section-work',
          displayName: 'Work Notes 💼'
        },
        {
          id: 'section-personal',
          displayName: 'Personal Notes 🏠'
        }
      ],
      sectionGroups: [
        {
          id: 'group-projects',
          displayName: 'Projects 🚀'
        }
      ],
      ...overrides
    };
  }

  /**
   * Create notebooks with different color variations
   */
  static createNotebooksWithAllColors(): any[] {
    const colors = ['blue', 'green', 'red', 'yellow', 'orange', 'purple', 'pink', 'gray'];
    return colors.map((color, index) => ({
      id: `notebook-${color}`,
      displayName: `${color.charAt(0).toUpperCase() + color.slice(1)} Notebook`,
      color,
      isDefault: index === 0,
      createdDateTime: `2023-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
      lastModifiedDateTime: `2023-01-${String(index + 1).padStart(2, '0')}T12:00:00Z`
    }));
  }

  /**
   * Create a section fixture with comprehensive data
   */
  static createCompleteSection(overrides: Partial<any> = {}): any {
    return {
      id: 'test-section-complete',
      displayName: 'Complete Test Section 📝',
      createdDateTime: '2023-01-01T00:00:00Z',
      lastModifiedDateTime: '2023-06-15T14:30:00Z',
      createdBy: {
        user: {
          id: 'user-123',
          displayName: 'Test User'
        }
      },
      lastModifiedBy: {
        user: {
          id: 'user-123',
          displayName: 'Test User'
        }
      },
      isDefault: false,
      pagesUrl: 'https://graph.microsoft.com/v1.0/me/onenote/sections/test-section-complete/pages',
      parentNotebook: {
        id: 'parent-notebook',
        displayName: 'Parent Notebook',
        self: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks/parent-notebook'
      },
      parentSectionGroup: null,
      links: {
        oneNoteClientUrl: {
          href: 'onenote:https://example-my.sharepoint.com/personal/user_example_onmicrosoft_com/_layouts/OneNote.aspx?id=%2Fpersonal%2Fuser_example_onmicrosoft_com%2FDocuments%2FNotebooks%2FParent%20Notebook&wd=target%28Complete%20Test%20Section.one%7C%29'
        },
        oneNoteWebUrl: {
          href: 'https://example-my.sharepoint.com/personal/user_example_onmicrosoft_com/_layouts/OneNote.aspx?id=%2Fpersonal%2Fuser_example_onmicrosoft_com%2FDocuments%2FNotebooks%2FParent%20Notebook&wd=target%28Complete%20Test%20Section.one%7C%29'
        }
      },
      pages: [
        {
          id: 'page-1',
          title: 'First Page',
          level: 0,
          order: 0
        },
        {
          id: 'page-2',
          title: 'Second Page',
          level: 0,
          order: 1
        },
        {
          id: 'page-2-1',
          title: 'Sub Page',
          level: 1,
          order: 2
        }
      ],
      ...overrides
    };
  }

  /**
   * Create sections with hierarchical structure (section groups)
   */
  static createSectionGroupHierarchy(): any {
    return {
      id: 'section-group-projects',
      displayName: 'Projects 🚀',
      createdDateTime: '2023-01-01T00:00:00Z',
      lastModifiedDateTime: '2023-06-15T14:30:00Z',
      sectionsUrl: 'https://graph.microsoft.com/v1.0/me/onenote/sectionGroups/section-group-projects/sections',
      sectionGroupsUrl: 'https://graph.microsoft.com/v1.0/me/onenote/sectionGroups/section-group-projects/sectionGroups',
      parentNotebook: {
        id: 'parent-notebook',
        displayName: 'Parent Notebook'
      },
      parentSectionGroup: null,
      sections: [
        {
          id: 'section-project-alpha',
          displayName: 'Project Alpha',
          parentSectionGroup: {
            id: 'section-group-projects',
            displayName: 'Projects 🚀'
          }
        },
        {
          id: 'section-project-beta',
          displayName: 'Project Beta',
          parentSectionGroup: {
            id: 'section-group-projects',
            displayName: 'Projects 🚀'
          }
        }
      ],
      sectionGroups: [
        {
          id: 'section-group-archived',
          displayName: 'Archived Projects',
          parentSectionGroup: {
            id: 'section-group-projects',
            displayName: 'Projects 🚀'
          }
        }
      ]
    };
  }

  /**
   * Create a comprehensive page fixture with rich content
   */
  static createCompletePage(overrides: Partial<any> = {}): any {
    return {
      id: 'test-page-complete',
      title: 'Complete Test Page 📄',
      createdDateTime: '2023-01-01T00:00:00Z',
      lastModifiedDateTime: '2023-06-15T14:30:00Z',
      createdBy: {
        user: {
          id: 'user-123',
          displayName: 'Test User'
        }
      },
      lastModifiedBy: {
        user: {
          id: 'user-123',
          displayName: 'Test User'
        }
      },
      level: 0,
      order: 0,
      contentUrl: 'https://graph.microsoft.com/v1.0/me/onenote/pages/test-page-complete/content',
      content: `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Complete Test Page 📄</title>
            <meta name="created" content="2023-01-01T00:00:00Z" />
            <meta name="last-modified" content="2023-06-15T14:30:00Z" />
          </head>
          <body>
            <div style="position:absolute;left:48px;top:120px;width:624px">
              <h1 style="margin-top:0pt;margin-bottom:0pt">Complete Test Page 📄</h1>
              <p style="margin-top:5.5pt;margin-bottom:5.5pt">
                This is a comprehensive test page with <strong>rich formatting</strong> and <em>various content types</em>.
              </p>
              
              <h2>Task List</h2>
              <p style="margin-top:5.5pt;margin-bottom:5.5pt">
                <span style="font-family:Calibri;font-size:11pt">
                  <input type="checkbox" data-tag="to-do" /> Complete project documentation
                </span>
              </p>
              <p style="margin-top:5.5pt;margin-bottom:5.5pt">
                <span style="font-family:Calibri;font-size:11pt">
                  <input type="checkbox" data-tag="to-do" checked /> Review test cases
                </span>
              </p>
              
              <h2>Important Notes</h2>
              <p style="margin-top:5.5pt;margin-bottom:5.5pt" data-tag="important">
                🚨 This is critical information that needs attention
              </p>
              
              <h2>Code Example</h2>
              <div style="background-color:#f5f5f5;padding:10px;font-family:monospace">
                <code>
                  function calculateTotal(items) {<br/>
                  &nbsp;&nbsp;return items.reduce((sum, item) => sum + item.price, 0);<br/>
                  }
                </code>
              </div>
              
              <h2>Table Data</h2>
              <table border="1" style="border-collapse:collapse">
                <tr style="background-color:#f2f2f2">
                  <th>Month</th>
                  <th>Revenue</th>
                  <th>Expenses</th>
                  <th>Profit</th>
                </tr>
                <tr>
                  <td>January</td>
                  <td>$10,000</td>
                  <td>$8,000</td>
                  <td>$2,000</td>
                </tr>
                <tr>
                  <td>February</td>
                  <td>$12,000</td>
                  <td>$9,000</td>
                  <td>$3,000</td>
                </tr>
              </table>
              
              <h2>Links and References</h2>
              <p>
                Visit our <a href="https://example.com">company website</a> for more information.
              </p>
              
              <h2>Mathematical Formula</h2>
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
            </div>
          </body>
        </html>
      `,
      parentSection: {
        id: 'parent-section',
        displayName: 'Parent Section',
        self: 'https://graph.microsoft.com/v1.0/me/onenote/sections/parent-section'
      },
      parentNotebook: {
        id: 'parent-notebook',
        displayName: 'Parent Notebook',
        self: 'https://graph.microsoft.com/v1.0/me/onenote/notebooks/parent-notebook'
      },
      links: {
        oneNoteClientUrl: {
          href: 'onenote:https://example-my.sharepoint.com/personal/user_example_onmicrosoft_com/_layouts/OneNote.aspx?id=%2Fpersonal%2Fuser_example_onmicrosoft_com%2FDocuments%2FNotebooks%2FParent%20Notebook&wd=target%28Parent%20Section.one%7CComplete%20Test%20Page%7C%29'
        },
        oneNoteWebUrl: {
          href: 'https://example-my.sharepoint.com/personal/user_example_onmicrosoft_com/_layouts/OneNote.aspx?id=%2Fpersonal%2Fuser_example_onmicrosoft_com%2FDocuments%2FNotebooks%2FParent%20Notebook&wd=target%28Parent%20Section.one%7CComplete%20Test%20Page%7C%29'
        }
      },
      ...overrides
    };
  }

  /**
   * Create pages with hierarchical structure (different levels)
   */
  static createHierarchicalPages(): any[] {
    return [
      {
        id: 'page-main',
        title: 'Main Topic',
        level: 0,
        order: 0,
        createdDateTime: '2023-01-01T00:00:00Z',
        lastModifiedDateTime: '2023-01-01T00:00:00Z'
      },
      {
        id: 'page-sub1',
        title: 'Subtopic 1',
        level: 1,
        order: 1,
        parentPageId: 'page-main',
        createdDateTime: '2023-01-01T01:00:00Z',
        lastModifiedDateTime: '2023-01-01T01:00:00Z'
      },
      {
        id: 'page-sub1-detail',
        title: 'Detailed Information',
        level: 2,
        order: 2,
        parentPageId: 'page-sub1',
        createdDateTime: '2023-01-01T02:00:00Z',
        lastModifiedDateTime: '2023-01-01T02:00:00Z'
      },
      {
        id: 'page-sub2',
        title: 'Subtopic 2',
        level: 1,
        order: 3,
        parentPageId: 'page-main',
        createdDateTime: '2023-01-01T03:00:00Z',
        lastModifiedDateTime: '2023-01-01T03:00:00Z'
      },
      {
        id: 'page-conclusion',
        title: 'Conclusion',
        level: 0,
        order: 4,
        createdDateTime: '2023-01-01T04:00:00Z',
        lastModifiedDateTime: '2023-01-01T04:00:00Z'
      }
    ];
  }

  /**
   * Create pages with various OneNote-specific content types
   */
  static createSpecialContentPages(): any[] {
    return [
      {
        id: 'page-ink',
        title: 'Ink and Drawing Page',
        content: `
          <html>
            <body>
              <div data-id="ink-container">
                <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
                  <path d="M 10 50 Q 50 10 100 50 T 200 50" stroke="blue" stroke-width="3" fill="none"/>
                  <circle cx="300" cy="150" r="30" stroke="red" stroke-width="2" fill="yellow"/>
                </svg>
              </div>
              <p data-ink-content="handwritten">This was handwritten and recognized</p>
            </body>
          </html>
        `,
        hasInkContent: true
      },
      {
        id: 'page-math',
        title: 'Mathematical Equations',
        content: `
          <html>
            <body>
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
            </body>
          </html>
        `,
        hasMathContent: true
      },
      {
        id: 'page-attachments',
        title: 'Page with Attachments',
        content: `
          <html>
            <body>
              <div data-attachment="true">
                <object data="document.pdf" type="application/pdf">
                  <p>PDF Document - <a href="document.pdf">Download</a></p>
                </object>
              </div>
              <img src="chart.png" alt="Chart" data-attachment="image" />
            </body>
          </html>
        `,
        attachments: [
          {
            id: 'att-1',
            name: 'document.pdf',
            contentType: 'application/pdf',
            size: 1024000
          },
          {
            id: 'att-2',
            name: 'chart.png',
            contentType: 'image/png',
            size: 256000
          }
        ]
      },
      {
        id: 'page-todos',
        title: 'Task and Todo Page',
        content: `
          <html>
            <body>
              <p><input type="checkbox" data-tag="to-do" /> Task 1</p>
              <p><input type="checkbox" data-tag="to-do" checked /> Task 2 (completed)</p>
              <p><input type="checkbox" data-tag="important" /> Important task</p>
              <p data-tag="question">What about this?</p>
              <p data-tag="idea">💡 Great idea!</p>
            </body>
          </html>
        `,
        tags: ['tasks', 'todo', 'important', 'questions', 'ideas']
      }
    ];
  }

  /**
   * Create paginated response for large datasets
   */
  static createPaginatedResponse<T>(
    items: T[],
    pageSize: number = 50,
    currentPage: number = 0
  ): any {
    const startIndex = currentPage * pageSize;
    const endIndex = Math.min(startIndex + pageSize, items.length);
    const pageItems = items.slice(startIndex, endIndex);
    const hasNextPage = endIndex < items.length;

    return {
      value: pageItems,
      '@odata.count': items.length,
      '@odata.nextLink': hasNextPage 
        ? `https://graph.microsoft.com/v1.0/me/onenote/pages?$skip=${endIndex}&$top=${pageSize}`
        : undefined
    };
  }

  /**
   * Create search response with relevance scores
   */
  static createSearchResponse(query: string, allPages: any[]): any {
    // Simple relevance scoring based on title and content match
    const scoredPages = allPages
      .map(page => {
        const titleMatch = page.title?.toLowerCase().includes(query.toLowerCase()) ? 2 : 0;
        const contentMatch = page.content?.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
        return {
          ...page,
          relevanceScore: titleMatch + contentMatch
        };
      })
      .filter(page => page.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 25); // Limit to 25 results

    return {
      value: scoredPages,
      '@odata.count': scoredPages.length
    };
  }

  /**
   * Create error responses for various HTTP status codes
   */
  static createErrorResponse(statusCode: number, message?: string): Error {
    const errorMessages = {
      400: 'Bad Request - Invalid request format',
      401: 'Unauthorized - Authentication required',
      403: 'Forbidden - Insufficient permissions',
      404: 'Not Found - Resource does not exist',
      409: 'Conflict - Resource already exists or conflicts with current state',
      413: 'Request Entity Too Large - Content size exceeds limits',
      429: 'Too Many Requests - Rate limit exceeded',
      500: 'Internal Server Error - Server encountered an error',
      502: 'Bad Gateway - Invalid response from upstream server',
      503: 'Service Unavailable - Service temporarily unavailable'
    };

    const error = new Error(message || errorMessages[statusCode] || 'Unknown error');
    error.name = this.getErrorNameFromStatus(statusCode);
    (error as any).status = statusCode;
    return error;
  }

  /**
   * Get error name from HTTP status code
   */
  private static getErrorNameFromStatus(statusCode: number): string {
    const errorNames = {
      400: 'BadRequest',
      401: 'Unauthorized',
      403: 'Forbidden',
      404: 'NotFound',
      409: 'Conflict',
      413: 'RequestEntityTooLarge',
      429: 'TooManyRequests',
      500: 'InternalServerError',
      502: 'BadGateway',
      503: 'ServiceUnavailable'
    };
    return errorNames[statusCode] || 'UnknownError';
  }

  /**
   * Create content with various formatting and special characters
   */
  static createRichContent(): { html: string; text: string } {
    const html = `
      <html>
        <body>
          <h1>🚀 Rich Content Example</h1>
          <p><strong>Bold text</strong> and <em>italic text</em> with <u>underlined</u> content.</p>
          
          <h2>Multilingual Content</h2>
          <p>English: Hello World</p>
          <p>Chinese: 你好世界</p>
          <p>Japanese: こんにちは世界</p>
          <p>Arabic: مرحبا بالعالم</p>
          <p>Russian: Привет мир</p>
          
          <h2>Special Characters</h2>
          <p>Math symbols: ∑∏∆∇∂∫∞≠≤≥±×÷</p>
          <p>Currency: $€£¥₹₽₩₪₨</p>
          <p>Arrows: ←→↑↓↔↕⇐⇒⇑⇓</p>
          
          <h2>Lists</h2>
          <ul>
            <li>First item with <a href="https://example.com">link</a></li>
            <li>Second item with emoji 📝</li>
            <li>Third item with <code>code</code></li>
          </ul>
          
          <ol>
            <li>Numbered item</li>
            <li>Another numbered item</li>
          </ol>
          
          <h2>Table</h2>
          <table border="1">
            <tr><th>Header 1</th><th>Header 2</th></tr>
            <tr><td>Cell 1</td><td>Cell 2</td></tr>
          </table>
          
          <h2>Quote</h2>
          <blockquote>This is a quoted text with special meaning.</blockquote>
          
          <h2>Code Block</h2>
          <pre><code>
            function example() {
              return "Hello, World!";
            }
          </code></pre>
        </body>
      </html>
    `;

    const text = `
      Rich Content Example
      Bold text and italic text with underlined content.
      
      Multilingual Content
      English: Hello World
      Chinese: 你好世界
      Japanese: こんにちは世界
      Arabic: مرحبا بالعالم
      Russian: Привет мир
      
      Special Characters
      Math symbols: ∑∏∆∇∂∫∞≠≤≥±×÷
      Currency: $€£¥₹₽₩₪₨
      Arrows: ←→↑↓↔↕⇐⇒⇑⇓
      
      Lists
      First item with link
      Second item with emoji 📝
      Third item with code
      
      Numbered item
      Another numbered item
      
      Table
      Header 1 Header 2
      Cell 1 Cell 2
      
      Quote
      This is a quoted text with special meaning.
      
      Code Block
      function example() {
        return "Hello, World!";
      }
    `.trim();

    return { html, text };
  }

  /**
   * Create performance test dataset with specified size
   */
  static createLargeDataset(size: number): any[] {
    return Array.from({ length: size }, (_, i) => ({
      id: `perf-item-${i}`,
      title: `Performance Test Item ${i}`,
      content: `Content for item ${i} with some additional text to make it realistic. This content includes various keywords like performance, testing, scale, and benchmark.`,
      createdDateTime: new Date(2023, 0, 1 + (i % 365)).toISOString(),
      lastModifiedDateTime: new Date(2023, 0, 1 + (i % 365) + 1).toISOString(),
      level: i % 5,
      order: i,
      tags: [`tag-${i % 20}`, 'performance', 'test']
    }));
  }

  /**
   * Create Unicode test content with various character sets
   */
  static createUnicodeTestContent(): { html: string; text: string } {
    const html = `
      <html>
        <body>
          <h1>🌍 Unicode Test Content</h1>
          
          <h2>Emojis & Symbols</h2>
          <p>😀😃😄😁😆😅😂🤣😊😇🙂🙃😉😌😍🥰😘😗😙😚😋😛😝😜🤪🤨🧐🤓😎🤩🥳</p>
          <p>🔥💯✨⭐🌟💫⚡🌈☀️⛅🌤️⛈️🌩️🌨️❄️☃️⛄🌬️💨💧💦☔☂️🌊🌀</p>
          
          <h2>Mathematical Symbols</h2>
          <p>∀∁∂∃∄∅∆∇∈∉∊∋∌∍∎∏∐∑−∓∔∕∖∗∘∙√∛∜∝∞∟∠∡∢∣∤∥∦∧∨∩∪∫∬∭∮∯∰∱∲∳</p>
          
          <h2>Greek Alphabet</h2>
          <p>Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω</p>
          <p>α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ τ υ φ χ ψ ω</p>
          
          <h2>Currency Symbols</h2>
          <p>$ € £ ¥ ₹ ₽ ₩ ₪ ₨ ₡ ₦ ₨ ₫ € ₴ ₸ ₼ ₾ ¢ ₵ ₶ ₷ ₱ ₲ ₳</p>
          
          <h2>Chinese Characters</h2>
          <p>你好世界！这是中文测试内容。包含简体中文字符。机器学习和人工智能是现代技术的重要组成部分。</p>
          
          <h2>Japanese Characters</h2>
          <p>こんにちは世界！これは日本語のテスト内容です。ひらがな、カタカナ、漢字が含まれています。機械学習と人工知能。</p>
          
          <h2>Korean Characters</h2>
          <p>안녕하세요 세계! 이것은 한국어 테스트 내용입니다. 한글 문자가 포함되어 있습니다. 기계학습과 인공지능.</p>
          
          <h2>Arabic Text</h2>
          <p>مرحبا بالعالم! هذا محتوى اختبار باللغة العربية. يحتوي على أحرف عربية. التعلم الآلي والذكاء الاصطناعي.</p>
          
          <h2>Hebrew Text</h2>
          <p>שלום עולם! זהו תוכן בדיקה בעברית. הוא מכיל תווים עבריים. למידת מכונה ובינה מלאכותית.</p>
          
          <h2>Russian Cyrillic</h2>
          <p>Привет мир! Это тестовый контент на русском языке. Содержит кириллические символы. Машинное обучение и искусственный интеллект.</p>
          
          <h2>Special Diacritics</h2>
          <p>àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞŸ</p>
          
          <h2>Box Drawing</h2>
          <pre>
┌─────────────────┐
│ Box Drawing     │
├─────────────────┤
│ ╔═══════════╗   │
│ ║ Nested    ║   │
│ ║ Box       ║   │
│ ╚═══════════╝   │
└─────────────────┘
          </pre>
        </body>
      </html>
    `;

    const text = html
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return { html, text };
  }
}

/**
 * Mock data generator for different test scenarios
 */
export class OneNoteMockDataGenerator {
  
  /**
   * Generate realistic OneNote API responses
   */
  static generateNotebookListResponse(count: number = 10): any {
    const notebooks = Array.from({ length: count }, (_, i) => ({
      id: `mock-notebook-${i}`,
      displayName: `Mock Notebook ${i} ${i % 3 === 0 ? '📚' : i % 3 === 1 ? '💼' : '🏠'}`,
      color: ['blue', 'green', 'red', 'yellow', 'purple'][i % 5],
      isDefault: i === 0,
      createdDateTime: new Date(2023, i % 12, (i % 28) + 1).toISOString(),
      lastModifiedDateTime: new Date(2023, i % 12, (i % 28) + 1, 12, 0, 0).toISOString(),
      sections: Array.from({ length: (i % 5) + 1 }, (_, j) => ({
        id: `mock-section-${i}-${j}`,
        displayName: `Section ${j + 1}`
      }))
    }));

    return {
      value: notebooks,
      '@odata.count': notebooks.length
    };
  }

  /**
   * Generate realistic section list response
   */
  static generateSectionListResponse(notebookId: string, count: number = 5): any {
    const sections = Array.from({ length: count }, (_, i) => ({
      id: `mock-section-${notebookId}-${i}`,
      displayName: `Mock Section ${i + 1} ${['📝', '💡', '📊', '🔬', '🎯'][i % 5]}`,
      createdDateTime: new Date(2023, i % 12, (i % 28) + 1).toISOString(),
      lastModifiedDateTime: new Date(2023, i % 12, (i % 28) + 1, 12, 0, 0).toISOString(),
      parentNotebook: {
        id: notebookId,
        displayName: `Parent Notebook`
      },
      pages: Array.from({ length: (i % 10) + 1 }, (_, j) => ({
        id: `mock-page-${i}-${j}`,
        title: `Page ${j + 1}`,
        level: j % 3,
        order: j
      }))
    }));

    return {
      value: sections,
      '@odata.count': sections.length
    };
  }

  /**
   * Generate realistic page list response
   */
  static generatePageListResponse(sectionId: string, count: number = 20): any {
    const pages = Array.from({ length: count }, (_, i) => ({
      id: `mock-page-${sectionId}-${i}`,
      title: `Mock Page ${i + 1} ${['📄', '📋', '📊', '🔍', '💭'][i % 5]}`,
      createdDateTime: new Date(2023, (i % 12), (i % 28) + 1, (i % 24), 0, 0).toISOString(),
      lastModifiedDateTime: new Date(2023, (i % 12), (i % 28) + 1, (i % 24) + 1, 0, 0).toISOString(),
      level: i % 4,
      order: i,
      contentUrl: `https://graph.microsoft.com/v1.0/me/onenote/pages/mock-page-${sectionId}-${i}/content`,
      parentSection: {
        id: sectionId,
        displayName: 'Parent Section'
      },
      links: {
        oneNoteClientUrl: {
          href: `onenote:https://example.com/page-${i}`
        },
        oneNoteWebUrl: {
          href: `https://example.com/page-${i}`
        }
      }
    }));

    return {
      value: pages,
      '@odata.count': pages.length
    };
  }

  /**
   * Generate content for ChromaDB testing
   */
  static generateSemanticSearchData(): Array<{id: string, document: string, metadata: any}> {
    const topics = [
      {
        category: 'AI/ML',
        keywords: ['machine learning', 'artificial intelligence', 'neural networks', 'deep learning', 'algorithms'],
        content: 'Advanced research in machine learning algorithms and artificial intelligence applications for modern data processing'
      },
      {
        category: 'Web Development',
        keywords: ['javascript', 'react', 'frontend', 'backend', 'nodejs'],
        content: 'Web development using modern JavaScript frameworks like React and Node.js for building scalable applications'
      },
      {
        category: 'Data Science',
        keywords: ['data analysis', 'statistics', 'python', 'pandas', 'visualization'],
        content: 'Data science methodologies using Python libraries like pandas for statistical analysis and data visualization'
      },
      {
        category: 'Project Management',
        keywords: ['agile', 'scrum', 'planning', 'team', 'deliverables'],
        content: 'Project management techniques using agile methodologies and scrum practices for team coordination'
      },
      {
        category: 'Security',
        keywords: ['cybersecurity', 'encryption', 'authentication', 'privacy', 'compliance'],
        content: 'Cybersecurity best practices including encryption methods and authentication systems for data privacy'
      }
    ];

    const documents = [];
    topics.forEach((topic, topicIndex) => {
      for (let i = 0; i < 10; i++) {
        documents.push({
          id: `semantic-doc-${topicIndex}-${i}`,
          document: `${topic.content} ${topic.keywords.join(' ')} - Document ${i + 1}`,
          metadata: {
            category: topic.category,
            topicIndex,
            documentIndex: i,
            keywords: topic.keywords.join(','),
            title: `${topic.category} Document ${i + 1}`
          }
        });
      }
    });

    return documents;
  }
}

/**
 * Test utilities for common operations
 */
export class OneNoteTestUtils {
  
  /**
   * Create a mock GraphClient with common responses
   */
  static createMockGraphClient(): any {
    return {
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
      authenticateUser: jest.fn(),
      refreshToken: jest.fn(),
      isAuthenticated: jest.fn().mockReturnValue(true),
      getCurrentUser: jest.fn().mockResolvedValue({ id: 'test-user-123' }),
      setUserId: jest.fn(),
      getRateLimit: jest.fn(),
      getHealthStatus: jest.fn(),
      dispose: jest.fn()
    };
  }

  /**
   * Create a mock Logger
   */
  static createMockLogger(): any {
    return {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      trace: jest.fn(),
      fatal: jest.fn()
    };
  }

  /**
   * Wait for async operations to complete
   */
  static async waitForAsync(ms: number = 0): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Assert that a mock was called with specific parameters
   */
  static expectMockCalledWith(mock: jest.Mock, expectedCalls: any[]): void {
    expectedCalls.forEach((expectedCall, index) => {
      expect(mock).toHaveBeenNthCalledWith(index + 1, ...expectedCall);
    });
  }

  /**
   * Create performance measurement utility
   */
  static createPerformanceMeasurer(): {
    start: () => void;
    end: () => number;
    measure: <T>(fn: () => T | Promise<T>) => Promise<{ result: T; duration: number }>;
  } {
    let startTime: number = 0;

    return {
      start: () => {
        startTime = Date.now();
      },
      end: () => {
        return Date.now() - startTime;
      },
      measure: async <T>(fn: () => T | Promise<T>) => {
        const start = Date.now();
        const result = await fn();
        const duration = Date.now() - start;
        return { result, duration };
      }
    };
  }

  /**
   * Validate OneNote HTML structure
   */
  static validateHtmlStructure(html: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for basic HTML structure
    if (!html.includes('<html>')) {
      errors.push('Missing <html> tag');
    }
    if (!html.includes('<body>')) {
      errors.push('Missing <body> tag');
    }
    if (!html.includes('</html>')) {
      errors.push('Missing closing </html> tag');
    }
    if (!html.includes('</body>')) {
      errors.push('Missing closing </body> tag');
    }

    // Check for potential security issues
    if (html.includes('<script>')) {
      warnings.push('Contains <script> tags - may be removed by OneNote');
    }
    if (html.includes('javascript:')) {
      warnings.push('Contains javascript: URLs - may be removed by OneNote');
    }
    if (html.includes('onclick=') || html.includes('onload=')) {
      warnings.push('Contains event handlers - may be removed by OneNote');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }
}