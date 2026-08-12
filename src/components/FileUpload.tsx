import React, { useState, useRef } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import { parseUploadedFile, UploadedDocument, describeFile } from "../utils/fileParsers";

interface FileUploadProps {
  onFileParsed: (parsedDoc: UploadedDocument) => void;
  isLoading?: boolean;
}

export default function FileUpload({ onFileParsed, isLoading }: FileUploadProps) {
  const [isParsing, setIsParsing] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<UploadedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setIsParsing(true);

    try {
      const parsedDoc = await parseUploadedFile(file);
      setCurrentDoc(parsedDoc);
      // Auto-trigger automatic ingestion in parent
      onFileParsed(parsedDoc);
    } catch (err: any) {
      setError(err.message || "Failed to parse document");
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClear = () => {
    setCurrentDoc(null);
    setError(null);
  };

  return (
    <div className="w-full mb-4">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".pdf,.docx,.txt,.md,.json"
        className="hidden"
      />

      {!currentDoc ? (
        <button
          type="button"
          disabled={isParsing || isLoading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-4 px-4 border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-lg flex flex-col items-center justify-center bg-slate-900/50 hover:bg-slate-900 transition-colors text-slate-400 hover:text-slate-200 cursor-pointer disabled:opacity-50"
        >
          {isParsing ? (
            <div className="flex items-center gap-2 text-blue-400">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Extracting document text...</span>
            </div>
          ) : (
            <>
              <Upload className="w-6 h-6 mb-2 text-slate-400" />
              <span className="text-sm font-medium">Click or drag PDF, DOCX, TXT, or MD files</span>
              <span className="text-xs text-slate-500 mt-1">Automatic ingestion & vectorization on upload</span>
            </>
          )}
        </button>
      ) : (
        <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileText className="w-4 h-4 text-blue-400 shrink-0" />
            <span className="font-medium truncate">{describeFile(currentDoc)}</span>
          </div>
          <button
            onClick={handleClear}
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 ml-2"
            title="Remove file"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
    </div>
  );
}