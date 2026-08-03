import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Upload, Cpu, MessageSquare, BookOpen, Send, Loader2, FileText } from 'lucide-react';
import { chunkText, DocumentChunk, projectChunksTo2D } from './utils/rag';
import { describeFile, parseUploadedFile, UploadedDocument } from './utils/fileParsers';
import { loadChunks, saveChunks, clearStoredChunks } from './utils/storage';
import { CloudSettings, getStoredCloudSettings, saveCloudSettings, callCloudLLM } from './utils/cloud';

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
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [cloudSettings, setCloudSettings] = useState<CloudSettings>(() => getStoredCloudSettings());

  const worker = useRef<Worker | null>(null);
  const chunksRef = useRef<DocumentChunk[]>([]);
  const requestIdRef = useRef(0);
  const activeRequestIdRef = useRef<number | null>(null);

  const normalizeAnswerToken = (token: unknown): string => {
    if (typeof token === 'string') return token;
    if (typeof token === 'number' || typeof token === 'boolean') return String(token);
    if (Array.isArray(token)) return token.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join('');
    if (token && typeof token === 'object') {
      return typeof (token as any).generated_text === 'string'
        ? (token as any).generated_text
        : typeof (token as any).text === 'string'
        ? (token as any).text
        : JSON.stringify(token);
    }
    return '';
  };

  useEffect(() => {
    chunksRef.current = chunks;
    if (chunks.length > 0) {
      saveChunks(chunks).catch((error) => {
        console.error('Failed to persist chunks:', error);
      });
    }
  }, [chunks]);

  useEffect(() => {
    let cancelled = false;
    loadChunks()
      .then((storedChunks) => {
        if (!cancelled && storedChunks.length > 0) {
          setChunks(storedChunks);
          setStatus('Loaded persisted knowledge base');
        }
      })
      .catch((error) => {
        console.error('Failed to load persisted chunks:', error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCloudSettingsChange = (updates: Partial<CloudSettings>) => {
    const nextSettings = { ...cloudSettings, ...updates };
    setCloudSettings(nextSettings);
    saveCloudSettings(nextSettings);
  };

  const handleClearKnowledgeBase = async () => {
    await clearStoredChunks();
    setChunks([]);
    setRetrievedDocs([]);
    setSelectedChunkId(null);
    setAnswer('');
    setStatus('Knowledge base cleared');
  };

  const handleCloudAnswer = async (queryText: string, matches: DocumentChunk[]) => {
    const context = matches.map((match) => match.text);
    setStatus(`Querying cloud ${cloudSettings.provider.toUpperCase()}...`);
    try {
      const cloudResponse = await callCloudLLM(queryText, context, cloudSettings);
      setAnswer(cloudResponse);
      setStatus('Answer generated via cloud');
    } catch (error: any) {
      setErrorMessage(error?.message ?? 'Cloud answer failed');
      setStatus('Cloud answer failed');
    } finally {
      setIsLoading(false);
    }
  };

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
        setSelectedChunkId(null);
        setStatus('Document embedded successfully!');
        setIsLoading(false);
      } else if (type === 'QUERY_EMBEDDED') {
        const matches = data.matches ?? [];
        setRetrievedDocs(matches);
        setStatus('Retrieval complete');
        if (data.cloudMode && matches.length > 0) {
          handleCloudAnswer(data.query, matches);
        }
      } else if (type === 'ANSWER_STREAM') {
        const safeToken = normalizeAnswerToken(token);
        setAnswer((prev) => prev + safeToken);
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
      data: {
        query,
        chunks: chunksRef.current,
        requestId: nextRequestId,
        cloudMode: cloudSettings.mode === 'cloud'
      }
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

  const projectionPoints = useMemo(() => projectChunksTo2D(chunks), [chunks]);
  const selectedChunk = useMemo(() => {
    if (!selectedChunkId) return null;
    return chunks.find((chunk) => chunk.id === selectedChunkId) ?? retrievedDocs.find((chunk) => chunk.id === selectedChunkId) ?? null;
  }, [chunks, retrievedDocs, selectedChunkId]);

  const vectorStats = useMemo(() => {
    if (retrievedDocs.length === 0) {
      const values = chunks.map((chunk) => chunk.embedding?.length ?? 0);
      return {
        topSimilarity: 0,
        avgSimilarity: 0,
        dimensions: values[0] ?? 0,
        points: chunks.length
      };
    }

    const similarities = retrievedDocs.map((chunk) => chunk.similarityScore ?? 0);
    return {
      topSimilarity: Math.max(...similarities),
      avgSimilarity: similarities.reduce((sum, value) => sum + value, 0) / similarities.length,
      dimensions: chunks[0]?.embedding?.length ?? 0,
      points: chunks.length
    };
  }, [chunks, retrievedDocs]);

  const formatPercent = (value: number) => `${Math.max(0, value * 100).toFixed(1)}% Match`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 p-4 flex flex-col gap-4 bg-slate-900/50 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-6 h-6 text-indigo-400" />
          <div>
            <h1 className="font-bold text-lg">In-Browser Local RAG Engine</h1>
            <p className="text-xs text-slate-400">Mode: {cloudSettings.mode === 'cloud' ? `Cloud (${cloudSettings.provider})` : 'Local Browser AI'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSettings((value) => !value)}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 px-3 py-2 rounded-full"
          >
            {showSettings ? 'Close Settings' : 'Settings'}
          </button>
          <span className="text-xs bg-indigo-950 text-indigo-300 border border-indigo-800 px-3 py-1 rounded-full">
            100% Client-Side
          </span>
        </div>
      </header>

      {showSettings && (
        <div className="mx-auto w-full max-w-6xl p-4 bg-slate-950 border-b border-slate-800 text-slate-100 rounded-b-xl shadow-xl">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-100">Cloud Fallback Settings</h2>
              <label className="block text-xs text-slate-400">Mode</label>
              <select
                value={cloudSettings.mode}
                onChange={(e) => handleCloudSettingsChange({ mode: e.target.value as any })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                <option value="local">Local Browser AI</option>
                <option value="cloud">Cloud API</option>
              </select>

              <label className="block text-xs text-slate-400">Provider</label>
              <select
                value={cloudSettings.provider}
                onChange={(e) => handleCloudSettingsChange({ provider: e.target.value as any })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                <option value="openai">OpenAI</option>
                <option value="groq">Groq</option>
                <option value="gemini">Gemini</option>
              </select>
            </div>

            <div className="space-y-3">
              <label className="block text-xs text-slate-400">API Key</label>
              <input
                value={cloudSettings.apiKey}
                onChange={(e) => handleCloudSettingsChange({ apiKey: e.target.value })}
                placeholder="Enter your API key"
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
              <p className="text-[11px] text-slate-500">Your API key is stored locally in localStorage and used only for cloud queries.</p>
              <button
                type="button"
                onClick={handleClearKnowledgeBase}
                className="w-full rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-2 text-sm font-semibold text-white"
              >
                Clear persisted knowledge base
              </button>
            </div>
          </div>
        </div>
      )}

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

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs uppercase font-semibold text-slate-400 tracking-wider">Embedding Inspector</h3>
              <span className="text-[11px] text-slate-500">{vectorStats.points} points</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-slate-300 mb-3">
              <div className="rounded bg-slate-900 p-2">
                <div className="text-slate-500 text-[10px] uppercase">Top Match</div>
                <div className="font-semibold text-indigo-300">{(vectorStats.topSimilarity * 100).toFixed(1)}%</div>
              </div>
              <div className="rounded bg-slate-900 p-2">
                <div className="text-slate-500 text-[10px] uppercase">Avg Match</div>
                <div className="font-semibold text-emerald-300">{(vectorStats.avgSimilarity * 100).toFixed(1)}%</div>
              </div>
              <div className="rounded bg-slate-900 p-2">
                <div className="text-slate-500 text-[10px] uppercase">Dims</div>
                <div className="font-semibold text-slate-100">{vectorStats.dimensions}</div>
              </div>
            </div>
            <svg viewBox="0 0 320 220" className="w-full h-56 rounded-lg bg-slate-900/80">
              <rect x="0" y="0" width="320" height="220" rx="12" fill="#020617" />
              {projectionPoints.map((point) => {
                const isSelected = point.chunk.id === selectedChunkId;
                return (
                  <g key={point.id} onClick={() => setSelectedChunkId(point.chunk.id)} className="cursor-pointer">
                    <circle cx={point.x} cy={point.y} r={isSelected ? 7 : 5} fill={isSelected ? '#818cf8' : '#34d399'} opacity={0.9} />
                    <circle cx={point.x} cy={point.y} r={isSelected ? 12 : 8} fill="none" stroke={isSelected ? '#a5b4fc' : 'transparent'} strokeWidth={1.5} />
                  </g>
                );
              })}
            </svg>
            {selectedChunk && (
              <div className="mt-3 rounded border border-indigo-900 bg-indigo-950/40 p-2 text-xs text-slate-300">
                <div className="font-semibold text-indigo-200">Selected chunk</div>
                <div className="mt-1 text-slate-400">{selectedChunk.id}</div>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto">
            <h3 className="text-xs uppercase font-semibold text-slate-400 tracking-wider">Relevant Passages</h3>
            {retrievedDocs.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No search executed or no chunks match yet.</p>
            ) : (
              retrievedDocs.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => setSelectedChunkId(doc.id)}
                  className={`p-3 bg-slate-950 border rounded-lg text-sm text-slate-300 cursor-pointer transition ${selectedChunkId === doc.id ? 'border-indigo-400 shadow-lg shadow-indigo-950/40' : 'border-indigo-950'}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="font-mono text-xs text-indigo-400">{doc.id}</p>
                    <span className="rounded-full bg-indigo-600/20 text-indigo-300 px-2 py-0.5 text-[11px] whitespace-nowrap">
                      {formatPercent(doc.similarityScore ?? 0)}
                    </span>
                  </div>
                  <p>{doc.text}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
                    <span>Vector {(doc.similarityScore ?? 0).toFixed(3)}</span>
                    <span>Keyword {(doc.keywordScore ?? 0).toFixed(3)}</span>
                    <span>RRF {(doc.hybridScore ?? 0).toFixed(3)}</span>
                  </div>
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