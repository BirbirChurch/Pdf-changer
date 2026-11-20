import { ArrowRight, Download } from 'lucide-react';
import type { FileFormat } from '../../shared/types.ts';
import { UI_COPY, type UiLang } from '../i18n.ts';

type FormatMatrixSectionProps = {
  lang: UiLang;
  onLoadSample: (format: FileFormat) => void;
};

const MATRIX_ROWS: Array<{
  from: string;
  to: string;
  amDesc: string;
  enDesc: string;
}> = [
  {
    from: 'PDF (.pdf)',
    to: 'Word (.docx)',
    amDesc: 'የአማርኛ እና የእንግሊዝኛ ጽሑፎችን፣ ርዕሶችን እና ሰንጠረዦችን በጥንቃቄ ፈትሾ ወደ ሊስተካከል የሚችል የወርድ ሰነድ ይቀይራል።',
    enDesc: 'Extracts Amharic & English headings, paragraphs, lists, and tables into editable .docx.',
  },
  {
    from: 'PDF (.pdf)',
    to: 'Excel (.xlsx)',
    amDesc: 'በፒዲኤፍ ውስጥ ያሉ ሰንጠረዦችን እና ቁጥሮችን አንድም ረድፍ ሳይዘል ወደ ኤክሴል ሉሆች ያስገባል።',
    enDesc: 'Reconstructs PDF tables and bilingual records cleanly into structured Excel worksheets.',
  },
  {
    from: 'Excel (.xlsx / .csv)',
    to: 'PDF (.pdf)',
    amDesc: 'የኤክሴል ዳታን Noto Sans Ethiopic ፊደል በመጠቀም አማርኛው ሳይበላሽ ወደ ንጹህ ፒዲኤፍ ይቀይራል።',
    enDesc: 'Renders worksheets with embedded Ethiopic & Latin TrueType fonts and repeating headers.',
  },
  {
    from: 'Excel (.xlsx / .csv)',
    to: 'Word (.docx)',
    amDesc: 'እያንዳንዱን የኤክሴል ሉህ ከነ ርዕሱና የተስተካከለ ሰንጠረዥ ወደ ወርድ ሰነድ ይቀይራል።',
    enDesc: 'Converts every worksheet into titled Word sections with styled multi-column tables.',
  },
  {
    from: 'Word (.docx)',
    to: 'PDF (.pdf)',
    amDesc: 'የወርድ ሰነዱን አማርኛና እንግሊዝኛ ጽሑፍ ከነ ሰንጠረዦቹ ሳይቀየር ወደ ፒዲኤፍ ያትማል።',
    enDesc: 'Preserves Word hierarchy, bilingual runs, and tables into print-ready PDF.',
  },
  {
    from: 'Word (.docx)',
    to: 'Excel (.xlsx)',
    amDesc: 'የወርድ ሰንጠረዦችን እና ዝርዝር መረጃዎችን ወደ ተደራጁ የኤክሴል አምዶች ይቀይራል።',
    enDesc: 'Maps Word tables and structured narrative entries directly into Excel rows and columns.',
  },
];

export function FormatMatrixSection({ lang, onLoadSample }: FormatMatrixSectionProps) {
  const t = UI_COPY[lang];

  return (
    <div className="space-y-12 pt-4">
      <section id="matrix" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{t.matrixHeading}</h2>
          <p className="text-sm text-slate-600 mt-1">{t.matrixSub}</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="px-5 py-3">{lang === 'am' ? 'መነሻ ቅርጸት' : 'Source Format'}</th>
                  <th className="px-5 py-3">{lang === 'am' ? 'መድረሻ ቅርጸት' : 'Target Format'}</th>
                  <th className="px-5 py-3">{lang === 'am' ? 'የፍተሻ እና የመቀየር ሂደት' : 'Inspection & Output Fidelity'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {MATRIX_ROWS.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/80">
                    <td className="px-5 py-3.5 font-medium text-slate-900 whitespace-nowrap">{row.from}</td>
                    <td className="px-5 py-3.5 font-medium text-blue-700 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span>{row.to}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{lang === 'am' ? row.amDesc : row.enDesc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="samples" className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">{t.samplesHeading}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['pdf', 'docx', 'xlsx'] as FileFormat[]).map((fmt) => {
            const label =
              fmt === 'pdf'
                ? 'Amharic + English Report (.pdf)'
                : fmt === 'docx'
                  ? 'Amharic + English Report (.docx)'
                  : 'Amharic + English Ledger (.xlsx)';
            const desc =
              fmt === 'pdf'
                ? lang === 'am'
                  ? 'ወደ ወርድ ወይም ኤክሴል መቀየርን ለመሞከር የተዘጋጀ ናሙና ፒዲኤፍ።'
                  : 'Bilingual sample PDF ready to test PDF → Word and PDF → Excel.'
                : fmt === 'docx'
                  ? lang === 'am'
                    ? 'ወደ ፒዲኤፍ ወይም ኤክሴል መቀየርን ለመሞከር የተዘጋጀ ናሙና ወርድ።'
                    : 'Bilingual sample Word file ready to test Word → PDF and Word → Excel.'
                  : lang === 'am'
                    ? 'ወደ ፒዲኤፍ ወይም ወርድ መቀየርን ለመሞከር የተዘጋጀ ናሙና ኤክሴል።'
                    : 'Bilingual sample Excel ledger ready to test Excel → PDF and Excel → Word.';

            return (
              <div
                key={fmt}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{label}</h3>
                  <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">{desc}</p>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => onLoadSample(fmt)}
                    className="px-3.5 py-2 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {t.testInApp}
                  </button>
                  <a
                    href={`/api/sample/${fmt}`}
                    download
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t.downloadSample}</span>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
