import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Award, Medal, Sparkles, ChevronRight } from 'lucide-react';

interface FidelityModalProps {
  onClose: () => void;
}

export const FidelityModal: React.FC<FidelityModalProps> = ({ onClose }) => {
  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (typeof window === 'undefined' || !document.body) {
    return null;
  }

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div 
        className="bg-[#FCFAF6] border border-[#EADFD8] rounded-2xl max-w-lg w-full text-left shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[calc(100dvh-32px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-[#EADFD8]/40 hover:bg-[#EADFD8]/80 text-[#756B66] hover:text-[#201A17] cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/20 z-10"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="p-6 pb-0 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-[#E94F2F]/10 p-2 rounded-xl">
               <Award className="w-6 h-6 text-[#E94F2F]" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg text-[#201A17]">Programa Pão de Queijo Points</h3>
              <p className="text-xs font-bold text-[#E94F2F] uppercase tracking-wider">Fidelidade Uai</p>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 py-4 space-y-5">
          {/* Highlights */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-bold">
             <div className="bg-[#EADFD8]/30 p-3 rounded-xl border border-[#EADFD8]">30 pts boas-vindas</div>
             <div className="bg-[#EADFD8]/30 p-3 rounded-xl border border-[#EADFD8]">+20 pts por pedido</div>
             <div className="sm:col-span-2 bg-[#FFBE5C]/20 p-3 rounded-xl border border-[#FFBE5C]/30 text-[#E94F2F] flex items-center justify-between">
                <span>Bronze • Prata • Ouro • Diamante</span>
                <Medal className="w-4 h-4" />
             </div>
          </div>

          <div className="text-sm text-[#5C534E] space-y-5">
            <div className="space-y-1">
              <p className="font-bold text-[#201A17]">Ganhe pontos comprando pertim</p>
              <p className="leading-relaxed">O Pão de Queijo Points é o programa de fidelidade do Uaipertim, criado para recompensar quem compra nos comércios parceiros da sua cidade.</p>
            </div>
            
            <div className="space-y-1 border-t border-[#EADFD8] pt-4">
              <p className="font-bold text-[#201A17]">Como funciona</p>
              <p className="leading-relaxed">Ao participar do programa, você começa com 30 pontos de boas-vindas. Depois, a cada pedido concluído, recebe 20 pontos adicionais.</p>
            </div>

            <div className="space-y-1 border-t border-[#EADFD8] pt-4">
              <p className="font-bold text-[#201A17]">Para que servem os pontos</p>
              <p className="leading-relaxed">Seus pontos podem ser usados em descontos, benefícios promocionais e vantagens especiais em estabelecimentos parceiros.</p>
            </div>

            <div className="bg-[#E94F2F]/5 p-4 rounded-xl border border-[#E94F2F]/10 space-y-1">
              <p className="font-bold text-[#201A17]">Exemplo rápido</p>
              <p className="text-sm">Você entra com 30 pts + 20 pts (seu 1º pedido) = 50 pontos acumulados.</p>
            </div>
            
            <p className="text-xs text-[#756B66] pt-2 border-t border-[#EADFD8]">
              <span className="font-bold">Onde acompanhar:</span> Minha Conta → Fidelidade Uai
            </p>
          </div>
        </div>

        <div className="p-6 pt-3 border-t border-[#EADFD8] flex justify-end flex-shrink-0">
          <button 
            type="button"
            onClick={onClose}
            className="w-full px-5 py-2.5 bg-[#E94F2F] hover:bg-[#BD351C] text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/40"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
