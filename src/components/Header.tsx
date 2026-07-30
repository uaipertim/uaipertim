import React from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { RefreshCw, User, Store, ShieldAlert, Wifi, Info, LogIn, MapPin, ShoppingBag, Clipboard, LogOut, Bike, ChevronDown } from 'lucide-react';
import { APP_ENV, ENABLE_DEMO_ROUTE } from '../config';
import { NotificationBell } from './notifications/NotificationBell';
import { NotificationPanel } from './notifications/NotificationPanel';
import { NotificationSoundControl } from './notifications/NotificationSoundControl';

export const Header: React.FC = () => {
  const { 
    environment, 
    setEnvironment, 
    resetDemo, 
    orders, 
    connectionStatus,
    selectedCity,
    setSelectedCity,
    cities,
    cart,
    establishments
  } = useApp();
  const { isAuthenticated, userProfile, logout, loading, currentUser } = useAuth();
  const [path, navigate] = useLocation();
  const [showLogoutConfirm, setShowLogoutConfirm] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  React.useEffect(() => {
    if (!showLogoutConfirm) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowLogoutConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLogoutConfirm]);

  const activeUserOrders = React.useMemo(() => {
    if (!isAuthenticated || !userProfile || userProfile.role !== 'customer' || !currentUser) return [];
    return orders.filter(o => 
      o.customerId === currentUser.uid &&
      !['concluido', 'recusado', 'cancelado'].includes(o.status)
    );
  }, [orders, isAuthenticated, userProfile, currentUser]);

  const firstName = React.useMemo(() => {
    if (!isAuthenticated || loading) return null;
    const nameFromProfile = userProfile?.name;
    if (nameFromProfile && nameFromProfile.trim()) {
      return nameFromProfile.trim().split(/\s+/)[0];
    }
    const nameFromAuth = currentUser?.displayName;
    if (nameFromAuth && nameFromAuth.trim()) {
      return nameFromAuth.trim().split(/\s+/)[0];
    }
    const email = userProfile?.email || currentUser?.email;
    if (email) {
      const prefix = email.split('@')[0];
      if (prefix && prefix.trim()) {
        return prefix.trim();
      }
    }
    return null;
  }, [isAuthenticated, loading, userProfile, currentUser]);

  const showDemoHeader = path === '/demo' && ENABLE_DEMO_ROUTE;
  const activeOrdersCount = orders.filter(o => o.status !== 'concluido' && o.status !== 'recusado').length;

  const handleAccountClick = () => {
    if (!isAuthenticated) {
      navigate('/login');
    } else {
      if (userProfile?.role === 'admin') {
        navigate('/admin');
      } else if (userProfile?.role === 'merchant') {
        navigate('/gestor');
      } else {
        navigate('/minha-conta');
      }
    }
  };

  // If demo route is active and enabled, show the interactive legacy simulation header
  if (showDemoHeader) {
    return (
      <header className="bg-white border-b border-[#EADFD8] sticky top-0 z-50 shadow-sm" id="pede-local-main-header">
        {/* Top Banner Alert - ONLY on DEMO route */}
        <div className="bg-neutral-100 border-b border-[#EADFD8] py-1 px-4 text-[11px] text-[#756B66] flex justify-between items-center animate-fade-in">
          <div className="flex items-center gap-1.5 font-medium">
            <Info className="w-3.5 h-3.5 text-[#756B66]" />
            <span><strong>Modo demonstração:</strong> Apresentação comercial interativa sem taxas reais ou conexões de produção.</span>
          </div>
          <div className="hidden sm:flex items-center gap-3 font-semibold text-[10px]">
            <div className="flex items-center gap-1 text-emerald-600 font-bold">
              <Wifi className="w-3.5 h-3.5" />
              <span>Demonstração sincronizada neste navegador</span>
            </div>
            {connectionStatus && (
              <div className="flex items-center gap-1.5 border-l border-[#EADFD8] pl-3">
                <span className="font-extrabold text-[#756B66] uppercase tracking-wider text-[9px]">Banco de dados:</span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                  connectionStatus.status === 'firebase-connected'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-100 text-rose-800 border border-rose-200'
                }`}>
                  {connectionStatus.status === 'firebase-connected' && 'Firebase DEV conectado'}
                  {connectionStatus.status === 'firebase-unavailable' && 'Firebase indisponível'}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row gap-4 justify-between items-center">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-11 h-11 shrink-0 overflow-hidden rounded-full shadow-xs flex items-center justify-center">
              <img
                src="/brand/uaipertim-logo-oficial-v2.png"
                alt="UaiPertim"
                loading="eager"
                decoding="async"
                className="w-full h-full object-cover select-none pointer-events-none scale-[1.02]"
              />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-[#201A17] tracking-tight flex items-center gap-1.5">
                <span><span className="text-[#E94F2F]">Uai</span>Pertim</span>
                <span className="bg-[#E94F2F]/10 text-[#E94F2F] text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Feito em Minas
                </span>
              </h1>
              <p className="text-xs text-[#756B66]">Tudo da sua cidade, pertim de você</p>
            </div>
          </div>

          {/* Environment Switches */}
          <div className="flex flex-wrap items-center gap-1 bg-[#F7F4EF] p-1.5 rounded-xl border border-[#EADFD8]">
            <button
              onClick={() => setEnvironment('cliente')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                environment === 'cliente'
                  ? 'bg-white text-[#E94F2F] shadow-sm border border-[#EADFD8]'
                  : 'text-[#756B66] hover:text-[#201A17] hover:bg-white/50'
              }`}
            >
              <User className="w-4 h-4" />
              <span>1. Cliente</span>
            </button>

            <button
              onClick={() => setEnvironment('estabelecimento')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-bold transition-all relative ${
                environment === 'estabelecimento'
                  ? 'bg-white text-[#E94F2F] shadow-sm border border-[#EADFD8]'
                  : 'text-[#756B66] hover:text-[#201A17] hover:bg-white/50'
              }`}
            >
              <Store className="w-4 h-4" />
              <span>2. Loja</span>
              {activeOrdersCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#E94F2F] text-white text-[10px] font-black w-4.5 h-4.5 rounded-full flex items-center justify-center border border-white animate-bounce">
                  {activeOrdersCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setEnvironment('administracao')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                environment === 'administracao'
                  ? 'bg-white text-[#E94F2F] shadow-sm border border-[#EADFD8]'
                  : 'text-[#756B66] hover:text-[#201A17] hover:bg-white/50'
              }`}
            >
              <ShieldAlert className="w-4 h-4" />
              <span>3. Admin</span>
            </button>
          </div>

          {/* Control Button Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleAccountClick}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer border ${
                isAuthenticated
                  ? 'bg-orange-50 text-[#E94F2F] border-orange-200 hover:bg-orange-100'
                  : 'bg-[#E94F2F] text-white border-transparent hover:bg-[#BD351C]'
              }`}
            >
              {isAuthenticated ? (
                <>
                  <User className="w-3.5 h-3.5" />
                  <span className="max-w-[100px] truncate">{userProfile?.name || 'Minha Conta'}</span>
                </>
              ) : (
                <>
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Entrar</span>
                </>
              )}
            </button>

            <button
              onClick={() => {
                if (confirm('Esta ação reinicia somente os dados demonstrativos deste navegador. Tem certeza que deseja continuar?')) {
                  resetDemo();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#EADFD8] text-xs font-bold text-[#756B66] hover:text-[#201A17] hover:bg-[#F7F4EF] hover:border-[#BD351C]/40 transition-colors cursor-pointer"
              title="Reiniciar os dados demonstrativos armazenados no localStorage"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Limpar Demo</span>
            </button>
          </div>
        </div>
      </header>
    );
  }

  // Official Two-Line Header (Production & Official User Experience)
  const isCustomerOrVisitor = !isAuthenticated || userProfile?.role === 'customer';

  return (
    <header className="bg-white border-b border-[#EADFD8] sticky top-0 z-50 shadow-xs w-full box-border overflow-x-clip" id="uaipertim-main-header">
      <NotificationPanel />
      {/* Line 1: Top Line */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center border-b border-[#EADFD8]/30 relative w-full box-border">
        {/* Left: Logo & Compact City */}
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-11 h-11 shrink-0 overflow-hidden rounded-full shadow-xs flex items-center justify-center">
              <img
                src="/brand/uaipertim-logo-oficial-v2.png"
                alt="UaiPertim"
                loading="eager"
                decoding="async"
                className="w-full h-full object-cover select-none pointer-events-none scale-[1.02]"
              />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-[#201A17] tracking-tight flex items-center gap-1.5">
                <span><span className="text-[#E94F2F]">Uai</span>Pertim</span>
              </h1>
              <p className="text-[10px] text-[#756B66] font-semibold leading-none mt-0.5">Feito em Minas</p>
            </div>
          </div>

          {/* Compact City Indicator (Only for customer or visitor on wider screens) */}
          {isCustomerOrVisitor && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-extrabold text-[#756B66] bg-[#F7F4EF] px-2.5 py-1 rounded-lg border border-[#EADFD8]">
              <MapPin className="w-3 h-3 text-[#E94F2F]" />
              <span>{selectedCity.name} - {selectedCity.state}</span>
            </span>
          )}
        </div>

        {/* Right: Authentication Area */}
        <div className="flex items-center gap-3 shrink-0">
          {isAuthenticated && userProfile?.role === 'merchant' && (
            <div className="hidden md:flex">
              <NotificationSoundControl />
            </div>
          )}
          {isAuthenticated && (
            <div className="flex items-center gap-2 sm:gap-2.5">
              <NotificationBell />
              {firstName && (
                <div className="md:hidden flex flex-col justify-center text-left select-none" style={{ gap: '2px' }}>
                  <span className="text-sm xs:text-[15px] leading-tight text-[#201A17] font-medium">
                    Olá, <strong className="font-extrabold text-[#E94F2F] max-w-[65px] xs:max-w-[100px] truncate inline-block align-bottom" title={firstName}>{firstName}</strong>
                  </span>
                  <span className="text-[11px] xs:text-xs leading-none text-[#756B66] font-semibold mt-0.5 whitespace-nowrap tracking-wide">
                    Tudo pertim de você
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(true)}
                disabled={isLoggingOut}
                className="md:hidden flex items-center gap-1 px-2 py-1.5 xs:px-2.5 rounded-xl text-xs font-black border border-rose-200/60 text-rose-600 bg-rose-50/50 hover:bg-rose-50 active:scale-95 transition-all cursor-pointer min-h-[36px] select-none focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:opacity-50 disabled:pointer-events-none"
                aria-label="Sair da conta"
              >
                <LogOut className="w-4 h-4 shrink-0 text-[#E94F2F]" />
                <span className="hidden xs:inline">Sair</span>
              </button>
            </div>
          )}
          {loading ? (
            <div className="hidden md:block w-16 h-8 bg-neutral-200/60 animate-pulse rounded-lg" />
          ) : (
            <>
              {/* Visitor (Unauthenticated) */}
              {!isAuthenticated && (
                <button
                  onClick={() => {
                    sessionStorage.removeItem('redirect_after_login');
                    navigate('/login');
                  }}
                  className="hidden md:flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] transition-all cursor-pointer shadow-xs"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Entrar</span>
                </button>
              )}

              {/* Customer Authenticated - Desktop Only */}
              {isAuthenticated && userProfile?.role === 'customer' && (
                <div className="hidden md:flex items-center gap-2.5 sm:gap-3">
                  <span className="text-xs font-black text-[#201A17] hidden sm:inline">
                    Olá, {userProfile.name?.split(' ')[0]}
                  </span>

                  {/* Acompanhar Pedido (Active Orders Only) */}
                  {activeUserOrders.length > 0 && (
                    <button
                      onClick={() => navigate(`/acompanhar-pedido/${activeUserOrders[0].id}`)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border transition-all cursor-pointer shadow-xs ${
                        path.startsWith('/acompanhar-pedido/')
                          ? 'bg-[#E94F2F] text-white border-transparent'
                          : 'bg-orange-50 text-[#E94F2F] border-orange-200 hover:bg-orange-100'
                      }`}
                    >
                      <Bike className={`w-3.5 h-3.5 shrink-0 ${
                        path.startsWith('/acompanhar-pedido/') ? 'text-white' : 'text-[#E94F2F]'
                      }`} />
                      <span>Acompanhar pedido</span>
                    </button>
                  )}

                  <button
                    onClick={() => navigate('/meus-pedidos')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all cursor-pointer ${
                      path === '/meus-pedidos' && !window.location.search.includes('view=timeline') ? 'bg-[#E94F2F] text-white border-transparent' : 'bg-white text-[#756B66] border-[#EADFD8] hover:bg-[#F7F4EF]'
                    }`}
                  >
                    Meus pedidos
                  </button>

                  <button
                    onClick={() => navigate('/minha-conta')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all cursor-pointer ${
                      path === '/minha-conta' ? 'bg-[#E94F2F] text-white border-transparent' : 'bg-white text-[#756B66] border-[#EADFD8] hover:bg-[#F7F4EF]'
                    }`}
                  >
                    Minha conta
                  </button>

                  <button
                    onClick={async () => {
                      try {
                        await logout();
                        navigate('/');
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-black border border-rose-200 text-rose-600 bg-rose-50/30 hover:bg-rose-50 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Sair</span>
                  </button>
                </div>
              )}

              {/* Lojista (Merchant) Authenticated - Desktop Only */}
              {isAuthenticated && userProfile?.role === 'merchant' && (
                <div className="hidden md:flex items-center gap-3">
                  <div className="bg-[#F7F4EF] border border-[#EADFD8] px-3 py-1.5 rounded-lg text-xs font-bold text-[#756B66]">
                    Loja: <span className="text-[#201A17] font-extrabold">{userProfile.establishmentId ? (establishments.find(e => e.id === userProfile.establishmentId)?.name || userProfile.establishmentId) : 'Estabelecimento'}</span>
                  </div>

                  <button
                    onClick={() => navigate('/gestor')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all cursor-pointer ${
                      path === '/gestor' ? 'bg-[#E94F2F] text-white border-transparent' : 'bg-white text-[#756B66] border-[#EADFD8] hover:bg-[#F7F4EF]'
                    }`}
                  >
                    Painel da loja
                  </button>

                  <button
                    onClick={async () => {
                      try {
                        await logout();
                        navigate('/');
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-black border border-rose-200 text-rose-600 bg-rose-50/30 hover:bg-rose-50 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Sair</span>
                  </button>
                </div>
              )}

              {/* Administrador (Admin) Authenticated - Desktop Only */}
              {isAuthenticated && userProfile?.role === 'admin' && (
                <div className="hidden md:flex items-center gap-3">
                  <div className="bg-[#F7F4EF] border border-[#EADFD8] px-3 py-1.5 rounded-lg text-xs font-bold text-[#756B66]">
                    Adm: <span className="text-[#201A17] font-extrabold">{userProfile.name}</span>
                  </div>

                  <button
                    onClick={() => navigate('/admin')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black border transition-all cursor-pointer ${
                      path === '/admin' ? 'bg-[#E94F2F] text-white border-transparent' : 'bg-white text-[#756B66] border-[#EADFD8] hover:bg-[#F7F4EF]'
                    }`}
                  >
                    Painel administrativo
                  </button>

                  <button
                    onClick={async () => {
                      try {
                        await logout();
                        navigate('/');
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-black border border-rose-200 text-rose-600 bg-rose-50/30 hover:bg-rose-50 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <LogOut className="w-3 h-3" />
                    <span>Sair</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Line 2: Bottom Line (visitor or customer only) */}
      {isCustomerOrVisitor && (
        <div className="bg-[#F7F4EF]/50 border-t border-[#EADFD8]/10 animate-fade-in">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex justify-between items-center gap-2">
            {/* Delivery City Info with Custom Invisible native select trigger */}
            <div className="flex items-center gap-2 text-xs min-w-0 flex-1">
              <MapPin className="w-4 h-4 text-[#E94F2F] shrink-0 self-center" />
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5 min-w-0 flex-1">
                <span className="text-[#756B66] font-bold text-[11px] sm:text-xs leading-none shrink-0">
                  Entregar em:
                </span>
                <span 
                  className="font-extrabold text-[#201A17] text-xs sm:text-sm line-clamp-2 md:line-clamp-1 whitespace-normal break-words leading-tight"
                  title={`${selectedCity.name} (${selectedCity.state})`}
                >
                  {selectedCity.name}
                </span>
              </div>
              <div className="relative inline-block ml-2 shrink-0">
                <select
                  value={selectedCity.id}
                  onChange={(e) => {
                    const city = cities.find(c => c.id === e.target.value);
                    if (city) setSelectedCity(city);
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  title="Alterar Cidade"
                  aria-label="Alterar cidade de entrega"
                >
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name} ({city.state})
                    </option>
                  ))}
                </select>
                <span className="text-[#E94F2F] font-black text-xs uppercase tracking-wider hover:underline cursor-pointer select-none">
                  Alterar
                </span>
              </div>
            </div>

            {/* Cart summary button - THE ONLY ONE IN THE HEADER */}
            <button
              onClick={() => {
                navigate('/');
                setTimeout(() => {
                  window.dispatchEvent(new Event('open-cart'));
                }, 50);
              }}
              className="hidden md:flex items-center gap-2 bg-[#E94F2F] hover:bg-[#BD351C] text-white px-3 sm:px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer relative shadow-xs shrink-0"
            >
              <ShoppingBag className="w-4 h-4 text-white shrink-0" />
              <span className="hidden sm:inline">Carrinho</span>
              <span className="bg-[#FFBE5C] text-[#201A17] text-xs font-black px-2 py-0.5 rounded-full leading-none">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showLogoutConfirm && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="logout-modal-title"
          aria-describedby="logout-modal-desc"
        >
          <div className="bg-[#F7F4EF] rounded-2xl border border-[#EADFD8] p-6 max-w-sm w-full shadow-xl animate-scale-up">
            <h3 id="logout-modal-title" className="text-lg font-black text-[#201A17] mb-2">
              Sair da conta?
            </h3>
            <p id="logout-modal-desc" className="text-xs text-[#756B66] font-semibold mb-6">
              Você poderá entrar novamente quando quiser.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                disabled={isLoggingOut}
                className="px-4 py-2 rounded-xl text-xs font-black text-[#756B66] bg-white border border-[#EADFD8] hover:bg-[#F7F4EF] active:scale-95 transition-all cursor-pointer min-h-[38px] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setIsLoggingOut(true);
                    await logout();
                    setShowLogoutConfirm(false);
                    navigate('/');
                  } catch (e) {
                    console.error(e);
                  } finally {
                    setIsLoggingOut(false);
                  }
                }}
                disabled={isLoggingOut}
                className="px-4 py-2 rounded-xl text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] active:scale-95 transition-all cursor-pointer min-h-[38px] flex items-center gap-1.5 justify-center disabled:opacity-50"
              >
                {isLoggingOut ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Saindo...</span>
                  </>
                ) : (
                  <span>Sair</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
