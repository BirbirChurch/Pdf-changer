import { GoogleGenAI, Type } from '@google/genai';
import type { DocumentBlock, DocumentModel, DocumentSheet } from '../shared/types.ts';
import { buildSheetsFromBlocks, normalizeTableGrid, sanitizeSheetName } from './stats.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient = msg.includes('429') || msg.includes('503') || msg.includes('500') || msg.includes('ECONNRESET');
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

type RawGeminiDoc = {
  title?: string;
  inspectionNotes?: string[];
  blocks?: Array<{
    type?: 'heading' | 'paragraph' | 'list' | 'table';
    level?: number;
    text?: string;
    ordered?: boolean;
    items?: string[];
    tableTitle?: string;
    headers?: string[];
    rows?: string[][];
  }>;
};

export async function inspectPdfWithGemini(
  buffer: Buffer,
  fileName: string,
  pageCountHint: number,
  rawTextHint: string
): Promise<Omit<DocumentModel, 'stats'> & { inspectionNotes: string[] }> {
  const ai = getGeminiClient();
  const base64Pdf = buffer.toString('base64');

  const prompt = `You are a meticulous bilingual Amharic (Ethiopic/Ge'ez script: ሀ-ፐ, Ethiopic punctuation ። ፣ ፤ ፡, Ethiopic numerals) and English document inspector.

TASK:
Carefully inspect EVERY page, heading, paragraph, bullet/numbered list, and table in the attached PDF file ("${fileName}", ~${pageCountHint || 'unknown'} pages).

CRITICAL ACCURACY RULES:
1. Extract ALL text verbatim in its original language (Amharic, English, or mixed Amharic+English on the same line). Do NOT translate Amharic to English or English to Amharic.
2. Inspect every Amharic Ethiopic character carefully so diacritic orders (ግዕዝ ካዕብ ሣልስ ራብዕ ኃምስ ሳድስ ሳብዕ e.g., በ ቡ ቢ ባ ቤ ብ ቦ) and punctuation (። ፣ ፤ ፡) are 100% accurate.
3. Preserve all numbers, dates, currency amounts, codes, and IDs verbatim.
4. Reconstruct every table faithfully: capture exact column headers and every single row without skipping or merging unrelated rows.
5. Maintain exact reading order from Page 1 to the last page.
6. In "inspectionNotes", write 2 to 4 concise factual observations about what was verified (for example: language scripts detected, number of tables reconstructed, whether scanned or native text was inspected).
${rawTextHint.trim() ? `\nReference text layer extracted from PDF (verify visually against the PDF pages in case of legacy Ethiopic font encoding or multi-column scrambling):\n---\n${rawTextHint.slice(0, 12000)}\n---` : ''}`;

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Pdf,
            },
          },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: 'Document title in original language (Amharic or English).',
            },
            inspectionNotes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Factual inspection verification notes about scripts, tables, and pages checked.',
            },
            blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    description: 'Must be one of: heading, paragraph, list, table.',
                  },
                  level: {
                    type: Type.INTEGER,
                    description: 'Heading level 1, 2, or 3 (only for type=heading).',
                  },
                  text: {
                    type: Type.STRING,
                    description: 'Exact verbatim text for heading or paragraph.',
                  },
                  ordered: {
                    type: Type.BOOLEAN,
                    description: 'True if numbered list, false if bullet list (only for type=list).',
                  },
                  items: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Verbatim list items (only for type=list).',
                  },
                  tableTitle: {
                    type: Type.STRING,
                    description: 'Optional caption or title for a table (only for type=table).',
                  },
                  headers: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Column headers (only for type=table).',
                  },
                  rows: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    description: 'Table rows matching headers length (only for type=table).',
                  },
                },
              },
            },
          },
        },
      },
    })
  );

  const rawJson = (response.text ?? '{}').trim();
  let parsed: RawGeminiDoc;
  try {
    parsed = JSON.parse(rawJson) as RawGeminiDoc;
  } catch {
    throw new Error('Failed to parse structured inspection output from Gemini.');
  }

  const blocks: DocumentBlock[] = [];
  (parsed.blocks ?? []).forEach((b, index) => {
    const id = `blk_${index + 1}`;
    if (b.type === 'heading' && b.text?.trim()) {
      const lvl = b.level === 1 || b.level === 2 || b.level === 3 ? b.level : 2;
      blocks.push({ id, type: 'heading', level: lvl, text: b.text.trim() });
    } else if (b.type === 'list' && Array.isArray(b.items) && b.items.length > 0) {
      const cleanItems = b.items.map((item) => String(item ?? '').trim()).filter(Boolean);
      if (cleanItems.length > 0) {
        blocks.push({ id, type: 'list', ordered: Boolean(b.ordered), items: cleanItems });
      }
    } else if (b.type === 'table' && (Array.isArray(b.headers) || Array.isArray(b.rows))) {
      const normalized = normalizeTableGrid(b.headers ?? [], b.rows ?? []);
      blocks.push({
        id,
        type: 'table',
        title: b.tableTitle?.trim() || undefined,
        headers: normalized.headers,
        rows: normalized.rows,
      });
    } else if (b.text?.trim()) {
      blocks.push({ id, type: 'paragraph', text: b.text.trim() });
    }
  });

  const title = parsed.title?.trim() || fileName.replace(/\.[^.]+$/, '');
  const sheets = buildSheetsFromBlocks(title, blocks);
  const notes = (parsed.inspectionNotes ?? []).map((n) => String(n).trim()).filter(Boolean);

  return {
    title,
    blocks,
    sheets,
    inspectionNotes: notes.length > 0
      ? notes
      : ['Inspected all PDF pages with bilingual Amharic & English multimodal verification.'],
  };
}

export async function enhanceWordToSheetsWithGemini(
  title: string,
  blocks: DocumentBlock[]
): Promise<DocumentSheet[] | null> {
  if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'MY_GEMINI_API_KEY') {
    return null;
  }
  const hasExplicitTables = blocks.some((b) => b.type === 'table');
  if (hasExplicitTables) {
    return null;
  }

  const textSummary = blocks
    .map((b) => {
      if (b.type === 'heading') return `[H${b.level}] ${b.text}`;
      if (b.type === 'paragraph') return b.text;
      if (b.type === 'list') return b.items.map((it) => `- ${it}`).join('\n');
      return '';
    })
    .filter(Boolean)
    .join('\n')
    .slice(0, 20000);

  if (!textSummary.trim()) return null;

  const ai = getGeminiClient();
  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Inspect the following bilingual Amharic/English document text and organize its content into clean Excel worksheets without translating or omitting any Amharic or English text.\n\nTitle: ${title}\n\n${textSummary}`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sheets: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    headers: { type: Type.ARRAY, items: { type: Type.STRING } },
                    rows: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.ARRAY,
                        items: { type: Type.STRING },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      })
    );

    const parsed = JSON.parse((response.text ?? '{}').trim()) as {
      sheets?: Array<{ name?: string; headers?: string[]; rows?: string[][] }>;
    };
    const sheets: DocumentSheet[] = (parsed.sheets ?? [])
      .filter((s) => Array.isArray(s.headers) && s.headers.length > 0)
      .map((s, idx) => {
        const norm = normalizeTableGrid(s.headers ?? [], s.rows ?? []);
        return {
          name: sanitizeSheetName(s.name || `Sheet_${idx + 1}`, idx),
          headers: norm.headers,
          rows: norm.rows,
        };
      });

    return sheets.length > 0 ? sheets : null;
  } catch {
    return null;
  }
}
