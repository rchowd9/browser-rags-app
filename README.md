# Browser RAG App

A lightweight Retrieval-Augmented Generation (RAG) app that runs entirely in the browser. It lets you ingest text or uploaded documents, break them into chunks, generate embeddings locally, retrieve the most relevant passages, and answer questions using either local browser inference or a cloud LLM fallback.

## What this app does

This project is designed for local, privacy-friendly knowledge search:

- Paste text into the app or upload files such as PDF, DOCX, TXT, or Markdown
- Split content into overlapping chunks for better retrieval
- Generate embeddings in a Web Worker with Transformers.js
- Search the knowledge base using hybrid retrieval (vector + keyword matching)
- Answer questions from the retrieved context using a local model when available
- Optionally switch to OpenAI, Groq, or Gemini for cloud-powered answers
- Persist the processed knowledge base in the browser for later use

## Tech stack

- React + Vite + TypeScript
- Transformers.js for local embeddings and generation
- Web Workers for background processing in the browser
- IndexedDB / Dexie for local persistence
- MiniSearch for keyword retrieval
- PDF.js and Mammoth for document parsing

## How it works

1. You add knowledge to the app by pasting text or uploading a supported file.
2. The app splits the content into chunks and sends them to a background worker.
3. Each chunk is embedded with a local transformer model.
4. When you ask a question, the same model embeds the query and compares it against stored chunks.
5. The app retrieves the most relevant chunks and generates an answer based on that context.
6. If browser local generation is unavailable, the app can fall back to a cloud provider using your API key.

## Getting started

### Prerequisites

- Node.js 18+
- A modern browser with WebGPU support for the local model path

### Install dependencies

```bash
npm install
```

### Run the app locally

```bash
npm run dev
```

Then open the URL shown in the terminal, usually:

```bash
http://localhost:5173
```

## Usage

1. Open the app in your browser.
2. Paste content into the text box or drag in a supported file.
3. Click "Vectorize Context".
4. Ask a question in the search box.
5. Review the retrieved passages and generated answer.

## Cloud mode

The app includes a settings panel where you can choose between:

- Local browser AI
- OpenAI
- Groq
- Gemini

If you enable cloud mode, the app uses the retrieved context as input and sends it to the selected API. Your API key is stored in browser localStorage.

## Notes

- Local inference is best when the browser supports WebGPU.
- If the local model cannot run, the app still shows retrieval results and can fall back to cloud answering.
- The persisted knowledge base lives in the browser, so it is not shared with a backend service by default.

## Project structure

```text
src/
  App.tsx              # Main UI and orchestration logic
  worker.ts            # Web Worker for embeddings and generation
  utils/
    rag.ts             # Chunking, retrieval, ranking logic
    cloud.ts           # Cloud provider API calls
    fileParsers.ts     # PDF/DOCX/TXT parsing
    storage.ts         # Browser persistence
```

## Scripts

```bash
npm run dev      # start the app
npm run build    # build for production
npm run preview  # preview production build
npm test         # run the Vitest test suite
```

## License

This project is provided as a starter/example app for browser-based RAG workflows. Add your preferred license if you plan to share or publish it.
