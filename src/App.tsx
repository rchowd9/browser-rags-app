import React, { useState, useEffect, useRef } from 'react';
import { Upload, Cpu, MessageSquare, BookOpen, Send, Loader2, FileText } from 'lucide-react';
import { chunkText, retrieveContext, DocumentChunk } from './utils/rag';
import { describeFile, parseUploadedFile, UploadedDocument } from './utils/fileParsers';

export default function App() {
  const [inputText, setInputText] = useState('');
  const [chunks, setChunks] = useState<DocumentChunk[]>([]);
  const [query, setQuery] = useState('');
  const [retrievedDocs, setRetrievedDocs] = useState<DocumentChunk[]>([]);
  const [status, setStatus] = useState<string>('Ready');
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDocument[]>([]);
  const [answer, setAnswer] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const worker = useRef<Worker | null>(null);
  const chunksRef = useRef<DocumentChunk[]>([]);
  const requestIdRef = useRef(0);
  const activeRequestIdRef = useRef<number | null>(null);

  useEffect(() => {
    chunksRef.current = chunks;
  }, [chunks]);

  useEffect(() => {
    worker.current = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

    worker.current.onmessage = (e) => {
      const { type, data, error, progress, token, requestId } = e.data;
      if (requestId !== undefined && activeRequestIdRef.current !== null && requestId !== activeRequestIdRef.current) {
        return;
      }

      if (type === 'PROGRESS') {
        setStatus(`Loading Model: ${progress?.file ?? ''} (${Math.round(progress?.progress ?? 0)}%)`);
      } else if (type === 'CHUNKS_EMBEDDED') {
        setChunks(data);
        setStatus('Document embedded successfully!');
        setIsLoading(false);
      } else if (type === 'QUERY_EMBEDDED') {
        const { embedding } = data;
        const matches = retrieveContext(embedding, chunksRef.current, 3);
        setRetrievedDocs(matches);
        setStatus('Retrieval complete');
      } else if (type === 'ANSWER_STREAM') {
        setAnswer((prev) => prev + token);
      } else if (type === 'ANSWER_COMPLETE') {
        setStatus('Answer generated locally');
        setIsLoading(false);
      } else if (type === 'ANSWER_FALLBACK') {
        setAnswer(data.text);
        setStatus('Answer generation unavailable in this browser');
        setIsLoading(false);
      } else if (type === 'ERROR') {
        setErrorMessage(error);
        setStatus(`Error: ${error}`);
        setIsLoading(false);
      }
    };

    return () => worker.current?.terminate();
  }, []);

  const handleProcessText = (textToProcess: string, label = 'Knowledge context') => {
    if (!textToProcess.trim()) {
      setErrorMessage('Please provide some text or upload a document first.');
      return;
    }

    const nextRequestId = requestIdRef.current + 1;
    requestIdRef.current = nextRequestId;
    activeRequestIdRef.current = nextRequestId;

    setIsLoading(true);
    setAnswer('');
    setErrorMessage('');
    setStatus(`Chunking ${label.toLowerCase()}...`);

    const rawChunks = chunkText(textToProcess);
    const structuredChunks: DocumentChunk[] = rawChunks.map((text, idx) => ({
      id: `chunk-${idx}`,
      text
    }));

    setStatus('Generating embeddings in Web Worker...');
    worker.current?.postMessage({
      type: 'EMBED_CHUNKS',
      data: { chunks: structuredChunks, requestId: nextRequestId }
    });
  };

  const handleProcessDocument = () => {
    handleProcessText(inputText);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || chunks.length === 0) return;

    const nextRequestId = requestIdRef.current + 1;
    requestIdRef.current = nextRequestId;
    activeRequestIdRef.current = nextRequestId;

    setIsLoading(true);
    setAnswer('');
    setErrorMessage('');
    setStatus('Embedding query...');
    worker.current?.postMessage({
      type: 'EMBED_QUERY',
      data: { query, chunks: chunksRef.current, requestId: nextRequestId }
    });
  };

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const parsedDocs = [] as UploadedDocument[];
    const errors = [] as string[];

    for (const file of Array.from(files)) {
      try {
        const parsed = await parseUploadedFile(file);
        parsedDocs.push(parsed);
      } catch (error: any) {
        errors.push(error?.message || `Unable to parse ${file.name}.`);
      }
    }

    if (parsedDocs.length === 0) {
      setUploadedDocs([]);
      setErrorMessage(errors.join(' '));
      setStatus('No readable content found in the uploaded files.');
      return;
    }

    const combinedText = parsedDocs.map((doc) => `Source: ${doc.name}\n${doc.content}`).join('\n\n');
    setUploadedDocs(parsedDocs);
    if (errors.length > 0) {
      setErrorMessage(`Some files could not be parsed: ${errors.join(' ')}`);
    } else {
      setErrorMessage('');
    }
    handleProcessText(combinedText, 'uploaded document');
  };

  const onDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    await handleFileUpload(event.dataTransfer.files);
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

          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`rounded-lg border-2 border-dashed p-3 transition ${isDragging ? 'border-indigo-400 bg-indigo-950/40' : 'border-slate-800 bg-slate-950/40'}`}
          >
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Upload className="w-4 h-4" />
              Drag and drop PDFs, DOCX, TXT, or MD files here
            </div>
            <input
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.md,.markdown"
              className="mt-3 block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500"
              onChange={(event) => handleFileUpload(event.target.files)}
            />
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

          {uploadedDocs.length > 0 && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-sm text-slate-300">
              <div className="flex items-center gap-2 text-indigo-300 mb-2">
                <FileText className="w-4 h-4" />
                Uploaded documents
              </div>
              <ul className="space-y-1">
                {uploadedDocs.map((doc) => (
                  <li key={doc.id} className="text-xs text-slate-400">
                    {describeFile(doc)}
                  </li>
                ))}
              </ul>
            </div>
          )}
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

          {errorMessage && (
            <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 text-sm text-amber-200">
              {errorMessage}
            </div>
          )}

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

            {answer && (
              <div className="rounded-lg border border-emerald-900 bg-emerald-950/30 p-3">
                <h3 className="text-xs uppercase font-semibold text-emerald-300 tracking-wider mb-2">Answer</h3>
                <p className="text-sm text-emerald-100 whitespace-pre-wrap">{answer}</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}