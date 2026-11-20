import type {
  DetectedScript,
  DocumentBlock,
  DocumentModel,
  DocumentSheet,
  FileFormat,
} from '../shared/types.ts';

const ETHIOPIC_CHAR_REGEX = /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]/g;
const LATIN_LETTER_REGEX = /[A-Za-z]/g;

export function countScripts(text: string): { ethiopic: number; latin: number } {
  const ethiopicMatches = text.match(ETHIOPIC_CHAR_REGEX);
  const latinMatches = text.match(LATIN_LETTER_REGEX);
  return {
    ethiopic: ethiopicMatches ? ethiopicMatches.length : 0,
    latin: latinMatches ? latinMatches.length : 0,
  };
}

export function detectScript(ethiopicCount: number, latinCount: number): DetectedScript {
  if (ethiopicCount > 0 && latinCount > 0) return 'bilingual';
  if (ethiopicCount > 0) return 'amharic';
  if (latinCount > 0) return 'english';
  return 'other';
}

export function collectAllText(blocks: DocumentBlock[], sheets: DocumentSheet[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'heading' || block.type === 'paragraph') {
      parts.push(block.text);
    } else if (block.type === 'list') {
      parts.push(...block.items);
    } else if (block.type === 'table') {
      if (block.title) parts.push(block.title);
      parts.push(...block.headers);
      for (const row of block.rows) {
        parts.push(...row);
      }
    }
  }
  if (blocks.length === 0) {
    for (const sheet of sheets) {
      parts.push(sheet.name, ...sheet.headers);
      for (const row of sheet.rows) {
        parts.push(...row);
      }
    }
  }
  return parts.join('\n');
}

export function normalizeTableGrid(headers: string[], rows: string[][]): { headers: string[]; rows: string[][] } {
  const maxCols = Math.max(
    headers.length,
    ...rows.map((r) => r.length),
    1
  );
  const normHeaders = Array.from({ length: maxCols }, (_, i) => String(headers[i] ?? `Column ${i + 1}`).trim());
  const normRows = rows.map((row) =>
    Array.from({ length: maxCols }, (_, i) => String(row[i] ?? '').trim())
  );
  return { headers: normHeaders, rows: normRows };
}

export function buildSheetsFromBlocks(title: string, blocks: DocumentBlock[]): DocumentSheet[] {
  const sheets: DocumentSheet[] = [];
  const tableBlocks = blocks.filter((b) => b.type === 'table');

  tableBlocks.forEach((tbl, idx) => {
    const normalized = normalizeTableGrid(tbl.headers, tbl.rows);
    const rawName = (tbl.title || `Table_${idx + 1}`).trim();
    sheets.push({
      name: sanitizeSheetName(rawName, idx),
      headers: normalized.headers,
      rows: normalized.rows,
    });
  });

  // Also include a structured text/narrative sheet when non-table content exists
  const nonTableRows: string[][] = [];
  let sectionIndex = 1;
  let currentSection = title || 'Document';

  for (const block of blocks) {
    if (block.type === 'heading') {
      currentSection = block.text;
      nonTableRows.push([String(sectionIndex++), `Heading H${block.level}`, currentSection, block.text]);
    } else if (block.type === 'paragraph') {
      if (block.text.trim()) {
        nonTableRows.push([String(sectionIndex++), 'Paragraph', currentSection, block.text.trim()]);
      }
    } else if (block.type === 'list') {
      block.items.forEach((item, itemIdx) => {
        if (item.trim()) {
          nonTableRows.push([
            String(sectionIndex++),
            block.ordered ? `List Item ${itemIdx + 1}` : 'Bullet Item',
            currentSection,
            item.trim(),
          ]);
        }
      });
    }
  }

  if (nonTableRows.length > 0) {
    sheets.push({
      name: sanitizeSheetName(sheets.length > 0 ? 'Document_Text' : 'Document_Content', sheets.length),
      headers: ['#', 'Element Type', 'Section', 'Content (Amharic / English)'],
      rows: nonTableRows,
    });
  }

  if (sheets.length === 0) {
    sheets.push({
      name: 'Sheet1',
      headers: ['Content'],
      rows: [['']],
    });
  }

  return sheets;
}

export function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[:\\/?*\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const base = cleaned || `Sheet_${index + 1}`;
  return base.slice(0, 31);
}

export function recomputeStats(
  doc: DocumentModel,
  overrides?: Partial<{
    sourceFormat: FileFormat;
    fileName: string;
    fileSizeBytes: number;
    pageOrSheetCount: number;
    inspectionMethod: DocumentModel['stats']['inspectionMethod'];
    inspectionNotes: string[];
  }>
): DocumentModel {
  const allText = collectAllText(doc.blocks, doc.sheets);
  const { ethiopic, latin } = countScripts(allText);
  const paragraphCount = doc.blocks.filter((b) => b.type === 'paragraph' || b.type === 'list' || b.type === 'heading').length;
  const tableCount = doc.blocks.filter((b) => b.type === 'table').length || doc.sheets.length;

  return {
    ...doc,
    stats: {
      sourceFormat: overrides?.sourceFormat ?? doc.stats.sourceFormat,
      fileName: overrides?.fileName ?? doc.stats.fileName,
      fileSizeBytes: overrides?.fileSizeBytes ?? doc.stats.fileSizeBytes,
      pageOrSheetCount: overrides?.pageOrSheetCount ?? doc.stats.pageOrSheetCount,
      paragraphCount,
      tableCount,
      ethiopicCharCount: ethiopic,
      latinCharCount: latin,
      detectedScript: detectScript(ethiopic, latin),
      inspectionMethod: overrides?.inspectionMethod ?? doc.stats.inspectionMethod,
      inspectionNotes: overrides?.inspectionNotes ?? doc.stats.inspectionNotes,
    },
  };
}

export function getAvailableTargets(source: FileFormat): FileFormat[] {
  if (source === 'pdf') return ['docx', 'xlsx'];
  if (source === 'xlsx') return ['pdf', 'docx'];
  return ['pdf', 'xlsx'];
}
