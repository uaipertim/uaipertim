import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import { useLocation } from '../../hooks/useLocation';
import { MapPin, ArrowUp, X, HelpCircle, FileText, Shield } from 'lucide-react';

interface InstitutionalModalProps {
  type: 'help' | 'terms' | 'privacy';
  onClose: () => void;
}

const InstitutionalModal: React.FC<InstitutionalModalProps> = ({ type, onClose }) => {
  // Lock body scroll on mount, restore on unmount
  useEffect(() => {
    const originalStyle = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalStyle;
    };
  }, []);

  // Escape key to close
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

  const renderContent = () => {
    switch (type) {
      case 'help':
        return (
          <>
            <h3 id="modal-title" className="font-extrabold text-lg text-[#201A17] flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-[#E94F2F]" />
              Central de Ajuda
            </h3>
            <div className="text-sm text-[#5C534E] space-y-3 max-h-[50vh] overflow-y-auto pr-1 mt-3">
              <div className="border-b border-[#EADFD8]/40 pb-2">
                <p className="font-bold text-[#201A17]">Como fazer um pedido?</p>
                <p className="mt-1 leading-relaxed">Navegue pelos estabelecimentos da sua cidade, escolha seus produtos favoritos, adicione ao carrinho e finalize o pedido de forma simples e rápida.</p>
              </div>
              
              <div className="border-b border-[#EADFD8]/40 pb-2">
                <p className="font-bold text-[#201A17]">Como funciona a entrega?</p>
                <p className="mt-1 leading-relaxed">Cada estabelecimento parceiro é responsável pelo envio ou disponibilização para retirada dos produtos de forma rápida e segura na sua região.</p>
              </div>

              <div>
                <p className="font-bold text-[#201A17]">Precisa de suporte?</p>
                <p className="mt-1 leading-relaxed">Estamos sempre prontos para ajudar. Fale com nossa equipe através dos contatos oficiais da plataforma.</p>
              </div>
            </div>
          </>
        );
      case 'terms':
        return (
          <>
            <h3 id="modal-title" className="font-extrabold text-lg text-[#201A17] flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#E94F2F]" />
              Termos de Uso
            </h3>
            <div className="text-sm text-[#5C534E] space-y-3 max-h-[50vh] overflow-y-auto pr-1 mt-3">
              <p className="leading-relaxed">Ao utilizar a plataforma UaiPertim, você concorda em agir com respeito e conformidade com as leis e regulamentos de sua localidade.</p>
              <div className="space-y-2">
                <p>1. <strong className="text-[#201A17]">Uso do Serviço:</strong> Nosso objetivo é conectar você aos melhores produtos e comércios de sua região de forma rápida e segura.</p>
                <p>2. <strong className="text-[#201A17]">Contas:</strong> Você se compromete a fornecer informações verídicas durante o cadastro de sua conta e manter seus dados de entrega atualizados.</p>
                <p>3. <strong className="text-[#201A17]">Responsabilidade:</strong> Os estabelecimentos parceiros são inteiramente responsáveis pela qualidade, preparo e entrega de seus respectivos itens.</p>
              </div>
            </div>
          </>
        );
      case 'privacy':
        return (
          <>
            <h3 id="modal-title" className="font-extrabold text-lg text-[#201A17] flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#E94F2F]" />
              Privacidade
            </h3>
            <div className="text-sm text-[#5C534E] space-y-3 max-h-[50vh] overflow-y-auto pr-1 mt-3">
              <p className="leading-relaxed">A privacidade de seus dados é nossa prioridade máxima na UaiPertim.</p>
              <div className="space-y-2">
                <p>• <strong className="text-[#201A17]">Coleta de dados:</strong> Guardamos apenas as informações estritamente necessárias para a criação de conta, localização e entrega rápida dos seus pedidos.</p>
                <p>• <strong className="text-[#201A17]">Uso seguro:</strong> Seus dados de contato e endereço nunca serão compartilhados com terceiros para fins de publicidade não solicitada.</p>
                <p>• <strong className="text-[#201A17]">Controle do usuário:</strong> Você pode alterar ou remover suas informações a qualquer momento diretamente em suas configurações de conta.</p>
              </div>
            </div>
          </>
        );
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs transition-opacity duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        className="bg-[#FCFAF6] border border-[#EADFD8] rounded-2xl max-w-md w-full p-6 text-left shadow-2xl space-y-4 relative animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg bg-[#EADFD8]/40 hover:bg-[#EADFD8]/80 text-[#756B66] hover:text-[#201A17] cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/20"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="pt-2">
          {renderContent()}
        </div>

        <div className="pt-3 border-t border-[#EADFD8] flex justify-end">
          <button 
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-5 py-2.5 bg-[#E94F2F] hover:bg-[#BD351C] text-white text-xs font-black rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 focus:outline-none focus:ring-2 focus:ring-[#E94F2F]/40"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export const AppFooter: React.FC<{ showMobileCartBar?: boolean }> = ({ showMobileCartBar }) => {
  const { selectedCity, environment } = useApp();
  const [path] = useLocation();
  const [activeModal, setActiveModal] = useState<'help' | 'terms' | 'privacy' | null>(null);

  // Check if current page is public (home, ClientArea, catalog, shop page, etc.)
  // Hide footer on operational areas (merchant panel, admin area, checkout, tracking, login/register)
  const isPublicPage = 
    path === '/' || 
    path === '' || 
    path === '/minha-conta' ||
    path === '/meus-pedidos' ||
    (path === '/demo' && environment === 'cliente') ||
    (!['/login', '/cadastro', '/gestor', '/admin', '/admin/migracao-catalogo'].includes(path) && !path.startsWith('/acompanhar-pedido/'));

  if (!isPublicPage) {
    return null;
  }

  const scrollToTop = () => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? 'auto' : 'smooth'
    });
  };

  return (
    <footer className={`bg-[#FAF8F5] border-t border-[#EADFD8] pt-8 pb-6 px-6 mt-12 w-full rounded-t-[24px] sm:rounded-t-none shadow-xs relative z-10 ${showMobileCartBar ? 'sm:pb-6 pb-[calc(88px+env(safe-area-inset-bottom))]' : ''}`}>
      <div className="max-w-7xl mx-auto flex flex-col gap-6">
        
        {/* DESKTOP LAYOUT (Horizontal row) */}
        <div className="hidden sm:flex flex-row items-center justify-between gap-6 pb-6 border-b border-[#EADFD8]">
          {/* Area 1: Brand & Slogan */}
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 shrink-0 overflow-hidden rounded-full flex items-center justify-center">
              <img
                src="/brand/uaipertim-logo-oficial-v2.png"
                alt="UaiPertim"
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover select-none pointer-events-none scale-[1.02]"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base text-[#201A17]">UaiPertim</span>
                <span className="text-[9px] font-black uppercase tracking-wider text-[#E94F2F] bg-[#E94F2F]/10 px-2 py-0.5 rounded-md">Feito em Minas</span>
              </div>
              <p className="text-xs text-[#756B66] mt-0.5">Tudo da sua cidade, pertim de você.</p>
            </div>
          </div>

          {/* Area 2: Location chip & Links */}
          <div className="flex items-center gap-6">
            {selectedCity && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#EADFD8] rounded-full text-xs text-[#201A17] font-medium shadow-2xs">
                <MapPin className="w-3.5 h-3.5 text-[#E94F2F]" />
                <span>{selectedCity.name} — {selectedCity.state}</span>
              </div>
            )}

            <nav aria-label="Links institucionais" className="flex items-center gap-4 text-xs font-bold text-[#756B66]">
              <button onClick={() => setActiveModal('help')} className="hover:text-[#E94F2F] transition-colors cursor-pointer bg-transparent border-none p-0 focus:outline-none focus:underline">Ajuda</button>
              <span className="text-[#EADFD8]">•</span>
              <button onClick={() => setActiveModal('terms')} className="hover:text-[#E94F2F] transition-colors cursor-pointer bg-transparent border-none p-0 focus:outline-none focus:underline">Termos</button>
              <span className="text-[#EADFD8]">•</span>
              <button onClick={() => setActiveModal('privacy')} className="hover:text-[#E94F2F] transition-colors cursor-pointer bg-transparent border-none p-0 focus:outline-none focus:underline">Privacidade</button>
            </nav>
          </div>
        </div>

        {/* DESKTOP BOTTOM LINE */}
        <div className="hidden sm:flex flex-row items-center justify-between text-xs text-[#756B66]">
          <p>&copy; {new Date().getFullYear()} UaiPertim. Todos os direitos reservados. Orgulhosamente de Minas Gerais.</p>
          <button 
            onClick={scrollToTop} 
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-[#F7F4EF] border border-[#EADFD8] rounded-full text-[#201A17] hover:text-[#E94F2F] font-bold text-xs transition-all cursor-pointer active:scale-95 shadow-2xs"
          >
            <span>Voltar ao topo</span>
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
        </div>


        {/* MOBILE LAYOUT (Compact, vertical under 640px) */}
        <div className="flex sm:hidden flex-col gap-4">
          {/* Row 1: Brand & Scroll to Top */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 shrink-0 overflow-hidden rounded-full flex items-center justify-center">
                <img
                  src="/brand/uaipertim-logo-oficial-v2.png"
                  alt="UaiPertim"
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover select-none pointer-events-none scale-[1.02]"
                />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-sm text-[#201A17]">UaiPertim</span>
                  <span className="text-[8px] font-black uppercase tracking-wider text-[#E94F2F] bg-[#E94F2F]/10 px-1.5 py-0.5 rounded-md whitespace-nowrap">Feito em Minas</span>
                </div>
                <span className="block text-[10px] text-[#756B66] -mt-0.5">Tudo da sua cidade, pertim de você.</span>
              </div>
            </div>
            
            <button 
              onClick={scrollToTop} 
              className="flex items-center justify-center p-2 bg-white border border-[#EADFD8] rounded-full text-[#201A17] hover:text-[#E94F2F] cursor-pointer active:scale-95 shadow-2xs"
              aria-label="Voltar ao topo"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Row 2: Location chip */}
          {selectedCity && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-[#EADFD8] rounded-xl text-xs text-[#201A17] font-medium w-fit shadow-2xs">
              <MapPin className="w-3.5 h-3.5 text-[#E94F2F]" />
              <span>{selectedCity.name} — {selectedCity.state}</span>
            </div>
          )}

          {/* Row 3: Links */}
          <nav aria-label="Links institucionais mobile" className="flex items-center gap-3 text-xs font-bold text-[#756B66] pt-1">
            <button onClick={() => setActiveModal('help')} className="hover:text-[#E94F2F] cursor-pointer bg-transparent border-none p-0">Ajuda</button>
            <span className="text-[#EADFD8]">•</span>
            <button onClick={() => setActiveModal('terms')} className="hover:text-[#E94F2F] cursor-pointer bg-transparent border-none p-0">Termos</button>
            <span className="text-[#EADFD8]">•</span>
            <button onClick={() => setActiveModal('privacy')} className="hover:text-[#E94F2F] cursor-pointer bg-transparent border-none p-0">Privacidade</button>
          </nav>

          {/* Row 4: Copyright */}
          <div className="border-t border-[#EADFD8] pt-3 text-[10px] text-[#756B66] space-y-1">
            <p className="whitespace-nowrap">&copy; {new Date().getFullYear()} UaiPertim. · Todos os direitos reservados.</p>
            <p className="whitespace-nowrap">Orgulhosamente de Minas Gerais.</p>
          </div>
        </div>

      </div>

      {/* INSTITUTIONAL INFO MODALS */}
      {activeModal && (
        <InstitutionalModal 
          type={activeModal} 
          onClose={() => setActiveModal(null)} 
        />
      )}
    </footer>
  );
};
