import { useMemo, useState } from 'react';
import { CheckCircle2, FileSpreadsheet, FileText, Search, Table as TableIcon } from 'lucide-react';
import type { DocumentBlock, DocumentModel, DocumentSheet, FileFormat } from '../../shared/types.ts';
import { formatBytes, formatLabel, scriptLabel, UI_COPY, type UiLang } from '../i18n.ts';

type PreviewTab = 'document' | 'tables' | 'search';

type InspectionPreviewProps = {
  lang: UiLang;
  document: DocumentModel | null;
  isLoading: boolean;
  onChangeDocument: (updated: DocumentModel) => void;
  onLoadSample: (format: FileFormat) => void;
};

export function InspectionPreview({
  lang,
  document,
  isLoading,
  onChangeDocument,
  onLoadSample,
}: InspectionPreviewProps) {
  const t = UI_COPY[lang];
  const [activeTab, setActiveTab] = useState<PreviewTab>('document');
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const allTextLines = useMemo(() => {
    if (!document) return [];
    const lines: Array<{ source: string; text: string }> = [];
    if (document.title) lines.push({ source: 'Title', text: document.title });
    document.blocks.forEach((blk, idx) => {
      if (blk.type === 'heading') {
        lines.push({ source: `H${blk.level} #${idx + 1}`, text: blk.text });
      } else if (blk.type === 'paragraph') {
        lines.push({ source: `Para #${idx + 1}`, text: blk.text });
      } else if (blk.type === 'list') {
        blk.items.forEach((item, i) => {
          lines.push({ source: `List #${idx + 1}.${i + 1}`, text: item });
        });
      } else if (blk.type === 'table') {
        lines.push({ source: `Table #${idx + 1} Headers`, text: blk.headers.join(' | ') });
        blk.rows.forEach((r, rIdx) => {
          lines.push({ source: `Table #${idx + 1} R${rIdx + 1}`, text: r.join(' | ') });
        });
      }
    });
    return lines;
  }, [document]);

  const filteredLines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allTextLines;
    return allTextLines.filter(
      (line) => line.text.toLowerCase().includes(q) || line.source.toLowerCase().includes(q)
    );
  }, [allTextLines, searchQuery]);

  if (isLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between min-h-[540px]">
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-slate-900">
            <div className="w-5 h-5 border-2 border-blue-700 border-t-transparent rounded-full animate-spin shrink-0" />
            <span className="text-base font-semibold">{t.loadingStage1}</span>
          </div>
          <p className="text-sm text-slate-600">{t.loadingStage2}</p>
          <div className="pt-4 space-y-3">
            <div className="h-6 bg-slate-100 rounded-md w-2/3 animate-pulse" />
            <div className="h-4 bg-slate-100 rounded-md w-full animate-pulse" />
            <div className="h-4 bg-slate-100 rounded-md w-5/6 animate-pulse" />
            <div className="h-4 bg-slate-100 rounded-md w-4/5 animate-pulse" />
            <div className="pt-4 grid grid-cols-4 gap-3">
              <div className="h-9 bg-slate-100 rounded-md animate-pulse" />
              <div className="h-9 bg-slate-100 rounded-md animate-pulse" />
              <div className="h-9 bg-slate-100 rounded-md animate-pulse" />
              <div className="h-9 bg-slate-100 rounded-md animate-pulse" />
            </div>
            <div className="h-9 bg-slate-50 border border-slate-100 rounded-md animate-pulse" />
            <div className="h-9 bg-slate-50 border border-slate-100 rounded-md animate-pulse" />
            <div className="h-9 bg-slate-50 border border-slate-100 rounded-md animate-pulse" />
          </div>
        </div>
        <div className="text-xs text-slate-500 pt-4 border-t border-slate-100">
          Ethiopic Unicode (U+1200–U+137F) · Latin UTF-8 · Table Grid Verification
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 md:p-8 flex flex-col justify-between min-h-[540px]">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 text-balance">{t.emptyTitle}</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed max-w-2xl">{t.emptyDesc}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
              <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                <FileText className="w-4 h-4 text-blue-700 shrink-0" />
                <span>PDF → Word / Excel</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                {lang === 'am'
                  ? 'የአማርኛ እና የእንግሊዝኛ ፒዲኤፍ ገጾችንና ሰንጠረዦችን በጥንቃቄ መርምሮ ይቀይራል።'
                  : 'Inspects scanned & digital Amharic + English PDFs into editable Word or Excel.'}
              </p>
            </div>

            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
              <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                <FileSpreadsheet className="w-4 h-4 text-blue-700 shrink-0" />
                <span>Excel → PDF / Word</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                {lang === 'am'
                  ? 'የኤክሴል ረድፎችንና ርዕሶችን በግልጽ አማርኛ ፊደል ወደ ፒዲኤፍ እና ወርድ ይቀይራል።'
                  : 'Renders multi-sheet workbooks into crisp Ethiopic-font PDFs and Word tables.'}
              </p>
            </div>

            <div className="border border-slate-200 rounded-lg p-4 bg-slate-50/70">
              <div className="flex items-center gap-2 text-slate-900 font-semibold text-sm">
                <TableIcon className="w-4 h-4 text-blue-700 shrink-0" />
                <span>Word → PDF / Excel</span>
              </div>
              <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                {lang === 'am'
                  ? 'የወርድ አንቀጾችንና ሰንጠረዦችን ሳይዛቡ ወደ ፒዲኤፍ ወይም ኤክሴል ያወጣል።'
                  : 'Converts Word headings, paragraphs, and tables cleanly to PDF or Excel.'}
              </p>
            </div>
          </div>
        </div>

        <div className="pt-6 mt-6 border-t border-slate-200">
          <div className="text-xs font-medium text-slate-500 mb-3">{t.loadSampleTitle}</div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onLoadSample('pdf')}
              className="px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.samplePdf}
            </button>
            <button
              type="button"
              onClick={() => onLoadSample('docx')}
              className="px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.sampleDocx}
            </button>
            <button
              type="button"
              onClick={() => onLoadSample('xlsx')}
              className="px-4 py-2 text-xs font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.sampleXlsx}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const updateTitle = (newTitle: string) => {
    onChangeDocument({ ...document, title: newTitle });
  };

  const updateBlock = (blockId: string, updater: (blk: DocumentBlock) => DocumentBlock) => {
    const nextBlocks = document.blocks.map((b) => (b.id === blockId ? updater(b) : b));
    const tableBlocks = nextBlocks.filter((b) => b.type === 'table');
    const nextSheets = document.sheets.map((s, idx) => {
      const matchingTable = tableBlocks[idx];
      if (matchingTable && matchingTable.type === 'table') {
        return { ...s, headers: matchingTable.headers, rows: matchingTable.rows };
      }
      return s;
    });
    onChangeDocument({ ...document, blocks: nextBlocks, sheets: nextSheets });
  };

  const updateSheetCell = (sheetIdx: number, rowIdx: number, colIdx: number, val: string) => {
    const nextSheets: DocumentSheet[] = document.sheets.map((s, idx) => {
      if (idx !== sheetIdx) return s;
      if (rowIdx === -1) {
        const nextHeaders = [...s.headers];
        nextHeaders[colIdx] = val;
        return { ...s, headers: nextHeaders };
      }
      const nextRows = s.rows.map((r, rI) => {
        if (rI !== rowIdx) return r;
        const copy = [...r];
        copy[colIdx] = val;
        return copy;
      });
      return { ...s, rows: nextRows };
    });

    // Sync corresponding table block so Word/PDF exports also reflect spreadsheet edits
    let tableCounter = 0;
    const nextBlocks = document.blocks.map((b) => {
      if (b.type !== 'table') return b;
      const targetSheet = nextSheets[tableCounter];
      tableCounter++;
      if (targetSheet && tableCounter - 1 === sheetIdx) {
        return { ...b, headers: targetSheet.headers, rows: targetSheet.rows };
      }
      return b;
    });

    onChangeDocument({ ...document, sheets: nextSheets, blocks: nextBlocks });
  };

  const safeSheetIdx = Math.min(activeSheetIdx, Math.max(document.sheets.length - 1, 0));
  const currentSheet = document.sheets[safeSheetIdx];

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col min-h-[540px]">
      {/* Unboxed Inspection Summary Header */}
      <div className="p-5 border-b border-slate-200 bg-slate-50/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{t.inspectionSummary}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
            <span className="font-medium text-slate-800">{document.stats.fileName}</span>
            <span aria-hidden="true">·</span>
            <span>{formatLabel(document.stats.sourceFormat)}</span>
            <span aria-hidden="true">·</span>
            <span>{formatBytes(document.stats.fileSizeBytes)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 pt-1">
          <div>
            <div className="text-xs text-slate-500">{t.scriptLabel}</div>
            <div className="text-sm font-semibold text-slate-900 mt-0.5">
              {scriptLabel(document.stats.detectedScript, lang)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{t.ethiopicChars}</div>
            <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
              {document.stats.ethiopicCharCount.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{t.latinChars}</div>
            <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
              {document.stats.latinCharCount.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{t.paragraphsLabel}</div>
            <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
              {document.stats.paragraphCount.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">{t.tablesLabel}</div>
            <div className="text-sm font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
              {document.sheets.length.toLocaleString()} / {document.stats.pageOrSheetCount.toLocaleString()}
            </div>
          </div>
        </div>

        {document.stats.inspectionNotes.length > 0 && (
          <ul className="pt-2 border-t border-slate-200/80 space-y-1">
            {document.stats.inspectionNotes.map((note, idx) => (
              <li key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                <span className="text-emerald-600 font-semibold shrink-0" aria-hidden="true">✓</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Segmented View Tabs */}
      <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('document')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'document'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.tabDocument}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('tables')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'tables'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.tabTables} ({document.sheets.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'search'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.tabSearch}
          </button>
        </div>

        <span className="text-xs text-slate-500">{t.editHint}</span>
      </div>

      {/* Tab Content */}
      <div className="p-5 flex-1 overflow-y-auto max-h-[620px]">
        {activeTab === 'document' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t.docTitleLabel}</label>
              <input
                type="text"
                value={document.title}
                onChange={(e) => updateTitle(e.target.value)}
                className="w-full px-3 py-2 text-base font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="space-y-3 pt-2">
              {document.blocks.map((block) => {
                if (block.type === 'heading') {
                  return (
                    <div key={block.id} className="space-y-1">
                      <span className="text-[11px] font-mono text-slate-400">H{block.level}</span>
                      <input
                        type="text"
                        value={block.text}
                        onChange={(e) =>
                          updateBlock(block.id, (b) =>
                            b.type === 'heading' ? { ...b, text: e.target.value } : b
                          )
                        }
                        className={`w-full px-3 py-1.5 font-semibold text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 ${
                          block.level === 1 ? 'text-base' : 'text-sm'
                        }`}
                      />
                    </div>
                  );
                }

                if (block.type === 'paragraph') {
                  const rowCount = Math.min(Math.max(Math.ceil(block.text.length / 85), 2), 8);
                  return (
                    <textarea
                      key={block.id}
                      rows={rowCount}
                      value={block.text}
                      onChange={(e) =>
                        updateBlock(block.id, (b) =>
                          b.type === 'paragraph' ? { ...b, text: e.target.value } : b
                        )
                      }
                      className="w-full px-3 py-2 text-sm text-slate-800 leading-relaxed bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 resize-y"
                    />
                  );
                }

                if (block.type === 'list') {
                  return (
                    <div key={block.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50 space-y-2">
                      {block.items.map((item, itemIdx) => (
                        <div key={itemIdx} className="flex items-start gap-2">
                          <span className="text-xs font-mono text-slate-500 pt-2 w-5 shrink-0 tabular-nums">
                            {block.ordered ? `${itemIdx + 1}.` : '•'}
                          </span>
                          <input
                            type="text"
                            value={item}
                            onChange={(e) =>
                              updateBlock(block.id, (b) => {
                                if (b.type !== 'list') return b;
                                const next = [...b.items];
                                next[itemIdx] = e.target.value;
                                return { ...b, items: next };
                              })
                            }
                            className="w-full px-2.5 py-1.5 text-sm text-slate-800 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                          />
                        </div>
                      ))}
                    </div>
                  );
                }

                if (block.type === 'table') {
                  return (
                    <div key={block.id} className="border border-slate-200 rounded-lg overflow-hidden">
                      {block.title && (
                        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700">
                          {block.title}
                        </div>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-800 text-white">
                              {block.headers.map((h, hIdx) => (
                                <th key={hIdx} className="px-3 py-2 font-semibold border-r border-slate-700 last:border-r-0">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {block.rows.map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-50">
                                {row.map((cell, cIdx) => (
                                  <td key={cIdx} className="p-1.5 border-r border-slate-200 last:border-r-0 min-w-[110px]">
                                    <input
                                      type="text"
                                      value={cell}
                                      onChange={(e) =>
                                        updateBlock(block.id, (b) => {
                                          if (b.type !== 'table') return b;
                                          const nextRows = b.rows.map((r, ri) => {
                                            if (ri !== rIdx) return r;
                                            const copy = [...r];
                                            copy[cIdx] = e.target.value;
                                            return copy;
                                          });
                                          return { ...b, rows: nextRows };
                                        })
                                      }
                                      className="w-full px-2 py-1 text-xs text-slate-900 bg-transparent rounded hover:bg-slate-100/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 tabular-nums"
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </div>
        )}

        {activeTab === 'tables' && currentSheet && (
          <div className="space-y-4">
            {document.sheets.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {document.sheets.map((s, idx) => (
                  <button
                    key={`${s.name}_${idx}`}
                    type="button"
                    onClick={() => setActiveSheetIdx(idx)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      safeSheetIdx === idx
                        ? 'bg-blue-700 text-white border-blue-700'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {s.name} ({s.rows.length})
                  </button>
                ))}
              </div>
            )}

            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-2.5 py-2 font-mono text-[11px] text-slate-300 w-10 border-r border-slate-700 tabular-nums">
                      #
                    </th>
                    {currentSheet.headers.map((header, cIdx) => (
                      <th key={cIdx} className="p-1.5 border-r border-slate-700 last:border-r-0 min-w-[130px]">
                        <input
                          type="text"
                          value={header}
                          onChange={(e) => updateSheetCell(safeSheetIdx, -1, cIdx, e.target.value)}
                          className="w-full px-2 py-1 text-xs font-semibold text-white bg-transparent rounded focus:bg-slate-700 focus:outline-none"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {currentSheet.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50 h-9">
                      <td className="px-2.5 py-1.5 font-mono text-[11px] text-slate-400 border-r border-slate-200 tabular-nums">
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-1 border-r border-slate-200 last:border-r-0">
                          <input
                            type="text"
                            value={cell}
                            onChange={(e) => updateSheetCell(safeSheetIdx, rIdx, cIdx, e.target.value)}
                            className="w-full px-2 py-1 text-xs text-slate-900 bg-transparent rounded hover:bg-slate-100/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-600 tabular-nums"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'search' && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div className="text-xs text-slate-500 tabular-nums">
              {filteredLines.length} {t.matchesFound}
            </div>

            {filteredLines.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-500">{t.noMatches}</div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                {filteredLines.map((line, idx) => (
                  <div key={idx} className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-baseline gap-2">
                    <span className="text-[11px] font-mono text-slate-400 w-32 shrink-0 tabular-nums">
                      {line.source}
                    </span>
                    <span className="text-sm text-slate-800 break-words leading-relaxed">{line.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
