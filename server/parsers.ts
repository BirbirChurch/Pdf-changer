import * as cheerio from 'cheerio';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import * as XLSX from 'xlsx';
import type { DocumentBlock, DocumentModel, DocumentSheet } from '../shared/types.ts';
import { enhanceWordToSheetsWithGemini, inspectPdfWithGemini } from './geminiInspector.ts';
import { buildSheetsFromBlocks, normalizeTableGrid, recomputeStats, sanitizeSheetName } from './stats.ts';

export async function parsePdfDocument(
  buffer: Buffer,
  fileName: string,
  fileSizeBytes: number
): Promise<DocumentModel> {
  let pageCount = 1;
  let rawText = '';

  try {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const textResult = await parser.getText();
    pageCount = textResult.total || 1;
    rawText = textResult.text || '';
    await parser.destroy();
  } catch {
    // Some scanned or encrypted PDFs fail text-layer extraction; Gemini multimodal inspection handles them directly.
  }

  const inspected = await inspectPdfWithGemini(buffer, fileName, pageCount, rawText);

  const initialModel: DocumentModel = {
    title: inspected.title,
    blocks: inspected.blocks,
    sheets: inspected.sheets,
    stats: {
      sourceFormat: 'pdf',
      fileName,
      fileSizeBytes,
      pageOrSheetCount: pageCount,
      paragraphCount: 0,
      tableCount: 0,
      ethiopicCharCount: 0,
      latinCharCount: 0,
      detectedScript: 'other',
      inspectionMethod: 'gemini-vision-ocr',
      inspectionNotes: inspected.inspectionNotes,
    },
  };

  return recomputeStats(initialModel);
}

export async function parseDocxDocument(
  buffer: Buffer,
  fileName: string,
  fileSizeBytes: number
): Promise<DocumentModel> {
  const result = await mammoth.convertToHtml({ buffer });
  const html = result.value || '';
  const $ = cheerio.load(html);

  const blocks: DocumentBlock[] = [];
  let blockIndex = 1;

  const rootChildren = $('body').children();
  rootChildren.each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    if (!tag) return;

    if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text) {
        const level = tag === 'h1' ? 1 : tag === 'h2' ? 2 : 3;
        blocks.push({ id: `blk_${blockIndex++}`, type: 'heading', level, text });
      }
    } else if (tag === 'p') {
      const text = $(el).text().replace(/\s+/g, ' ').trim();
      if (text) {
        blocks.push({ id: `blk_${blockIndex++}`, type: 'paragraph', text });
      }
    } else if (tag === 'ul' || tag === 'ol') {
      const items: string[] = [];
      $(el)
        .find('> li')
        .each((__, li) => {
          const itemText = $(li).text().replace(/\s+/g, ' ').trim();
          if (itemText) items.push(itemText);
        });
      if (items.length > 0) {
        blocks.push({
          id: `blk_${blockIndex++}`,
          type: 'list',
          ordered: tag === 'ol',
          items,
        });
      }
    } else if (tag === 'table') {
      const allRows: string[][] = [];
      $(el)
        .find('tr')
        .each((__, tr) => {
          const rowCells: string[] = [];
          $(tr)
            .find('th, td')
            .each((___, cell) => {
              rowCells.push($(cell).text().replace(/\s+/g, ' ').trim());
            });
          if (rowCells.some((c) => c.length > 0)) {
            allRows.push(rowCells);
          }
        });

      if (allRows.length > 0) {
        const headers = allRows[0];
        const rows = allRows.slice(1);
        const norm = normalizeTableGrid(headers, rows);
        blocks.push({
          id: `blk_${blockIndex++}`,
          type: 'table',
          headers: norm.headers,
          rows: norm.rows,
        });
      }
    }
  });

  // Fallback to raw text if HTML yielded no blocks
  if (blocks.length === 0) {
    const rawResult = await mammoth.extractRawText({ buffer });
    const lines = (rawResult.value || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    lines.forEach((line, idx) => {
      blocks.push({
        id: `blk_${idx + 1}`,
        type: idx === 0 ? 'heading' : 'paragraph',
        ...(idx === 0 ? { level: 1 as const } : {}),
        text: line,
      } as DocumentBlock);
    });
  }

  const firstHeading = blocks.find((b) => b.type === 'heading');
  const title = firstHeading && firstHeading.type === 'heading'
    ? firstHeading.text
    : fileName.replace(/\.[^.]+$/, '');

  let sheets = buildSheetsFromBlocks(title, blocks);
  const notes: string[] = [
    `Extracted ${blocks.length} structured elements from Word (.docx) XML with full UTF-8 Ethiopic & Latin preservation.`,
  ];

  // If the Word doc had no explicit tables, optionally enrich Excel representation using Gemini
  const hasExplicitTables = blocks.some((b) => b.type === 'table');
  if (!hasExplicitTables && blocks.length > 0) {
    const aiSheets = await enhanceWordToSheetsWithGemini(title, blocks);
    if (aiSheets && aiSheets.length > 0) {
      sheets = [...aiSheets, ...sheets];
      notes.push('Structured narrative content into tabular Excel worksheets for clean spreadsheet export.');
    }
  } else if (hasExplicitTables) {
    const tblCount = blocks.filter((b) => b.type === 'table').length;
    notes.push(`Preserved ${tblCount} Word table${tblCount > 1 ? 's' : ''} with exact cell alignment.`);
  }

  if (result.messages.length > 0) {
    const warnings = result.messages.filter((m) => m.type === 'warning').length;
    if (warnings > 0) {
      notes.push(`Inspected ${warnings} formatting note${warnings > 1 ? 's' : ''} during Word parsing.`);
    }
  }

  const model: DocumentModel = {
    title,
    blocks,
    sheets,
    stats: {
      sourceFormat: 'docx',
      fileName,
      fileSizeBytes,
      pageOrSheetCount: Math.max(1, Math.ceil(blocks.length / 12)),
      paragraphCount: 0,
      tableCount: 0,
      ethiopicCharCount: 0,
      latinCharCount: 0,
      detectedScript: 'other',
      inspectionMethod: 'structured-xml',
      inspectionNotes: notes,
    },
  };

  return recomputeStats(model);
}

