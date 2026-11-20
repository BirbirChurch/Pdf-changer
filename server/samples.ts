import type { DocumentModel, FileFormat } from '../shared/types.ts';
import { generateDocxBuffer, generatePdfBuffer, generateXlsxBuffer } from './generators.ts';
import { buildSheetsFromBlocks, recomputeStats } from './stats.ts';

function buildSampleModel(sourceFormat: FileFormat): DocumentModel {
  const title = 'የ2018 ዓ.ም የግብርና እና ንግድ አፈጻጸም ሪፖርት / 2026 Trade & Supply Report';
  const blocks: DocumentModel['blocks'] = [
    {
      id: 'sample_1',
      type: 'heading',
      level: 1,
      text: '1. የስራ አፈጻጸም ማጠቃለያ — Executive Summary',
    },
    {
      id: 'sample_2',
      type: 'paragraph',
      text: 'ይህ ሪፖርት በአዲስ አበባ እና በክልል ማዕከላት የተከናወኑ ዋና ዋና የግብርና ምርቶች ስርጭትና የወጪ ሂሳብ መዝገቦችን ይዟል። All figures have been verified against regional warehouse ledgers in Addis Ababa, Bahir Dar, and Hawassa.',
    },
    {
      id: 'sample_3',
      type: 'list',
      ordered: false,
      items: [
        'የቡና እና የሰሊጥ ምርት ኤክስፖርት በ18.4% አድጓል (Coffee & Sesame export grew by 18.4%).',
        'የመጋዘን አቅርቦት ስርዓት በዲጂታል ቴክኖሎጂ ተደግፏል (Warehouse inventory digitized).',
        'አጠቃላይ የስርጭት ወጪ በበጀት ገደብ ውስጥ ተጠናቋል (Logistics spend within budget).',
      ],
    },
    {
      id: 'sample_4',
      type: 'heading',
      level: 2,
      text: '2. የምርትና የበጀት ዝርዝር — Commodity & Budget Ledger',
    },
    {
      id: 'sample_5',
      type: 'table',
      title: 'Regional Supply Summary / የክልል አቅርቦት ሰንጠረዥ',
      headers: [
        'ኮድ / Code',
        'የምርት ዓይነት / Commodity',
        'ክልል / Region',
        'መጠን (ኩንታል) / Qty (Qt)',
        'ጠቅላላ ዋጋ (ETB)',
      ],
      rows: [
        ['ETH-101', 'ቡና (Washed Coffee)', 'Oromia / ኦሮሚያ', '1,450', '18,850,000'],
        ['ETH-102', 'ነጭ ጤፍ (White Teff)', 'Amhara / አማራ', '2,180', '19,620,000'],
        ['ETH-103', 'ሰሊጥ (White Sesame)', 'Tigray / ትግራይ', '940', '13,160,000'],
        ['ETH-104', 'በቆሎ (Yellow Maize)', 'Sidama / ሲዳማ', '3,120', '11,856,000'],
      ],
    },
  ];

  const sheets = buildSheetsFromBlocks(title, blocks);
  return recomputeStats({
    title,
    blocks,
    sheets,
    stats: {
      sourceFormat,
      fileName: `bilingual_sample.${sourceFormat}`,
      fileSizeBytes: 0,
      pageOrSheetCount: 1,
      paragraphCount: 0,
      tableCount: 0,
      ethiopicCharCount: 0,
      latinCharCount: 0,
      detectedScript: 'bilingual',
      inspectionMethod: 'structured-xml',
      inspectionNotes: ['Generated bilingual Amharic & English sample document.'],
    },
  });
}

export async function createSampleFileBuffer(format: FileFormat): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  const model = buildSampleModel(format);
  if (format === 'pdf') {
    const buffer = await generatePdfBuffer(model, { orientation: 'portrait', paperSize: 'A4' });
    return {
      buffer,
      fileName: 'Amharic_English_Sample_Report.pdf',
      mimeType: 'application/pdf',
    };
  }
  if (format === 'docx') {
    const buffer = await generateDocxBuffer(model);
    return {
      buffer,
      fileName: 'Amharic_English_Sample_Report.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }
  const buffer = await generateXlsxBuffer(model);
  return {
    buffer,
    fileName: 'Amharic_English_Sample_Ledger.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
}
