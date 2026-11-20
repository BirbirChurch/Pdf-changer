import { useEffect, useRef, useState, type DragEvent } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  AlertCircle,
  ArrowRight,
  Download,
  FileSpreadsheet,
  FileText,
  RotateCcw,
  Upload,
} from 'lucide-react';
import type {
  DocumentModel,
  FileFormat,
  InspectResponse,
  PdfExportOptions,
} from '../shared/types.ts';
import { FormatMatrixSection } from './components/FormatMatrixSection.tsx';
import { InspectionPreview } from './components/InspectionPreview.tsx';
import { SavedHistoryPanel } from './components/SavedHistoryPanel.tsx';
import {
  auth,
  deleteConversionFromFirestore,
  ensureUserProfile,
  recordToDocumentModel,
  saveConversionToFirestore,
  signInWithGoogle,
  signOutUser,
  subscribeUserConversions,
  type SavedConversionRecord,
} from './firebase.ts';
import { formatBytes, formatLabel, UI_COPY, type UiLang } from './i18n.ts';

function inferSourceFormat(fileName: string): FileFormat | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || lower.endsWith('.csv')) return 'xlsx';
  return null;
}

function getTargetsForSource(source: FileFormat | null): FileFormat[] {
  if (source === 'pdf') return ['docx', 'xlsx'];
  if (source === 'xlsx') return ['pdf', 'docx'];
  if (source === 'docx') return ['pdf', 'xlsx'];
  return [];
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function parseDownloadFilename(contentDisposition: string | null, fallbackName: string): string {
  if (!contentDisposition) return fallbackName;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return fallbackName;
    }
  }
  const basicMatch = contentDisposition.match(/filename="([^"]+)"/i);
  return basicMatch?.[1] || fallbackName;
}

