import type { User } from 'firebase/auth';
import { Cloud, LogIn, LogOut, Trash2 } from 'lucide-react';
import type { SavedConversionRecord } from '../firebase.ts';
import { formatLabel, scriptLabel, type UiLang } from '../i18n.ts';

type SavedHistoryPanelProps = {
  lang: UiLang;
  user: User | null;
  authReady: boolean;
  records: SavedConversionRecord[];
  activeRecordId: string | null;
  isSaving: boolean;
  hasCurrentDoc: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
  onSaveCurrent: () => void;
  onSelectRecord: (rec: SavedConversionRecord) => void;
  onDeleteRecord: (id: string) => void;
};

export function SavedHistoryPanel({
  lang,
  user,
  authReady,
  records,
  activeRecordId,
  isSaving,
  hasCurrentDoc,
  onSignIn,
  onSignOut,
  onSaveCurrent,
  onSelectRecord,
  onDeleteRecord,
}: SavedHistoryPanelProps) {
  const isAm = lang === 'am';

  return (
    <section id="history" className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Cloud className="w-4 h-4 text-blue-700 shrink-0" />
            <span>
              {isAm ? 'የተቀመጡ ሰነዶች እና የፋይርቤዝ ማህደር' : 'Saved Documents & Firebase History'}
            </span>
          </div>
          <p className="text-xs text-slate-600">
            {isAm
              ? 'የፈተሿቸውን እና ያስተካከሏቸውን ሰነዶች በGoogle መለያዎ ውስጥ አስቀምጠው በማንኛውም ጊዜ ይክፈቱ።'
              : 'Sign in with Google to save inspected bilingual documents to Firestore and re-export anytime.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {!authReady ? (
            <span className="text-xs text-slate-500">{isAm ? 'በመፈተሽ ላይ...' : 'Checking session...'}</span>
          ) : user ? (
            <>
              {hasCurrentDoc && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={onSaveCurrent}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {isSaving
                    ? isAm
                      ? 'በማስቀመጥ ላይ...'
                      : 'Saving...'
                    : activeRecordId
                      ? isAm
                        ? 'ለውጦችን አዘምን'
                        : 'Update Saved Copy'
                      : isAm
                        ? 'ወደ ፋይርቤዝ አስቀምጥ'
                        : 'Save to Firebase'}
                </button>
              )}
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{user.displayName || user.email}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>{isAm ? 'በGoogle ይግቡ' : 'Sign in with Google'}</span>
            </button>
          )}
        </div>
      </div>

      {!user ? (
        <div className="text-xs text-slate-500 py-2">
          {isAm
            ? 'ሰነዶችዎን በፋይርቤዝ ውስጥ ለማስቀመጥ እና ከሌላ መሣሪያ ለመክፈት በGoogle መለያዎ ይግቡ።'
            : 'Sign in above to persist your converted documents and table edits in your private Firestore workspace.'}
        </div>
      ) : records.length === 0 ? (
        <div className="text-xs text-slate-500 py-2">
          {isAm
            ? 'እስካሁን የተቀመጠ ሰነድ የለም። ሰነድ ከፈተሹ በኋላ «ወደ ፋይርቤዝ አስቀምጥ» የሚለውን ይጫኑ።'
            : 'No saved conversions yet. Inspect any document above and click "Save to Firebase".'}
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                <th className="px-4 py-2.5">{isAm ? 'ርዕስ / ፋይል' : 'Title / File'}</th>
                <th className="px-4 py-2.5">{isAm ? 'ቅርጸት' : 'Format'}</th>
                <th className="px-4 py-2.5">{isAm ? 'ቋንቋ' : 'Script'}</th>
                <th className="px-4 py-2.5 text-right">{isAm ? 'ፊደላት' : 'Chars'}</th>
                <th className="px-4 py-2.5 text-right">{isAm ? 'ተግባር' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {records.map((rec) => {
                const isActive = rec.id === activeRecordId;
                return (
                  <tr
                    key={rec.id}
                    className={`h-10 transition-colors ${
                      isActive ? 'bg-blue-50/60' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => onSelectRecord(rec)}
                        className="text-left font-medium text-slate-900 hover:text-blue-700 hover:underline cursor-pointer"
                      >
                        {rec.title || rec.fileName}
                      </button>
                      <div className="text-[11px] text-slate-500">{rec.fileName}</div>
                    </td>
                    <td className="px-4 py-2 text-slate-700 whitespace-nowrap">
                      {formatLabel(rec.sourceFormat)}
                    </td>
                    <td className="px-4 py-2 text-slate-700 whitespace-nowrap">
                      {scriptLabel(rec.detectedScript, lang)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {(rec.ethiopicCharCount + rec.latinCharCount).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectRecord(rec)}
                          className="px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100/70 rounded-md transition-colors cursor-pointer"
                        >
                          {isAm ? 'ክፈት' : 'Open'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRecord(rec.id)}
                          aria-label={isAm ? 'ሰርዝ' : 'Delete'}
                          className="p-1 text-slate-400 hover:text-red-600 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
