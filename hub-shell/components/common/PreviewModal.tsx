import React from 'react';
import { X } from 'lucide-react';

interface PreviewModalProps {
  data: { title: string; subtitle: string; content: string } | null;
  onClose: () => void;
}

export function PreviewModal({ data, onClose }: PreviewModalProps) {
  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md p-4 sm:p-6">
      <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{data.title}</h3>
            <p className="text-sm text-slate-500">{data.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-slate-50 rounded-xl p-6">
            <pre className="text-sm text-slate-700 font-mono whitespace-pre-wrap leading-relaxed">
              {data.content}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
