import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
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
    type?: 'heading' | 'paragraph' | 'list';
    level?: number;
    text?: string;
    ordered?: boolean;
    items?: string[];
  }>;
  tables?: Array<{
    tableTitle?: string;
    headers?: string[];
    rows?: Array<{ cells?: string[] } | string[]>;
  }>;
};

function buildFallbackBlocksFromRawText(rawText: string, fileName: string): { title: string; blocks: DocumentBlock[] } {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(l) && !/^Page\s+\d+\s+of\s+\d+$/i.test(l));

  const title = lines[0]?.slice(0, 140) || fileName.replace(/\.[^.]+$/, '');
  const blocks: DocumentBlock[] = [];
  let idx = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.length <= 140) {
      blocks.push({ id: `blk_${idx++}`, type: 'heading', level: 1, text: line });
    } else if (/^[•\-*]\s+/.test(line)) {
      const items: string[] = [line.replace(/^[•\-*]\s+/, '').trim()];
      while (i + 1 < lines.length && /^[•\-*]\s+/.test(lines[i + 1])) {
        i++;
        items.push(lines[i].replace(/^[•\-*]\s+/, '').trim());
      }
      blocks.push({ id: `blk_${idx++}`, type: 'list', ordered: false, items });
    } else {
      blocks.push({ id: `blk_${idx++}`, type: 'paragraph', text: line });
    }
  }

  return { title, blocks };
}