export default function App() {
  const [lang, setLang] = useState<UiLang>('am');
  const t = UI_COPY[lang];

  // Firebase Auth & Firestore state
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [savedRecords, setSavedRecords] = useState<SavedConversionRecord[]>([]);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [isSavingToFirebase, setIsSavingToFirebase] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedSource, setDetectedSource] = useState<FileFormat | null>(null);
  const [targetFormat, setTargetFormat] = useState<FileFormat>('docx');
  const [pdfOptions, setPdfOptions] = useState<PdfExportOptions>({
    orientation: 'portrait',
    paperSize: 'A4',
  });

  const [isDragging, setIsDragging] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [exportingTarget, setExportingTarget] = useState<FileFormat | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [inspectedDoc, setInspectedDoc] = useState<DocumentModel | null>(null);
  const [availableTargets, setAvailableTargets] = useState<FileFormat[]>([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
      if (firebaseUser) {
        void ensureUserProfile(firebaseUser.uid, firebaseUser.displayName, lang).catch((err) => {
          console.error('Failed to sync profile:', err);
        });
      } else {
        setSavedRecords([]);
        setActiveRecordId(null);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authReady || !user) return;
    const unsub = subscribeUserConversions(
      user.uid,
      (records) => {
        setSavedRecords(records);
      },
      (err) => {
        setErrorMessage(err.message);
      }
    );
    return () => unsub();
  }, [authReady, user]);

  const handleFileSelect = (file: File) => {
    setErrorMessage(null);
    setStatusMessage(null);
    const fmt = inferSourceFormat(file.name);
    if (!fmt) {
      setErrorMessage(
        lang === 'am'
          ? 'ይህ የፋይል ዓይነት አይደገፍም። እባክዎ PDF (.pdf), Word (.docx), ወይም Excel (.xlsx, .xls, .csv) ይምረጡ።'
          : 'Unsupported file type. Please choose a PDF (.pdf), Word (.docx), or Excel (.xlsx, .xls, .csv) file.'
      );
      return;
    }
    setSelectedFile(file);
    setDetectedSource(fmt);
    const validTargets = getTargetsForSource(fmt);
    setTargetFormat(validTargets[0]);
    setInspectedDoc(null);
    setAvailableTargets([]);
    setActiveRecordId(null);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      handleFileSelect(dropped);
    }
  };

  const exportDocumentToFormat = async (doc: DocumentModel, fmt: FileFormat) => {
    setExportingTarget(fmt);
    setErrorMessage(null);
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document: doc,
          targetFormat: fmt,
          pdfOptions,
        }),
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `Export failed (${response.status})`);
      }

      const blob = await response.blob();
      const baseName = (doc.stats.fileName || doc.title || 'converted').replace(/\.[^.]+$/, '');
      const fallback = `${baseName}.${fmt}`;
      const filename = parseDownloadFilename(response.headers.get('Content-Disposition'), fallback);
      triggerBlobDownload(blob, filename);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setExportingTarget(null);
    }
  };

  const inspectFile = async (fileToInspect: File, chosenTarget: FileFormat, autoDownload: boolean) => {
    setIsInspecting(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', fileToInspect);

      const response = await fetch('/api/inspect', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `Inspection failed (${response.status})`);
      }

      const payload = (await response.json()) as InspectResponse;
      setInspectedDoc(payload.document);
      setAvailableTargets(payload.availableTargets);
      const effectiveTarget = payload.availableTargets.includes(chosenTarget)
        ? chosenTarget
        : payload.availableTargets[0];
      setTargetFormat(effectiveTarget);
      setStatusMessage(t.autoConvertedNote);

      if (user) {
        try {
          const savedId = await saveConversionToFirestore(user.uid, payload.document, null);
          setActiveRecordId(savedId);
        } catch (saveErr) {
          console.error('Auto-save to Firestore failed:', saveErr);
        }
      }

      if (autoDownload && effectiveTarget) {
        await exportDocumentToFormat(payload.document, effectiveTarget);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Inspection failed.');
    } finally {
      setIsInspecting(false);
    }
  };

  const handleInspectAndConvertClick = async () => {
    if (!selectedFile) return;
    await inspectFile(selectedFile, targetFormat, true);
  };

  const handleLoadSample = async (format: FileFormat) => {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsInspecting(true);
    setActiveRecordId(null);

    try {
      const res = await fetch(`/api/sample/${format}`);
      if (!res.ok) throw new Error('Failed to load sample file.');
      const blob = await res.blob();
      const sampleName =
        format === 'pdf'
          ? 'Amharic_English_Sample_Report.pdf'
          : format === 'docx'
            ? 'Amharic_English_Sample_Report.docx'
            : 'Amharic_English_Sample_Ledger.xlsx';
      const file = new File([blob], sampleName, { type: blob.type });
      setSelectedFile(file);
      setDetectedSource(format);
      const validTargets = getTargetsForSource(format);
      const defaultTarget = validTargets[0];
      setTargetFormat(defaultTarget);

      await inspectFile(file, defaultTarget, false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load sample.');
      setIsInspecting(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setDetectedSource(null);
    setInspectedDoc(null);
    setAvailableTargets([]);
    setActiveRecordId(null);
    setErrorMessage(null);
    setStatusMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Google sign-in failed.');
    }
  };

  const handleSignOut = async () => {
    setErrorMessage(null);
    try {
      await signOutUser();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Sign-out failed.');
    }
  };

  const handleSaveCurrentToFirebase = async () => {
    if (!user || !inspectedDoc) return;
    setIsSavingToFirebase(true);
    setErrorMessage(null);
    try {
      const savedId = await saveConversionToFirestore(user.uid, inspectedDoc, activeRecordId);
      setActiveRecordId(savedId);
      setStatusMessage(
        lang === 'am' ? 'ሰነዱ በፋይርቤዝ ውስጥ ተቀምጧል።' : 'Saved to your Firebase account.'
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save document.');
    } finally {
      setIsSavingToFirebase(false);
    }
  };

  const handleSelectSavedRecord = (rec: SavedConversionRecord) => {
    const model = recordToDocumentModel(rec);
    setInspectedDoc(model);
    setDetectedSource(rec.sourceFormat);
    const targets = getTargetsForSource(rec.sourceFormat);
    setAvailableTargets(targets);
    setTargetFormat(targets[0]);
    setSelectedFile(null);
    setActiveRecordId(rec.id);
    setErrorMessage(null);
    setStatusMessage(
      lang === 'am'
        ? 'ከፋይርቤዝ ማህደር ተከፍቷል — ወዲያውኑ ማውረድ ይችላሉ።'
        : 'Loaded from Firebase history — ready to export.'
    );
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteSavedRecord = async (id: string) => {
    if (!user) return;
    setErrorMessage(null);
    try {
      await deleteConversionFromFirestore(user.uid, id);
      if (activeRecordId === id) {
        setActiveRecordId(null);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to delete saved record.');
    }
  };

  const validTargets = availableTargets.length > 0 ? availableTargets : getTargetsForSource(detectedSource);
  const showPdfOptions = validTargets.includes('pdf');

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1320px] mx-auto px-6 py-3.5 flex items-center justify-between gap-8">
          <a
            href="#workspace"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            {t.brand}
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#workspace"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navConverter}
            </a>
            <a
              href="#history"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {lang === 'am' ? 'ማህደር' : 'History'}
            </a>
            <a
              href="#matrix"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navMatrix}
            </a>
            <a
              href="#samples"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navSamples}
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.uploadCta}
            </button>
          </div>
        </div>
      </header>

      <main id="workspace" className="flex-1 max-w-[1320px] w-full mx-auto px-6 py-8 space-y-8">
        {/* Hero / Workspace Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
              {t.heroTitle}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed">{t.heroSubtitle}</p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg self-start lg:self-end shrink-0">
            <button
              type="button"
              onClick={() => setLang('am')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                lang === 'am' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              አማርኛ
            </button>
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                lang === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              English
            </button>
          </div>
        </div>

        {/* Hidden Shared File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.xls,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
          }}
          className="hidden"
        />

        {/* Error Alert */}
        {errorMessage && (
          <div
            role="alert"
            className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-start gap-3 text-sm text-red-900"
          >
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
            <div className="break-words">
              <span className="font-semibold">{t.errorPrefix} </span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* Primary Two-Column Studio Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Panel: Upload, Options & Download */}
          <section className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">{t.sourcePanelTitle}</h2>
              {(selectedFile || inspectedDoc) && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t.resetFile}</span>
                </button>
              )}
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`border border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
                isDragging
                  ? 'border-blue-600 bg-blue-50/70'
                  : 'border-slate-300 bg-slate-50/60 hover:bg-slate-100/70 hover:border-slate-400'
              }`}
            >
              <Upload className="w-6 h-6 text-blue-700 mx-auto mb-2.5" />
              <div className="text-sm font-medium text-slate-900">{t.dropzoneTitle}</div>
              <div className="text-xs text-slate-500 mt-1">{t.dropzoneHint}</div>
            </div>

            {selectedFile && detectedSource && (
              <div className="pt-2 border-t border-slate-200 space-y-4">
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">{t.selectedFile}</div>
                  <div className="text-sm font-semibold text-slate-900 break-all">{selectedFile.name}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-600 tabular-nums">
                    <span>
                      {t.detectedFormat}: {formatLabel(detectedSource)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatBytes(selectedFile.size)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700">{t.targetLabel}</div>
                  <div className="grid grid-cols-2 gap-2">
                    {validTargets.map((fmt) => {
                      const active = targetFormat === fmt;
                      return (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setTargetFormat(fmt)}
                          className={`px-3 py-2.5 text-xs font-semibold rounded-lg border transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                            active
                              ? 'bg-blue-700 text-white border-blue-700'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {fmt === 'xlsx' ? (
                            <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <FileText className="w-3.5 h-3.5 shrink-0" />
                          )}
                          <span>{formatLabel(fmt)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {showPdfOptions && (
                  <div className="space-y-2 pt-1">
                    <div className="text-xs font-medium text-slate-700">{t.pdfSettingsLabel}</div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setPdfOptions((o) => ({ ...o, orientation: 'portrait' }))}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                          pdfOptions.orientation === 'portrait'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {t.portrait}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPdfOptions((o) => ({ ...o, orientation: 'landscape' }))}
                        className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                          pdfOptions.orientation === 'landscape'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {t.landscape}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={isInspecting || exportingTarget !== null}
                  onClick={handleInspectAndConvertClick}
                  className="w-full py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>{isInspecting ? t.inspectingBtn : t.inspectAndConvert}</span>
                  {!isInspecting && <ArrowRight className="w-4 h-4 shrink-0" />}
                </button>
              </div>
            )}

            {inspectedDoc && validTargets.length > 0 && (
              <div className="pt-4 border-t border-slate-200 space-y-2.5">
                <div className="text-xs font-semibold text-slate-700">{t.downloadReadyTitle}</div>
                {statusMessage && <p className="text-xs text-emerald-700">{statusMessage}</p>}
                {showPdfOptions && !selectedFile && (
                  <div className="grid grid-cols-2 gap-2 pb-1">
                    <button
                      type="button"
                      onClick={() => setPdfOptions((o) => ({ ...o, orientation: 'portrait' }))}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                        pdfOptions.orientation === 'portrait'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {t.portrait}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfOptions((o) => ({ ...o, orientation: 'landscape' }))}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                        pdfOptions.orientation === 'landscape'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {t.landscape}
                    </button>
                  </div>
                )}
                <div className="space-y-2">
                  {validTargets.map((fmt) => {
                    const isExportingThis = exportingTarget === fmt;
                    return (
                      <button
                        key={fmt}
                        type="button"
                        disabled={exportingTarget !== null}
                        onClick={() => exportDocumentToFormat(inspectedDoc, fmt)}
                        className="w-full px-3.5 py-2.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 disabled:opacity-60 rounded-lg transition-colors flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span>
                          {t.downloadAs} {formatLabel(fmt)}
                        </span>
                        <span className="inline-flex items-center gap-1 text-blue-700 shrink-0">
                          <Download className="w-3.5 h-3.5" />
                          {isExportingThis && <span>{t.exporting}</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Right Panel: Careful Inspection & Editable Verification */}
          <section className="lg:col-span-8">
            <InspectionPreview
              lang={lang}
              document={inspectedDoc}
              isLoading={isInspecting}
              onChangeDocument={setInspectedDoc}
              onLoadSample={handleLoadSample}
            />
          </section>
        </div>

        {/* Firebase Authentication & Saved Conversion History */}
        <SavedHistoryPanel
          lang={lang}
          user={user}
          authReady={authReady}
          records={savedRecords}
          activeRecordId={activeRecordId}
          isSaving={isSavingToFirebase}
          hasCurrentDoc={inspectedDoc !== null}
          onSignIn={handleGoogleSignIn}
          onSignOut={handleSignOut}
          onSaveCurrent={handleSaveCurrentToFirebase}
          onSelectRecord={handleSelectSavedRecord}
          onDeleteRecord={handleDeleteSavedRecord}
        />

        {/* Supported Format Matrix & Sample Loaders */}
        <FormatMatrixSection lang={lang} onLoadSample={handleLoadSample} />
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1320px] mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <span>FidelDocs · Amharic (Ethiopic) & English Document Conversion</span>
          <span>PDF · Word (.docx) · Excel (.xlsx)</span>
        </div>
      </footer>
    </div>
  );
}
