import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import type { DocumentModel, PdfExportOptions } from '../shared/types.ts';
import { normalizeTableGrid, sanitizeSheetName } from './stats.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FONTS_DIR = path.join(__dirname, 'fonts');

const FONT_PATHS = {
  ethiopicRegular: path.join(FONTS_DIR, 'NotoSansEthiopic-Regular.ttf'),
  ethiopicBold: path.join(FONTS_DIR, 'NotoSansEthiopic-Bold.ttf'),
  latinRegular: path.join(FONTS_DIR, 'NotoSans-Regular.ttf'),
  latinBold: path.join(FONTS_DIR, 'NotoSans-Bold.ttf'),
};

const ETHIOPIC_SEGMENT_REGEX = /([\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F\uFE20-\uFE2F]+)/g;

function isEthiopicSegment(str: string): boolean {
  return /[\u1200-\u137F\u1380-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]/.test(str);
}

function splitBilingualRuns(text: string): Array<{ text: string; isEthiopic: boolean }> {
  if (!text) return [];
  const rawParts = text.split(ETHIOPIC_SEGMENT_REGEX).filter((p) => p.length > 0);
  const merged: Array<{ text: string; isEthiopic: boolean }> = [];
  for (const part of rawParts) {
    const eth = isEthiopicSegment(part);
    const last = merged[merged.length - 1];
    if (last && last.isEthiopic === eth) {
      last.text += part;
    } else {
      merged.push({ text: part, isEthiopic: eth });
    }
  }
  return merged;
}

function makeDocxTextRun(text: string, opts?: { bold?: boolean; size?: number; color?: string }): TextRun {
  return new TextRun({
    text,
    bold: opts?.bold,
    size: opts?.size ?? 22,
    color: opts?.color ?? '0F172A',
    font: {
      name: 'Noto Sans Ethiopic',
      ascii: 'Calibri',
      hAnsi: 'Calibri',
      cs: 'Noto Sans Ethiopic',
      eastAsia: 'Noto Sans Ethiopic',
    },
  });
}

export async function generateDocxBuffer(model: DocumentModel): Promise<Buffer> {
  const children: Array<Paragraph | Table> = [];

  if (model.title) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        spacing: { after: 240 },
        children: [makeDocxTextRun(model.title, { bold: true, size: 36, color: '0F172A' })],
      })
    );
  }

  const blocks =
    model.blocks.length > 0
      ? model.blocks
      : model.sheets.flatMap((s, idx) => [
          { id: `sh_h_${idx}`, type: 'heading' as const, level: 2 as const, text: s.name },
          { id: `sh_t_${idx}`, type: 'table' as const, title: s.name, headers: s.headers, rows: s.rows },
        ]);

  for (const block of blocks) {
    if (block.type === 'heading') {
      const headingLevel =
        block.level === 1
          ? HeadingLevel.HEADING_1
          : block.level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3;
      const size = block.level === 1 ? 30 : block.level === 2 ? 26 : 23;
      children.push(
        new Paragraph({
          heading: headingLevel,
          spacing: { before: 220, after: 120 },
          children: [makeDocxTextRun(block.text, { bold: true, size, color: '1E293B' })],
        })
      );
    } else if (block.type === 'paragraph') {
      children.push(
        new Paragraph({
          spacing: { after: 140, line: 300 },
          children: [makeDocxTextRun(block.text, { size: 22 })],
        })
      );
    } else if (block.type === 'list') {
      block.items.forEach((item, idx) => {
        const prefix = block.ordered ? `${idx + 1}. ` : '• ';
        children.push(
          new Paragraph({
            indent: { left: 420 },
            spacing: { after: 80, line: 280 },
            children: [makeDocxTextRun(`${prefix}${item}`, { size: 22 })],
          })
        );
      });
    } else if (block.type === 'table') {
      if (block.title) {
        children.push(
          new Paragraph({
            spacing: { before: 160, after: 80 },
            children: [makeDocxTextRun(block.title, { bold: true, size: 22, color: '334155' })],
          })
        );
      }
      const norm = normalizeTableGrid(block.headers, block.rows);
      const colCount = Math.max(norm.headers.length, 1);
      const colWidthPct = Math.floor(100 / colCount);

      const tableRows: TableRow[] = [];

      tableRows.push(
        new TableRow({
          tableHeader: true,
          children: norm.headers.map(
            (header) =>
              new TableCell({
                width: { size: colWidthPct, type: WidthType.PERCENTAGE },
                shading: { type: ShadingType.CLEAR, fill: '1E3A8A', color: 'auto' },
                margins: { top: 100, bottom: 100, left: 120, right: 120 },
                children: [
                  new Paragraph({
                    children: [makeDocxTextRun(header, { bold: true, size: 20, color: 'FFFFFF' })],
                  }),
                ],
              })
          ),
        })
      );

      norm.rows.forEach((row, rIdx) => {
        const fill = rIdx % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
        tableRows.push(
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  width: { size: colWidthPct, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, fill, color: 'auto' },
                  margins: { top: 80, bottom: 80, left: 120, right: 120 },
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.LEFT,
                      children: [makeDocxTextRun(cell, { size: 20, color: '0F172A' })],
                    }),
                  ],
                })
            ),
          })
        );
      });

      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
            bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
            left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
            right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
            insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
          },
          rows: tableRows,
        })
      );

      children.push(new Paragraph({ spacing: { after: 140 }, children: [] }));
    }
  }

  const docxDoc = new Document({
    creator: 'FidelDocs',
    title: model.title || 'Converted Document',
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
          },
        },
        children,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(docxDoc));
}