export async function parseExcelDocument(
  buffer: Buffer,
  fileName: string,
  fileSizeBytes: number
): Promise<DocumentModel> {
  const isCsv = fileName.toLowerCase().endsWith('.csv');
  const workbook = isCsv
    ? XLSX.read(buffer.toString('utf8'), { type: 'string' })
    : XLSX.read(buffer, { type: 'buffer', codepage: 65001, cellDates: true });

  const sheets: DocumentSheet[] = [];
  const blocks: DocumentBlock[] = [];
  let blockIndex = 1;

  workbook.SheetNames.forEach((rawSheetName, sIdx) => {
    const ws = workbook.Sheets[rawSheetName];
    if (!ws) return;

    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      raw: false,
      defval: '',
    });

    // Trim completely empty trailing rows
    const nonEmptyRows = matrix.filter((row) =>
      Array.isArray(row) && row.some((cell) => String(cell ?? '').trim() !== '')
    );

    if (nonEmptyRows.length === 0) return;

    const maxCols = Math.max(...nonEmptyRows.map((r) => r.length), 1);
    const firstRow = nonEmptyRows[0].map((c, colIdx) => {
      const val = String(c ?? '').trim();
      return val || `Column ${colIdx + 1}`;
    });
    const headers = Array.from({ length: maxCols }, (_, i) => firstRow[i] ?? `Column ${i + 1}`);

    const dataRows = nonEmptyRows.slice(1).map((row) =>
      Array.from({ length: maxCols }, (_, i) => String(row[i] ?? '').trim())
    );

    const cleanName = sanitizeSheetName(rawSheetName, sIdx);
    sheets.push({
      name: cleanName,
      headers,
      rows: dataRows,
    });

    blocks.push({
      id: `blk_${blockIndex++}`,
      type: 'heading',
      level: 2,
      text: rawSheetName,
    });
    blocks.push({
      id: `blk_${blockIndex++}`,
      type: 'table',
      title: rawSheetName,
      headers,
      rows: dataRows,
    });
  });

  if (sheets.length === 0) {
    sheets.push({
      name: 'Sheet1',
      headers: ['Column 1'],
      rows: [['']],
    });
  }

  const title = fileName.replace(/\.[^.]+$/, '');
  const totalRows = sheets.reduce((acc, s) => acc + s.rows.length, 0);

  const model: DocumentModel = {
    title,
    blocks,
    sheets,
    stats: {
      sourceFormat: 'xlsx',
      fileName,
      fileSizeBytes,
      pageOrSheetCount: sheets.length,
      paragraphCount: 0,
      tableCount: sheets.length,
      ethiopicCharCount: 0,
      latinCharCount: 0,
      detectedScript: 'other',
      inspectionMethod: 'spreadsheet-engine',
      inspectionNotes: [
        `Inspected ${sheets.length} worksheet${sheets.length > 1 ? 's' : ''} (${totalRows} data rows) with UTF-8 Amharic & English cell preservation.`,
      ],
    },
  };

  return recomputeStats(model);
}
