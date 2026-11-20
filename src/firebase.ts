import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type {
  DetectedScript,
  DocumentBlock,
  DocumentModel,
  DocumentSheet,
  FileFormat,
  InspectionStats,
} from '../shared/types.ts';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export async function signInWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutUser() {
  return signOut(auth);
}

// Firestore does not allow nested arrays (string[][]); encode table rows as { cells: string[] } maps.
type StoredRow = { cells: string[] };

type StoredBlock =
  | { id: string; type: 'heading'; level: 1 | 2 | 3; text: string }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'list'; ordered: boolean; items: string[] }
  | { id: string; type: 'table'; title: string; headers: string[]; rows: StoredRow[] };

type StoredSheet = {
  name: string;
  headers: string[];
  rows: StoredRow[];
};

export interface SavedConversionRecord {
  id: string;
  ownerId: string;
  title: string;
  fileName: string;
  sourceFormat: FileFormat;
  fileSizeBytes: number;
  detectedScript: DetectedScript;
  ethiopicCharCount: number;
  latinCharCount: number;
  pageOrSheetCount: number;
  inspectionMethod: InspectionStats['inspectionMethod'];
  inspectionNotes: string[];
  blocks: DocumentBlock[];
  sheets: DocumentSheet[];
  createdAtMs: number;
  updatedAtMs: number;
}

function serializeBlocksForFirestore(blocks: DocumentBlock[]): StoredBlock[] {
  return blocks.slice(0, 400).map((b) => {
    if (b.type === 'heading') {
      return { id: b.id, type: 'heading', level: b.level, text: b.text.slice(0, 1000) };
    }
    if (b.type === 'paragraph') {
      return { id: b.id, type: 'paragraph', text: b.text.slice(0, 10000) };
    }
    if (b.type === 'list') {
      return {
        id: b.id,
        type: 'list',
        ordered: b.ordered,
        items: b.items.slice(0, 200).map((it) => it.slice(0, 2000)),
      };
    }
    return {
      id: b.id,
      type: 'table',
      title: (b.title || '').slice(0, 300),
      headers: b.headers.slice(0, 40).map((h) => h.slice(0, 300)),
      rows: b.rows.slice(0, 250).map((r) => ({
        cells: r.slice(0, 40).map((c) => c.slice(0, 1000)),
      })),
    };
  });
}

function serializeSheetsForFirestore(sheets: DocumentSheet[]): StoredSheet[] {
  return sheets.slice(0, 30).map((s) => ({
    name: s.name.slice(0, 64),
    headers: s.headers.slice(0, 40).map((h) => h.slice(0, 300)),
    rows: s.rows.slice(0, 250).map((r) => ({
      cells: r.slice(0, 40).map((c) => c.slice(0, 1000)),
    })),
  }));
}

function deserializeBlocks(raw: StoredBlock[] = []): DocumentBlock[] {
  return raw.map((b) => {
    if (b.type === 'table') {
      return {
        id: b.id,
        type: 'table',
        title: b.title || undefined,
        headers: b.headers || [],
        rows: (b.rows || []).map((r) => r.cells || []),
      };
    }
    return b;
  });
}

function deserializeSheets(raw: StoredSheet[] = []): DocumentSheet[] {
  return raw.map((s) => ({
    name: s.name,
    headers: s.headers || [],
    rows: (s.rows || []).map((r) => r.cells || []),
  }));
}

