import React from 'react';
import { useApp } from '../context/AppContext';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();

  return (
    <div className="fixed bottom-4 sm:bottom-5 left-4 right-4 sm:left-auto sm:right-5 z-50 flex flex-col gap-2 max-w-[420px] w-auto sm:w-full pointer-events-none items-center sm:items-end" id="toast-overlay-container">
      <AnimatePresence>
        {toasts.map((toast) => {
          const isProductAdded = toast.type === 'success' && toast.message.includes('adicionado ao carrinho!');
          
          return (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
              className={`pointer-events-auto p-3 rounded-2xl shadow-lg border flex items-center gap-3 bg-white ${
                toast.type === 'success'
                  ? 'border-emerald-100 text-gray-900'
                  : toast.type === 'error'
                  ? 'border-rose-200 bg-rose-50/90 text-rose-900'
                  : 'border-[#EADFD8] bg-amber-50/90 text-amber-900'
              }`}
            >
              {toast.type === 'success' && (
                <div className="bg-emerald-50 p-1.5 rounded-full shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
              )}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />}
              {toast.type === 'info' && <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />}

              <div className="flex-1 min-w-0">
                {isProductAdded ? (
                  <>
                    <div className="text-sm font-bold text-gray-900 leading-tight">Adicionado ao carrinho</div>
                    <div className="text-xs text-gray-500 truncate leading-tight mt-0.5">{toast.message.replace(' adicionado ao carrinho!', '')}</div>
                  </>
                ) : (
                  <div className="text-sm font-medium leading-tight">{toast.message}</div>
                )}
              </div>

              <button
                onClick={() => dismissToast(toast.id)}
                className="text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                aria-label="Fechar aviso"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};
