export type FileFormat = 'pdf' | 'docx' | 'xlsx';

export type HeadingBlock = {
  id: string;
  type: 'heading';
  level: 1 | 2 | 3;
  text: string;
};

export type ParagraphBlock = {
  id: string;
  type: 'paragraph';
  text: string;
};

export type ListBlock = {
  id: string;
  type: 'list';
  ordered: boolean;
  items: string[];
};

export type TableBlock = {
  id: string;
  type: 'table';
  title?: string;
  headers: string[];
  rows: string[][];
};

export type DocumentBlock = HeadingBlock | ParagraphBlock | ListBlock | TableBlock;

export type DocumentSheet = {
  name: string;
  headers: string[];
  rows: string[][];
};

export type DetectedScript = 'amharic' | 'english' | 'bilingual' | 'other';

export type InspectionStats = {
  sourceFormat: FileFormat;
  fileName: string;
  fileSizeBytes: number;
  pageOrSheetCount: number;
  paragraphCount: number;
  tableCount: number;
  ethiopicCharCount: number;
  latinCharCount: number;
  detectedScript: DetectedScript;
  inspectionMethod: 'gemini-vision-ocr' | 'structured-xml' | 'spreadsheet-engine';
  inspectionNotes: string[];
};

export type DocumentModel = {
  title: string;
  blocks: DocumentBlock[];
  sheets: DocumentSheet[];
  stats: InspectionStats;
};

export type PdfExportOptions = {
  orientation: 'portrait' | 'landscape';
  paperSize: 'A4' | 'LETTER';
};

export type InspectResponse = {
  document: DocumentModel;
  availableTargets: FileFormat[];
};
