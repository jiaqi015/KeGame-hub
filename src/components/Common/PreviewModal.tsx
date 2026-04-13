import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X } from 'lucide-react';

interface PreviewModalProps {
  data: { title: string; subtitle: string; content: string } | null;
  onClose: () => void;
}

export function PreviewModal({ data, onClose }: PreviewModalProps) {
  return (
    <AnimatePresence>
      {data && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white w-[96vw] h-[96vh] max-w-none max-h-none rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-8 py-5 border-b border-black/5 flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-xl">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">{data.title}</h3>
                  <p className="text-xs text-[#86868B] font-medium">{data.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(data.content);
                  }}
                  className="px-4 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-full transition-colors border border-blue-100"
                >
                  复制全文
                </button>
                <button
                  onClick={onClose}
                  className="p-2 hover:bg-black/5 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-[#86868B]" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white">
              <div className="w-full">
                <div className="text-sm leading-relaxed text-[#1D1D1F] font-mono whitespace-pre-wrap selection:bg-blue-100 bg-white p-8 rounded-2xl border border-black/5 shadow-inner min-h-full">
                  {data.content}
                </div>
              </div>
            </div>
            <div className="px-8 py-4 border-t border-black/5 bg-white flex items-center justify-between">
              <div className="text-xs font-mono text-[#86868B]">
                共 {data.content.length} 个字符
              </div>
              <button
                onClick={onClose}
                className="px-6 py-2 bg-[#1D1D1F] text-white rounded-full font-bold text-sm hover:bg-black transition-colors"
              >
                返回
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
