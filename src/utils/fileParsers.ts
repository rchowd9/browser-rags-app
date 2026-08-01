import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth/mammoth.browser';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export interface UploadedDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  content: string;
}

function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
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
  } else if (extension === 'txt' || extension === 'md' || extension === 'markdown') {
    content = await file.text();
  } else {
    content = await file.text();
  }

  return {
    id: `${file.name}-${file.size}`,
    name: file.name,
    size: file.size,
    type: file.type || `${extension} file`,
    content: content.trim()
  };
}

export function describeFile(file: UploadedDocument): string {
  return `${file.name} • ${formatFileSize(file.size)} • ${file.type}`;
}
