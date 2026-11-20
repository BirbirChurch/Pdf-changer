import type { DetectedScript, FileFormat } from '../shared/types.ts';

export type UiLang = 'am' | 'en';

export const UI_COPY = {
  am: {
    brand: 'FidelDocs',
    navConverter: 'መቀየሪያ',
    navMatrix: 'የቅርጸት ሰንጠረዥ',
    navSamples: 'ናሙና ፋይሎች',
    uploadCta: 'ፋይል ይምረጡ',
    heroTitle: 'የአማርኛ እና የእንግሊዝኛ ሰነዶች ትክክለኛ መቀየሪያ',
    heroSubtitle:
      'ፒዲኤፍ፣ ወርድ (.docx) እና ኤክሴል (.xlsx) ፋይሎችን እያንዳንዱን ፊደል፣ ቁጥር እና ሰንጠረዥ በጥንቃቄ ፈትሾ ወደሚፈልጉት ቅርጸት ይቀይራል።',
    sourcePanelTitle: '1. ፋይል ያስገቡ እና መቀየሪያ ይምረጡ',
    dropzoneTitle: 'ፋይሉን እዚህ ይጎትቱ ወይም ይጫኑ',
    dropzoneHint: 'PDF (.pdf) · Word (.docx) · Excel (.xlsx, .xls, .csv) — እስከ 25 MB',
    selectedFile: 'የተመረጠው ፋይል',
    detectedFormat: 'የተገኘው ቅርጸት',
    targetLabel: '2. ወደ ምን ይቀየር?',
    pdfSettingsLabel: 'የፒዲኤፍ ገጽ አቀማመጥ',
    portrait: 'ቁመት (Portrait)',
    landscape: 'አግድም (Landscape)',
    inspectAndConvert: 'በጥንቃቄ ፈትሽ እና ቀይር',
    inspectingBtn: 'እየተፈተሸ እና እየተቀየረ ነው...',
    downloadReadyTitle: 'የተቀየሩ ፋይሎችን ያውርዱ',
    downloadAs: 'አውርድ',
    exporting: 'በማዘጋጀት ላይ...',
    resetFile: 'ሌላ ፋይል ቀይር',
    emptyTitle: 'ማንኛውንም ሰነድ ያስገቡ እና እያንዳንዱን ክፍል በጥንቃቄ ይፈትሹ',
    emptyDesc:
      'ከታች ያሉትን 6 የመቀየሪያ መንገዶች ሙሉ በሙሉ ይደግፋል። ሰነዱን ከቀየሩ በኋላ አማርኛ እና እንግሊዝኛ ጽሑፉን ከማውረድዎ በፊት እዚህ ማረጋገጥ እና ማስተካከል ይችላሉ።',
    loadSampleTitle: 'በናሙና ሰነድ ወዲያውኑ ይሞክሩ',
    samplePdf: 'ናሙና ፒዲኤፍ (PDF) ጫን',
    sampleDocx: 'ናሙና ወርድ (Word) ጫን',
    sampleXlsx: 'ናሙና ኤክሴል (Excel) ጫን',
    loadingStage1: 'የፋይሉን መረጃ እና ፊደላት በመመርመር ላይ...',
    loadingStage2: 'የአማርኛ (ግዕዝ) እና የእንግሊዝኛ ጽሑፎችንና ሰንጠረዦችን በጥንቃቄ በማረጋገጥ ላይ...',
    inspectionSummary: 'የፍተሻ ውጤት',
    scriptLabel: 'ቋንቋ / ፊደል',
    ethiopicChars: 'የአማርኛ ፊደላት',
    latinChars: 'የእንግሊዝኛ ፊደላት',
    paragraphsLabel: 'አንቀጾች',
    tablesLabel: 'ሰንጠረዦች / ገጾች',
    tabDocument: 'የሰነድ እይታ (ሊስተካከል የሚችል)',
    tabTables: 'ሰንጠረዦች እና ኤክሴል',
    tabSearch: 'ቃላት ፈልግ እና አረጋግጥ',
    docTitleLabel: 'የሰነዱ ርዕስ',
    editHint: 'ማንኛውንም ጽሑፍ ወይም የሰንጠረዥ ሕዋስ ጠቅ አድርገው ማስተካከል ይችላሉ — የተስተካከለው ጽሑፍ ወዲያውኑ በሚያወርዱት ፋይል ውስጥ ይካተታል።',
    searchPlaceholder: 'የአማርኛ ወይም የእንግሊዝኛ ቃል፣ ቁጥር ወይም ኮድ ይፈልጉ...',
    matchesFound: 'ተመሳሳይ መስመሮች ተገኝተዋል',
    noMatches: 'የሚዛመድ ጽሑፍ አልተገኘም።',
    matrixHeading: 'የሚደገፉ 6 የመቀየሪያ መንገዶች',
    matrixSub: 'ሁሉም ቅርጸቶች ዩኒኮድ አማርኛ (ግዕዝ)፣ እንግሊዝኛ እና ሰንጠረዦችን ሳያዛቡ ይቀየራሉ።',
    samplesHeading: 'ለሙከራ የተዘጋጁ የአማርኛ እና እንግሊዝኛ ናሙና ፋይሎች',
    downloadSample: 'ፋይሉን አውርድ',
    testInApp: 'በቀጥታ ፈትሽ',
    errorPrefix: 'ስህተት ተፈጥሯል፦',
    autoConvertedNote: 'ተፈትሾ ተዘጋጅቷል — አሁኑኑ ማውረድ ይችላሉ።',
  },
  en: {
    brand: 'FidelDocs',
    navConverter: 'Converter',
    navMatrix: 'Format Matrix',
    navSamples: 'Sample Files',
    uploadCta: 'Upload File',
    heroTitle: 'Bilingual Amharic & English Document Converter',
    heroSubtitle:
      'Inspects every Amharic (Ethiopic) and English paragraph, number, and table carefully across PDF, Word (.docx), and Excel (.xlsx) before converting.',
    sourcePanelTitle: '1. Upload Source & Choose Target',
    dropzoneTitle: 'Drop a document here or click to browse',
    dropzoneHint: 'PDF (.pdf) · Word (.docx) · Excel (.xlsx, .xls, .csv) — up to 25 MB',
    selectedFile: 'Selected File',
    detectedFormat: 'Detected Format',
    targetLabel: '2. Convert To',
    pdfSettingsLabel: 'PDF Page Layout',
    portrait: 'Portrait',
    landscape: 'Landscape',
    inspectAndConvert: 'Inspect & Convert',
    inspectingBtn: 'Inspecting & Converting...',
    downloadReadyTitle: 'Download Converted Output',
    downloadAs: 'Download',
    exporting: 'Generating...',
    resetFile: 'Clear & Upload Another',
    emptyTitle: 'Upload a document to inspect and convert every detail',
    emptyDesc:
      'Supports all 6 conversions between PDF, Word, and Excel. Every Amharic and English line, heading, and table cell can be verified and edited before downloading.',
    loadSampleTitle: 'Test Immediately with a Bilingual Sample',
    samplePdf: 'Load Sample PDF',
    sampleDocx: 'Load Sample Word',
    sampleXlsx: 'Load Sample Excel',
    loadingStage1: 'Reading document structure and encoding...',
    loadingStage2: 'Carefully inspecting Amharic (Ethiopic) & English text, numbers, and tables...',
    inspectionSummary: 'Inspection Summary',
    scriptLabel: 'Detected Script',
    ethiopicChars: 'Amharic Chars',
    latinChars: 'English Chars',
    paragraphsLabel: 'Text Blocks',
    tablesLabel: 'Tables / Sheets',
    tabDocument: 'Document View (Editable)',
    tabTables: 'Tables & Sheets',
    tabSearch: 'Search & Verify Text',
    docTitleLabel: 'Document Title',
    editHint: 'Click any paragraph, heading, or table cell to refine text — all edits are included immediately when you download.',
    searchPlaceholder: 'Search any Amharic or English word, number, or code...',
    matchesFound: 'matching lines found',
    noMatches: 'No matching lines found.',
    matrixHeading: 'All 6 Supported Conversion Paths',
    matrixSub: 'Full UTF-8 Ethiopic Ge\'ez script, English typography, and structured table preservation.',
    samplesHeading: 'Downloadable Amharic & English Sample Files',
    downloadSample: 'Download File',
    testInApp: 'Inspect Now',
    errorPrefix: 'Conversion error:',
    autoConvertedNote: 'Inspection complete — ready to download in your target format.',
  },
} as const;

export function formatLabel(fmt: FileFormat): string {
  if (fmt === 'pdf') return 'PDF (.pdf)';
  if (fmt === 'docx') return 'Word (.docx)';
  return 'Excel (.xlsx)';
}

export function scriptLabel(script: DetectedScript, lang: UiLang): string {
  if (lang === 'am') {
    if (script === 'bilingual') return 'አማርኛ እና እንግሊዝኛ';
    if (script === 'amharic') return 'አማርኛ (ግዕዝ)';
    if (script === 'english') return 'እንግሊዝኛ';
    return 'ሌላ';
  }
  if (script === 'bilingual') return 'Amharic + English';
  if (script === 'amharic') return 'Amharic (Ethiopic)';
  if (script === 'english') return 'English';
  return 'Other';
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
