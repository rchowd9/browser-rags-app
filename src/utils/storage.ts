import { openDB, type IDBPDatabase, type DBSchema } from 'idb';
import type { DocumentChunk } from './rag';

const DB_NAME = 'browser-rag-app-db';
const DB_VERSION = 1;
const CHUNK_STORE = 'chunks';

interface StoredChunk {
  id: string;
  text: string;
  embedding: number[];
}

interface LocalRAGDBSchema extends DBSchema {
  chunks: {
    key: string;
    value: StoredChunk;
  };
}

export async function getDatabase(): Promise<IDBPDatabase<LocalRAGDBSchema>> {
  return openDB<LocalRAGDBSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        db.createObjectStore(CHUNK_STORE, { keyPath: 'id' });
      }
    }
  });
}

export async function saveChunks(chunks: DocumentChunk[]): Promise<void> {
  const db = await getDatabase();
  const tx = db.transaction(CHUNK_STORE, 'readwrite');
  
  // Clear old entries to keep database synchronized with current knowledge context
  await tx.store.clear();

  for (const chunk of chunks) {
    await tx.store.put({
      id: chunk.id,
      text: chunk.text,
      embedding: chunk.embedding ?? []
    });
  }
  await tx.done;
}

export async function loadChunks(): Promise<DocumentChunk[]> {
  const db = await getDatabase();
  const all = await db.getAll(CHUNK_STORE);
  return all.map((item) => ({
    id: item.id,
    text: item.text,
    embedding: item.embedding
  }));
}

export async function clearStoredChunks(): Promise<void> {
  const db = await getDatabase();
  await db.clear(CHUNK_STORE);
}