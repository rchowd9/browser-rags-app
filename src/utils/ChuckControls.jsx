import React from "react";

export default function ChunkControls({ options, setOptions }) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-lg mb-4 text-xs text-slate-300 grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label className="block mb-1 font-semibold">
          Chunk Size: <span className="text-blue-400">{options.chunkSize} chars</span>
        </label>
        <input
          type="range"
          min="100"
          max="1000"
          step="50"
          value={options.chunkSize}
          onChange={(e) =>
            setOptions((prev) => ({ ...prev, chunkSize: Number(e.target.value) }))
          }
          className="w-full cursor-pointer accent-blue-500"
        />
      </div>

      <div>
        <label className="block mb-1 font-semibold">
          Chunk Overlap: <span className="text-blue-400">{options.chunkOverlap} chars</span>
        </label>
        <input
          type="range"
          min="0"
          max="200"
          step="10"
          value={options.chunkOverlap}
          onChange={(e) =>
            setOptions((prev) => ({ ...prev, chunkOverlap: Number(e.target.value) }))
          }
          className="w-full cursor-pointer accent-blue-500"
        />
      </div>

      <div>
        <label className="block mb-1 font-semibold">Splitting Strategy</label>
        <select
          value={options.splitBy}
          onChange={(e) =>
            setOptions((prev) => ({ ...prev, splitBy: e.target.value }))
          }
          className="w-full bg-slate-800 border border-slate-700 rounded p-1.5 text-slate-200 focus:outline-none focus:border-blue-500"
        >
          <option value="character">Fixed Character Window</option>
          <option value="sentence">Sentence Boundary</option>
          <option value="paragraph">Paragraph Structure</option>
        </select>
      </div>
    </div>
  );
}