import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;
}

const SUPPORTED_TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'json',
  'csv',
  'js',
  'ts',
  'py',
  'html',
  'css',
]);

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createDocumentId(file: File): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${crypto.randomUUID()}-${file.name}`;
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${file.name}`;
}

export async function parseUploadedFile(file: File): Promise<UploadedDocument> {
  const extension = getFileExtension(file.name);
  let content = '';

  if (extension === 'pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];

    for (let index = 1; index <= pdf.numPages; index += 1) {
      const page = await pdf.getPage(index);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item) => {
          if ('str' in item) {
            const textItem = item as TextItem;
            return textItem.str;
          }
          return '';
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (pageText) {
        pages.push(pageText);
      }
    }

    content = pages.join('\n\n');
  } else if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    content = result.value.trim();
  } else if (SUPPORTED_TEXT_EXTENSIONS.has(extension)) {
    content = await file.text();
  } else {
    throw new Error(
      `Unsupported file format: .${extension}. Please upload a PDF, DOCX, TXT, or MD file.`
    );
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error(`No readable text was found in ${file.name}.`);
  }

  return {
    id: createDocumentId(file),
    name: file.name,
    size: file.size,
    type: file.type || `${extension.toUpperCase()} file`,
    content: trimmedContent,
  };
}

export function describeFile(file: UploadedDocument): string {
  return `${file.name} • ${formatFileSize(file.size)} • ${file.type}`;
}