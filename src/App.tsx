import React, { useState, useEffect, useRef } from 'react';
import { Upload, Cpu, MessageSquare, BookOpen, Send, Loader2 } from 'lucide-react';
import { chunkText, retrieveContext, DocumentChunk } from './utils/rag';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [query, setQuery] = useState('');
  const [retrievedDocs, setRetrievedDocs] = useState<DocumentChunk[]>([]);
  const [status, setStatus] = useState<string>('Ready');
  const [isLoading, setIsLoading] = useState(false);
  
  const worker = useRef<Worker | null>(null);

  useEffect(() => {
    // Instantiate Web Worker
    worker.current = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

    worker.current.onmessage = (e) => {
      const { type, data, error, progress } = e.data;

      if (type === 'PROGRESS') {
        setStatus(`Loading Model: ${progress?.file ?? ''} (${Math.round(progress?.progress ?? 0)}%)`);
      } else if (type === 'CHUNKS_EMBEDDED') {
        setChunks(data);
        setStatus('Document embedded successfully!');
        setIsLoading(false);
      } else if (type === 'QUERY_EMBEDDED') {
        const { embedding } = data;
        const matches = retrieveContext(embedding, chunks, 3);
        setRetrievedDocs(matches);
        setStatus('Retrieval complete');
        setIsLoading(false);
      } else if (type === 'ERROR') {
        setStatus(`Error: ${error}`);
        setIsLoading(false);
      }
    };

    return () => worker.current?.terminate();
  }, [chunks]);

  const handleProcessDocument = () => {
    if (!inputText.trim()) return;
    setIsLoading(true);
    setStatus('Chunking text...');

    const rawChunks = chunkText(inputText);
    const structuredChunks: DocumentChunk[] = rawChunks.map((text, idx) => ({
      id: `chunk-${idx}`,
      text
    }));

    setStatus('Generating embeddings in Web Worker...');
    worker.current?.postMessage({
      type: 'EMBED_CHUNKS',
      data: { chunks: structuredChunks }
    });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || chunks.length === 0) return;

    setIsLoading(true);
    setStatus('Embedding query...');
    worker.current?.postMessage({
      type: 'EMBED_QUERY',
      data: { query }
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 p-4 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center gap-2">
          <Cpu className="w-6 h-6 text-indigo-400" />
          <h1 className="font-bold text-lg">In-Browser Local RAG Engine</h1>
        </div>
        <span className="text-xs bg-indigo-950 text-indigo-300 border border-indigo-800 px-3 py-1 rounded-full">
          100% Client-Side
        </span>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column: Input Document */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-200 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-400" /> Knowledge Context
            </h2>
            <span className="text-xs text-slate-400">{chunks.length} chunks stored</span>
          </div>

          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste your markdown notes, research papers, or documentation here..."
            className="w-full flex-1 min-h-[300px] p-3 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:outline-none focus:border-indigo-500 font-mono text-sm"
          />

          <button
            onClick={handleProcessDocument}
            disabled={isLoading || !inputText.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white font-medium py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Vectorize Context
          </button>
        </section>

        {/* Right Column: Query & Retrieval */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
          <h2 className="font-semibold text-slate-200 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-400" /> Vector Search & Retrieval
          </h2>

          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your knowledge context..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={isLoading || chunks.length === 0}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 px-4 py-2 rounded-lg flex items-center justify-center"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <div className="text-xs font-mono text-indigo-400 bg-slate-950/50 p-2.5 rounded border border-slate-800/80">
            Status: {status}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto">
            <h3 className="text-xs uppercase font-semibold text-slate-400 tracking-wider">Relevant Passages</h3>
            {retrievedDocs.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No search executed or no chunks match yet.</p>
            ) : (
              retrievedDocs.map((doc) => (
                <div key={doc.id} className="p-3 bg-slate-950 border border-indigo-950 rounded-lg text-sm text-slate-300">
                  <p className="font-mono text-xs text-indigo-400 mb-1">{doc.id}</p>
                  <p>{doc.text}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}