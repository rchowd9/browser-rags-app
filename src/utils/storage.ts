import { openDB, type IDBPDatabase } from 'idb';
import type { DocumentChunk } from './rag';

const DB_NAME = 'browser-rag-app-db';
const DB_VERSION = 1;
const CHUNK_STORE = 'chunks';

interface StoredChunk {
  id: string;
  text: string;
  embedding: number[];
}

export async function getDatabase() {
  return openDB<{}>(DB_NAME, DB_VERSION, {
    upgrade(db: IDBPDatabase<{}>) {
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        db.createObjectStore(CHUNK_STORE, { keyPath: 'id' });
      }
    }
  });
}

export async function saveChunks(chunks: DocumentChunk[]) {
  const db = await getDatabase();
  const tx = db.transaction(CHUNK_STORE, 'readwrite');
  for (const chunk of chunks) {
    await tx.store.put({ id: chunk.id, text: chunk.text, embedding: chunk.embedding ?? [] } as StoredChunk);
  }
  await tx.done;
}

export async function loadChunks(): Promise<DocumentChunk[]> {
  const db = await getDatabase();
  const all = (await db.getAll(CHUNK_STORE)) as StoredChunk[];
  return all.map((item) => ({ id: item.id, text: item.text, embedding: item.embedding }));
}

export async function clearStoredChunks() {
  const db = await getDatabase();
  await db.clear(CHUNK_STORE);
}