export async function ensureUserProfile(
  userId: string,
  displayName: string | null,
  preferredLang: 'am' | 'en'
): Promise<void> {
  const path = `users/${userId}`;
  const ref = doc(db, 'users', userId);
  try {
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: userId,
        displayName: (displayName || 'User').slice(0, 120),
        preferredLang,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        displayName: (displayName || 'User').slice(0, 120),
        preferredLang,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveConversionToFirestore(
  userId: string,
  docModel: DocumentModel,
  existingId?: string | null
): Promise<string> {
  const conversionId = existingId || `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const path = `users/${userId}/conversions/${conversionId}`;
  const ref = doc(db, 'users', userId, 'conversions', conversionId);

  const safeTitle = (docModel.title || docModel.stats.fileName || 'Untitled').trim().slice(0, 300) || 'Untitled';
  const safeFileName = (docModel.stats.fileName || 'document').trim().slice(0, 255) || 'document';
  const safeNotes = (docModel.stats.inspectionNotes || [])
    .map((n) => String(n).trim().slice(0, 500))
    .filter(Boolean)
    .slice(0, 10);

  const serializedBlocks = serializeBlocksForFirestore(docModel.blocks);
  const serializedSheets = serializeSheetsForFirestore(docModel.sheets);

  try {
    if (existingId) {
      await updateDoc(ref, {
        title: safeTitle,
        detectedScript: docModel.stats.detectedScript,
        ethiopicCharCount: Math.max(0, Math.floor(docModel.stats.ethiopicCharCount)),
        latinCharCount: Math.max(0, Math.floor(docModel.stats.latinCharCount)),
        blocks: serializedBlocks,
        sheets: serializedSheets,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        id: conversionId,
        ownerId: userId,
        title: safeTitle,
        fileName: safeFileName,
        sourceFormat: docModel.stats.sourceFormat,
        fileSizeBytes: Math.max(0, Math.min(26214400, Math.floor(docModel.stats.fileSizeBytes))),
        detectedScript: docModel.stats.detectedScript,
        ethiopicCharCount: Math.max(0, Math.floor(docModel.stats.ethiopicCharCount)),
        latinCharCount: Math.max(0, Math.floor(docModel.stats.latinCharCount)),
        pageOrSheetCount: Math.max(1, Math.floor(docModel.stats.pageOrSheetCount)),
        inspectionMethod: docModel.stats.inspectionMethod,
        inspectionNotes: safeNotes,
        blocks: serializedBlocks,
        sheets: serializedSheets,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return conversionId;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteConversionFromFirestore(userId: string, conversionId: string): Promise<void> {
  const path = `users/${userId}/conversions/${conversionId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'conversions', conversionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserConversions(
  userId: string,
  onData: (records: SavedConversionRecord[]) => void,
  onError: (err: Error) => void
): Unsubscribe {
  const path = `users/${userId}/conversions`;
  const q = query(
    collection(db, 'users', userId, 'conversions'),
    where('ownerId', '==', userId),
    orderBy('updatedAt', 'desc')
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const records: SavedConversionRecord[] = snapshot.docs.map((snap) => {
        const d = snap.data();
        const createdTs = d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now();
        const updatedTs = d.updatedAt?.toMillis ? d.updatedAt.toMillis() : createdTs;
        return {
          id: String(d.id || snap.id),
          ownerId: String(d.ownerId || userId),
          title: String(d.title || ''),
          fileName: String(d.fileName || ''),
          sourceFormat: d.sourceFormat as FileFormat,
          fileSizeBytes: Number(d.fileSizeBytes || 0),
          detectedScript: d.detectedScript as DetectedScript,
          ethiopicCharCount: Number(d.ethiopicCharCount || 0),
          latinCharCount: Number(d.latinCharCount || 0),
          pageOrSheetCount: Number(d.pageOrSheetCount || 1),
          inspectionMethod: d.inspectionMethod as InspectionStats['inspectionMethod'],
          inspectionNotes: Array.isArray(d.inspectionNotes) ? d.inspectionNotes.map(String) : [],
          blocks: deserializeBlocks(d.blocks as StoredBlock[]),
          sheets: deserializeSheets(d.sheets as StoredSheet[]),
          createdAtMs: createdTs,
          updatedAtMs: updatedTs,
        };
      });
      onData(records);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export function recordToDocumentModel(rec: SavedConversionRecord): DocumentModel {
  const paragraphCount = rec.blocks.filter(
    (b) => b.type === 'paragraph' || b.type === 'list' || b.type === 'heading'
  ).length;
  const tableCount = rec.blocks.filter((b) => b.type === 'table').length || rec.sheets.length;
  return {
    title: rec.title,
    blocks: rec.blocks,
    sheets: rec.sheets,
    stats: {
      sourceFormat: rec.sourceFormat,
      fileName: rec.fileName,
      fileSizeBytes: rec.fileSizeBytes,
      pageOrSheetCount: rec.pageOrSheetCount,
      paragraphCount,
      tableCount,
      ethiopicCharCount: rec.ethiopicCharCount,
      latinCharCount: rec.latinCharCount,
      detectedScript: rec.detectedScript,
      inspectionMethod: rec.inspectionMethod,
      inspectionNotes: rec.inspectionNotes,
    },
  };
}