export async function generateXlsxBuffer(model: DocumentModel): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FidelDocs';
  workbook.created = new Date();

  const usedNames = new Set<string>();
  const rawSheets =
    model.sheets.length > 0
      ? model.sheets
      : [{ name: 'Document_Content', headers: ['Content'], rows: [[model.title || '']] }];

  rawSheets.forEach((sheet, idx) => {
    const baseName = sanitizeSheetName(sheet.name, idx);
    let uniqueName = baseName;
    let counter = 2;
    while (usedNames.has(uniqueName.toLowerCase())) {
      const suffix = `_${counter++}`;
      uniqueName = `${baseName.slice(0, 31 - suffix.length)}${suffix}`;
    }
    usedNames.add(uniqueName.toLowerCase());

    const ws = workbook.addWorksheet(uniqueName);
    const norm = normalizeTableGrid(sheet.headers, sheet.rows);

    const headerRow = ws.addRow(norm.headers);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Noto Sans Ethiopic', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    });

    norm.rows.forEach((rowData, rIdx) => {
      const row = ws.addRow(rowData);
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.font = { name: 'Noto Sans Ethiopic', size: 10.5, color: { argb: 'FF0F172A' } };
        if (rIdx % 2 === 1) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        }
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
      });
    });

    norm.headers.forEach((header, colIdx) => {
      let maxLen = header.length;
      for (const row of norm.rows) {
        const val = row[colIdx] ?? '';
        if (val.length > maxLen) maxLen = val.length;
      }
      const width = Math.min(Math.max(maxLen + 5, 14), 52);
      ws.getColumn(colIdx + 1).width = width;
    });

    ws.views = [{ state: 'frozen', ySplit: 1 }];
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export async function generatePdfBuffer(
  model: DocumentModel,
  options: PdfExportOptions = { orientation: 'portrait', paperSize: 'A4' }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: options.paperSize || 'A4',
      layout: options.orientation || 'portrait',
      margins: { top: 52, bottom: 52, left: 48, right: 48 },
      bufferPages: true,
      info: {
        Title: model.title || 'Converted Document',
        Creator: 'FidelDocs Bilingual Converter',
      },
    });

    doc.registerFont('Ethiopic', FONT_PATHS.ethiopicRegular);
    doc.registerFont('EthiopicBold', FONT_PATHS.ethiopicBold);
    doc.registerFont('Latin', FONT_PATHS.latinRegular);
    doc.registerFont('LatinBold', FONT_PATHS.latinBold);

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const startX = doc.page.margins.left;
    const maxY = doc.page.height - doc.page.margins.bottom - 18;

    const measureBilingualHeight = (
      text: string,
      width: number,
      fontSize: number,
      bold = false,
      lineGap = 3
    ): number => {
      if (!text.trim()) return fontSize + 4;
      doc.font(bold ? 'EthiopicBold' : 'Ethiopic').fontSize(fontSize);
      const hEth = doc.heightOfString(text, { width, lineGap });
      doc.font(bold ? 'LatinBold' : 'Latin').fontSize(fontSize);
      const hLat = doc.heightOfString(text, { width, lineGap });
      return Math.max(hEth, hLat);
    };

    const drawBilingualText = (
      text: string,
      x: number,
      y: number,
      width: number,
      fontSize: number,
      opts?: { bold?: boolean; color?: string; lineGap?: number; align?: 'left' | 'center' | 'right' }
    ): number => {
      const bold = opts?.bold ?? false;
      const color = opts?.color ?? '#0F172A';
      const lineGap = opts?.lineGap ?? 3;
      const align = opts?.align ?? 'left';

      const runs = splitBilingualRuns(text);
      if (runs.length === 0) return y;

      doc.x = x;
      doc.y = y;

      runs.forEach((run, idx) => {
        const fontName = run.isEthiopic
          ? bold
            ? 'EthiopicBold'
            : 'Ethiopic'
          : bold
            ? 'LatinBold'
            : 'Latin';
        const isLast = idx === runs.length - 1;
        doc.font(fontName).fontSize(fontSize).fillColor(color);
        if (idx === 0) {
          doc.text(run.text, x, y, { width, align, lineGap, continued: !isLast });
        } else {
          // Only pass continued on subsequent runs so PDFKit maintains exact line wrap width and spaces
          doc.text(run.text, { continued: !isLast });
        }
      });

      return doc.y;
    };

    const ensureSpace = (neededHeight: number) => {
      if (doc.y + neededHeight > maxY) {
        doc.addPage();
        doc.y = doc.page.margins.top;
      }
    };

    if (model.title) {
      const titleH = measureBilingualHeight(model.title, pageWidth, 18, true, 4);
      ensureSpace(titleH + 18);
      const endY = drawBilingualText(model.title, startX, doc.y, pageWidth, 18, {
        bold: true,
        color: '#0F172A',
        lineGap: 4,
      });
      doc
        .moveTo(startX, endY + 6)
        .lineTo(startX + pageWidth, endY + 6)
        .lineWidth(0.75)
        .strokeColor('#CBD5E1')
        .stroke();
      doc.y = endY + 16;
    }

    const blocks =
      model.blocks.length > 0
        ? model.blocks
        : model.sheets.flatMap((s, idx) => [
            { id: `sh_h_${idx}`, type: 'heading' as const, level: 2 as const, text: s.name },
            { id: `sh_t_${idx}`, type: 'table' as const, title: s.name, headers: s.headers, rows: s.rows },
          ]);

    for (const block of blocks) {
      if (block.type === 'heading') {
        const fontSize = block.level === 1 ? 14.5 : block.level === 2 ? 12.5 : 11.5;
        const h = measureBilingualHeight(block.text, pageWidth, fontSize, true, 3);
        ensureSpace(h + 16);
        doc.y += 6;
        const endY = drawBilingualText(block.text, startX, doc.y, pageWidth, fontSize, {
          bold: true,
          color: '#1E293B',
          lineGap: 3,
        });
        doc.y = endY + 6;
      } else if (block.type === 'paragraph') {
        const h = measureBilingualHeight(block.text, pageWidth, 10.5, false, 3.5);
        ensureSpace(Math.min(h + 10, maxY - doc.page.margins.top));
        const endY = drawBilingualText(block.text, startX, doc.y, pageWidth, 10.5, {
          color: '#1E293B',
          lineGap: 3.5,
        });
        doc.y = endY + 8;
      } else if (block.type === 'list') {
        block.items.forEach((item, idx) => {
          const prefix = block.ordered ? `${idx + 1}. ` : '• ';
          const line = `${prefix}${item}`;
          const h = measureBilingualHeight(line, pageWidth - 16, 10.5, false, 3);
          ensureSpace(h + 6);
          const endY = drawBilingualText(line, startX + 14, doc.y, pageWidth - 16, 10.5, {
            color: '#1E293B',
            lineGap: 3,
          });
          doc.y = endY + 4;
        });
        doc.y += 6;
      } else if (block.type === 'table') {
        if (block.title) {
          const titleH = measureBilingualHeight(block.title, pageWidth, 11, true, 2);
          ensureSpace(titleH + 36);
          const titleEnd = drawBilingualText(block.title, startX, doc.y, pageWidth, 11, {
            bold: true,
            color: '#334155',
            lineGap: 2,
          });
          doc.y = titleEnd + 6;
        }

        const norm = normalizeTableGrid(block.headers, block.rows);
        const colCount = Math.max(norm.headers.length, 1);

        const colWeights = norm.headers.map((h, cIdx) => {
          let maxL = Math.max(h.length, 4);
          for (const row of norm.rows.slice(0, 40)) {
            maxL = Math.max(maxL, (row[cIdx] ?? '').length);
          }
          return Math.min(maxL, 42);
        });
        const totalWeight = colWeights.reduce((a, b) => a + b, 0) || colCount;
        const colWidths = colWeights.map((w) => Math.max((w / totalWeight) * pageWidth, 34));
        const sumW = colWidths.reduce((a, b) => a + b, 0);
        const scaledWidths = colWidths.map((w) => (w / sumW) * pageWidth);

        const padX = 6;
        const padY = 6;
        const cellFontSize = colCount > 7 ? 8.5 : 9.5;

        const measureRowHeight = (cells: string[], bold = false): number => {
          let maxH = 20;
          cells.forEach((cellText, cIdx) => {
            const availW = Math.max(scaledWidths[cIdx] - padX * 2, 16);
            const h = measureBilingualHeight(cellText || ' ', availW, cellFontSize, bold, 2);
            if (h + padY * 2 > maxH) maxH = h + padY * 2;
          });
          return maxH;
        };

        const drawTableRow = (
          cells: string[],
          yPos: number,
          rowH: number,
          opts: { isHeader?: boolean; shaded?: boolean }
        ) => {
          let currX = startX;
          cells.forEach((cellText, cIdx) => {
            const w = scaledWidths[cIdx];
            if (opts.isHeader) {
              doc.rect(currX, yPos, w, rowH).fillAndStroke('#1E3A8A', '#1E3A8A');
            } else {
              doc
                .rect(currX, yPos, w, rowH)
                .fillAndStroke(opts.shaded ? '#F8FAFC' : '#FFFFFF', '#CBD5E1');
            }

            if (cellText) {
              drawBilingualText(
                cellText,
                currX + padX,
                yPos + padY,
                Math.max(w - padX * 2, 16),
                cellFontSize,
                {
                  bold: opts.isHeader,
                  color: opts.isHeader ? '#FFFFFF' : '#0F172A',
                  lineGap: 2,
                }
              );
            }
            currX += w;
          });
        };

        const headerH = measureRowHeight(norm.headers, true);
        ensureSpace(headerH + 24);
        drawTableRow(norm.headers, doc.y, headerH, { isHeader: true });
        doc.y += headerH;

        norm.rows.forEach((row, rIdx) => {
          const rowH = measureRowHeight(row, false);
          if (doc.y + rowH > maxY) {
            doc.addPage();
            doc.y = doc.page.margins.top;
            drawTableRow(norm.headers, doc.y, headerH, { isHeader: true });
            doc.y += headerH;
          }
          drawTableRow(row, doc.y, rowH, { shaded: rIdx % 2 === 1 });
          doc.y += rowH;
        });

        doc.y += 12;
      }
    }

    // Add page numbers safely without triggering extra blank pages
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const prevBottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      const footerY = doc.page.height - 32;
      doc
        .font('Latin')
        .fontSize(8.5)
        .fillColor('#64748B')
        .text(`Page ${i + 1} of ${range.count}`, startX, footerY, {
          width: pageWidth,
          align: 'right',
          lineBreak: false,
        });
      doc.page.margins.bottom = prevBottomMargin;
    }

    doc.end();
  });
}