export async function inspectPdfWithGemini(
  buffer: Buffer,
  fileName: string,
  pageCountHint: number,
  rawTextHint: string
): Promise<Omit<DocumentModel, 'stats'> & { inspectionNotes: string[] }> {
  const ai = getGeminiClient();
  const base64Pdf = buffer.toString('base64');

  const prompt = `Inspect EVERY page of the attached PDF ("${fileName}", ${pageCountHint || 1} page(s)) and extract 100% of its content into the JSON fields:

1. "title": ONLY the short main document title (under 140 chars). Never put body paragraphs here.
2. "blocks": EVERY heading, paragraph, and bullet/numbered list in reading order.
   - For headings: type="heading", level=1|2|3, text="..."
   - For paragraphs: type="paragraph", text="..."
   - For bullet/numbered lists: type="list", ordered=true/false, items=[every single bullet/numbered item as a separate string in the array]
3. "tables": EVERY table on EVERY page.
   - Put the table caption/name in "tableTitle".
   - Put all column headers in "headers".
   - Put EVERY single data row in "rows" as { "cells": ["col1", "col2", ...] }. Do NOT skip any row!
4. Preserve ALL Amharic (Ethiopic Ge'ez script ሀ-ፐ, punctuation ። ፣ ፤ ፡) and English text verbatim. Never translate or summarize.
5. "inspectionNotes": 2-3 concise factual verification notes.
${rawTextHint.trim() ? `\nText layer reference (verify against PDF visual pages so every bullet item and every table row is captured):\n---\n${rawTextHint.slice(0, 12000)}\n---` : ''}`;

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
        systemInstruction:
          'You are a meticulous bilingual Amharic (Ethiopic) and English document parser. Extract every heading, paragraph, list item, and table row completely verbatim.',
        thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          required: ['title', 'blocks', 'tables', 'inspectionNotes'],
          properties: {
            title: {
              type: Type.STRING,
              description: 'Short document title only (under 140 chars).',
            },
            inspectionNotes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2-3 factual verification notes.',
            },
            blocks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['type'],
                properties: {
                  type: {
                    type: Type.STRING,
                    enum: ['heading', 'paragraph', 'list'],
                  },
                  level: {
                    type: Type.INTEGER,
                    description: '1, 2, or 3 when type is heading.',
                  },
                  text: {
                    type: Type.STRING,
                    description: 'Verbatim text when type is heading or paragraph.',
                  },
                  ordered: {
                    type: Type.BOOLEAN,
                    description: 'True if numbered list, false if bullet list.',
                  },
                  items: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: 'Every single item in the list when type is list.',
                  },
                },
              },
            },
            tables: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ['headers', 'rows'],
                properties: {
                  tableTitle: {
                    type: Type.STRING,
                    description: 'Table caption or section title.',
                  },
                  headers: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  rows: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      required: ['cells'],
                      properties: {
                        cells: {
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
  let blkCounter = 1;
  (parsed.blocks ?? []).forEach((b) => {
    const id = `blk_${blkCounter++}`;
    if (b.type === 'heading' && b.text?.trim()) {
      const lvl = b.level === 1 || b.level === 2 || b.level === 3 ? b.level : 2;
      blocks.push({ id, type: 'heading', level: lvl, text: b.text.trim() });
    } else if (b.type === 'list') {
      const listItems =
        Array.isArray(b.items) && b.items.length > 0
          ? b.items.map((item) => String(item ?? '').trim()).filter(Boolean)
          : (b.text ?? '')
              .split(/\r?\n/)
              .map((line) => line.replace(/^[•\-*\d.)]+\s*/, '').trim())
              .filter(Boolean);
      if (listItems.length > 0) {
        blocks.push({ id, type: 'list', ordered: Boolean(b.ordered), items: listItems });
      }
    } else if (b.text?.trim()) {
      blocks.push({ id, type: 'paragraph', text: b.text.trim() });
    }
  });

  (parsed.tables ?? []).forEach((tbl) => {
    const rawRows = (tbl.rows ?? []).map((r) =>
      Array.isArray(r) ? r.map((c) => String(c ?? '')) : (r.cells ?? []).map((c) => String(c ?? ''))
    );
    if ((tbl.headers && tbl.headers.length > 0) || rawRows.length > 0) {
      const normalized = normalizeTableGrid(tbl.headers ?? [], rawRows);
      blocks.push({
        id: `blk_${blkCounter++}`,
        type: 'table',
        title: tbl.tableTitle?.trim() || undefined,
        headers: normalized.headers,
        rows: normalized.rows,
      });
    }
  });

  let title = parsed.title?.trim() || fileName.replace(/\.[^.]+$/, '');
  if (blocks.length === 0 && rawTextHint.trim()) {
    const fallback = buildFallbackBlocksFromRawText(rawTextHint, fileName);
    title = fallback.title;
    blocks.push(...fallback.blocks);
  } else if (title.length > 180) {
    title = title.slice(0, 140).trim();
  }

  const sheets = buildSheetsFromBlocks(title, blocks);
  const notes = (parsed.inspectionNotes ?? []).map((n) => String(n).trim()).filter(Boolean);

  return {
    title,
    blocks,
    sheets,
    inspectionNotes:
      notes.length > 0
        ? notes
        : ['Inspected all PDF pages with bilingual Amharic & English verification.'],
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
    .slice(0, 15000);

  if (!textSummary.trim()) return null;

  const ai = getGeminiClient();
  try {
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Organize the following bilingual Amharic/English document text into clean Excel worksheets without translating or omitting any text.\n\nTitle: ${title}\n\n${textSummary}`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
                        type: Type.OBJECT,
                        properties: {
                          cells: { type: Type.ARRAY, items: { type: Type.STRING } },
                        },
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
      sheets?: Array<{ name?: string; headers?: string[]; rows?: Array<{ cells?: string[] } | string[]> }>;
    };
    const sheets: DocumentSheet[] = (parsed.sheets ?? [])
      .filter((s) => Array.isArray(s.headers) && s.headers.length > 0)
      .map((s, idx) => {
        const rawRows = (s.rows ?? []).map((r) =>
          Array.isArray(r) ? r.map((c) => String(c ?? '')) : (r.cells ?? []).map((c) => String(c ?? ''))
        );
        const norm = normalizeTableGrid(s.headers ?? [], rawRows);
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
