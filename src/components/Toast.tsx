import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none" id="toast-overlay-container">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
            className={`pointer-events-auto p-4 rounded-xl shadow-lg border flex items-start gap-3 bg-white ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50/90 text-emerald-900'
                : toast.type === 'error'
                ? 'border-rose-200 bg-rose-50/90 text-rose-900'
                : 'border-[#EADFD8] bg-amber-50/90 text-amber-900'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
            {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}

            <div className="flex-1 text-sm font-medium leading-tight">
              {toast.message}
            </div>

            <button
              onClick={() => dismissToast(toast.id)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
