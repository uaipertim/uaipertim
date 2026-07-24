import React, { useState, useEffect } from 'react';
import { Bell, BellOff, AlertCircle, ShieldAlert, CheckCircle, Smartphone, RefreshCw, Send } from 'lucide-react';
import { 
  getPushCapability, 
  registerCurrentPushDevice, 
  PushCapability 
} from '../../services/pushNotificationService';
import { auth } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';

interface PushNotificationControlProps {
  variant?: 'header' | 'page';
}

export const PushNotificationControl: React.FC<PushNotificationControlProps> = ({ variant = 'page' }) => {
  const { role } = useAuth();
  const [capability, setCapability] = useState<PushCapability | null>(null);
  const [isActivating, setIsActivating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const checkCapability = async () => {
    setLoading(true);
    try {
      const cap = await getPushCapability();
      setCapability(cap);
    } catch (e) {
      console.error("Error reading push capability", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkCapability();
  }, []);

  const handleEnable = async () => {
    setIsActivating(true);
    setTestResult(null);
    try {
      const token = await registerCurrentPushDevice();
      if (token) {
        // Refresh capabilities
        await checkCapability();
      } else {
        alert("Não foi possível ativar as notificações push. Verifique as permissões de notificação ou chaves VAPID do projeto.");
      }
    } catch (error: any) {
      console.error("Failed to enable push:", error);
      alert(`Falha ao registrar dispositivo: ${error.message || error}`);
    } finally {
      setIsActivating(false);
    }
  };

  const handleTestPush = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const firebaseUser = auth?.currentUser;
      if (!firebaseUser) {
        setTestResult({ success: false, message: "Você precisa estar logado para enviar notificações push." });
        return;
      }
      const apiToken = await firebaseUser.getIdToken();
      const response = await fetch('/api/push/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiToken}`
        }
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        setTestResult({ success: true, message: `Mensagem enviada! Sucesso: ${data.successCount}, Falha: ${data.failureCount}` });
      } else {
        setTestResult({ success: false, message: data.error || "Erro ao disparar teste de push." });
      }
    } catch (e: any) {
      setTestResult({ success: false, message: e.message || "Erro ao conectar com o backend para disparar teste." });
    } finally {
      setIsTesting(false);
    }
  };

  if (loading) {
    if (variant === 'header') return null;
    return (
      <div className="p-4 border rounded-xl bg-white shadow-sm flex items-center justify-center space-x-2 text-gray-500">
        <RefreshCw size={18} className="animate-spin" />
        <span>Analisando suporte a notificações push...</span>
      </div>
    );
  }

  const isSupported = capability?.supported === true;
  const permission = capability?.permission || 'default';
  const reasonCode = capability?.reasonCode;

  // Header quick-enable button (very compact)
  if (variant === 'header') {
    if (reasonCode === 'PUSH_IOS_INSTALL_REQUIRED') return null;
    const isGranted = capability?.permission === 'granted';
    return (
      <button 
        onClick={handleEnable}
        disabled={isGranted || isActivating}
        className={`p-2 rounded-lg transition-all ${
          isGranted 
            ? 'text-green-600 bg-green-50' 
            : 'text-gray-500 hover:text-orange-600 hover:bg-orange-50'
        }`}
        title={isGranted ? "Notificações push ativadas neste dispositivo" : "Ativar notificações push neste dispositivo"}
        aria-label="Ativar notificações push"
      >
        <Bell size={18} className={isActivating ? 'animate-bounce' : ''} />
      </button>
    );
  }

  const isMerchant = role === 'merchant';
  const subtitleText = isMerchant
    ? "Receba alertas de novos pedidos e mensagens dos clientes mesmo em segundo plano."
    : "Receba atualizações dos seus pedidos e novas mensagens mesmo em segundo plano.";

  // If iOS browser mode, return custom visual card immediately
  if (reasonCode === 'PUSH_IOS_INSTALL_REQUIRED') {
    return (
      <div className="p-5 border rounded-2xl bg-white shadow-sm space-y-4 border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex space-x-3">
            <div className="p-2.5 rounded-xl bg-orange-50 text-orange-600 shrink-0">
              <Smartphone size={22} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 leading-tight">Instale o UaiPertim para receber notificações</h3>
              <p className="text-xs text-gray-500 mt-1">
                No iPhone, as notificações ficam disponíveis quando o UaiPertim é adicionado à Tela de Início e aberto pelo novo ícone.
              </p>
            </div>
          </div>
          <button 
            onClick={checkCapability}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition"
            title="Recarregar diagnóstico"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="bg-[#FAF8F5] rounded-xl p-4 border border-[#EADFD8] text-xs space-y-2.5 text-gray-700">
          <p className="font-semibold text-gray-900">Passos para instalação:</p>
          <ol className="list-decimal pl-4 space-y-1.5 leading-relaxed">
            <li>Abra esta página no <strong>Safari</strong>.</li>
            <li>Toque em <strong>Compartilhar</strong> (ícone de quadrado com seta para cima).</li>
            <li>Escolha <strong>“Adicionar à Tela de Início”</strong>.</li>
            <li>Abra o <strong>UaiPertim</strong> pelo ícone criado na sua tela de aplicativos.</li>
            <li>Entre em sua conta e ative as notificações.</li>
          </ol>
        </div>

        {/* Device Info Badges */}
        {capability && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-50 text-[10px]">
            <span className="px-2 py-0.5 rounded bg-gray-50 border border-gray-100 text-gray-600 font-mono capitalize">
              Plataforma: iOS (Navegador)
            </span>
            <span className="px-2 py-0.5 rounded bg-gray-50 border border-gray-100 text-gray-600 font-mono capitalize">
              Modo: Navegador
            </span>
            <span className="px-2 py-0.5 rounded bg-gray-50 border border-gray-100 text-gray-600 font-mono">
              Permissão: {permission}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-5 border rounded-2xl bg-white shadow-sm space-y-4 border-gray-100">
      <div className="flex items-start justify-between">
        <div className="flex space-x-3">
          <div className={`p-2.5 rounded-xl ${isSupported ? 'bg-orange-50 text-orange-600' : 'bg-gray-50 text-gray-400'}`}>
            <Bell size={22} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 leading-tight">Notificações no Dispositivo</h3>
            <p className="text-xs text-gray-500 mt-1">{subtitleText}</p>
          </div>
        </div>
        <button 
          onClick={checkCapability}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-lg transition"
          title="Recarregar diagnóstico"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Diagnostics / Status Alert */}
      {!isSupported ? (
        <div className="p-3.5 rounded-xl text-xs space-y-1 bg-amber-50 text-amber-800 border border-amber-100">
          <div className="flex items-center font-medium space-x-1.5 text-amber-950">
            <ShieldAlert size={15} />
            <span>Notificações Não Disponíveis</span>
          </div>
          {reasonCode === 'PUSH_INSECURE_CONTEXT' && (
            <p>O navegador exige um ambiente seguro (HTTPS ou localhost) para habilitar notificações push.</p>
          )}
          {reasonCode === 'PUSH_NOTIFICATION_API_UNSUPPORTED' && (
            <p>A API de notificações não é suportada por este navegador ou aba do iFrame.</p>
          )}
          {reasonCode === 'PUSH_SERVICE_WORKER_UNSUPPORTED' && (
            <p>Este navegador não suporta Service Workers de segundo plano.</p>
          )}
          {reasonCode === 'PUSH_MANAGER_UNSUPPORTED' && (
            <p>Este navegador não é compatível com o Gerenciador de Push padrão.</p>
          )}
          {reasonCode === 'PUSH_FIREBASE_MESSAGING_UNSUPPORTED' && (
            <p>O Firebase Messaging não pôde ser instanciado neste navegador ou aba.</p>
          )}
          {reasonCode === 'PUSH_PERMISSION_BLOCKED' && (
            <p>As permissões de notificação estão bloqueadas para este site. Acesse as configurações do navegador para desbloquear.</p>
          )}
          {reasonCode === 'PUSH_VAPID_KEY_MISSING' && (
            <p className="font-semibold text-rose-800">
              Chave pública VAPID ausente (VITE_FIREBASE_VAPID_PUBLIC_KEY). Insira o Web Push Certificate do Firebase Console para habilitar.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {permission === 'granted' ? (
            <div className="space-y-3">
              {!capability?.registrationStatus ? (
                // State: Granted but no subscription checked/found
                <div className="p-3.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-100 space-y-2">
                  <div className="flex items-center text-xs font-semibold space-x-1.5 text-amber-950">
                    <AlertCircle size={15} />
                    <span>Nenhum dispositivo registrado neste perfil</span>
                  </div>
                  <p className="text-xs">
                    Nenhum dispositivo registrado para notificações push neste perfil de usuário. Clique abaixo para registrar o dispositivo atual.
                  </p>
                  <button
                    onClick={handleEnable}
                    disabled={isActivating}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-50 flex items-center justify-center space-x-1"
                  >
                    <RefreshCw size={12} className={isActivating ? 'animate-spin' : ''} />
                    <span>Registrar dispositivo</span>
                  </button>
                </div>
              ) : capability.registrationStatus.registeredForAnotherUser ? (
                // State: Registered to another user
                <div className="p-3.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-100 space-y-2">
                  <div className="flex items-center text-xs font-semibold space-x-1.5 text-amber-950">
                    <ShieldAlert size={15} />
                    <span>Registrado em Outro Perfil</span>
                  </div>
                  <p className="text-xs">
                    Este dispositivo está registrado sob outro perfil (possivelmente uma conta de cliente). Clique abaixo para transferir o registro para o perfil de comerciante atual.
                  </p>
                  <button
                    onClick={handleEnable}
                    disabled={isActivating}
                    className="w-full py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-50"
                  >
                    Transferir Registro para este Perfil
                  </button>
                </div>
              ) : capability.registrationStatus.registeredForCurrentUser ? (
                // State: Registered and active for current user!
                <div className="p-3.5 rounded-xl bg-green-50 text-green-800 border border-green-100 space-y-2">
                  <div className="flex items-center text-xs font-semibold space-x-1.5 text-green-950">
                    <CheckCircle size={15} />
                    <span>Dispositivo Registrado e Ativo!</span>
                  </div>
                  <p className="text-xs">
                    Este dispositivo receberá notificações diretamente através do Firebase Cloud Messaging.
                  </p>
                  <div className="text-[10px] text-green-700 font-mono">
                    ID Seguro: {capability.registrationStatus.subscriptionIdMasked}
                  </div>
                  
                  <div className="pt-2 border-t border-green-100 flex items-center justify-between">
                    <button
                      onClick={handleTestPush}
                      disabled={isTesting}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition disabled:opacity-50"
                    >
                      <Send size={12} />
                      <span>{isTesting ? "Enviando..." : "Enviar Notificação de Teste"}</span>
                    </button>
                    <button
                      onClick={handleEnable}
                      disabled={isActivating}
                      className="text-xs text-green-700 hover:text-green-900 underline transition"
                    >
                      Re-registrar dispositivo
                    </button>
                  </div>

                  {testResult && (
                    <div className={`mt-2 p-2 rounded-lg text-[11px] font-medium ${
                      testResult.success ? 'bg-green-100 text-green-900' : 'bg-red-50 text-red-900 border border-red-100'
                    }`}>
                      {testResult.message}
                    </div>
                  )}
                </div>
              ) : (
                // Fallback (enabled is false or other issue)
                <div className="p-3.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-100 space-y-2">
                  <div className="flex items-center text-xs font-semibold space-x-1.5 text-amber-950">
                    <AlertCircle size={15} />
                    <span>Dispositivo Inativo</span>
                  </div>
                  <p className="text-xs">
                    A assinatura deste dispositivo está desativada no servidor.
                  </p>
                  <button
                    onClick={handleEnable}
                    disabled={isActivating}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-medium transition"
                  >
                    Ativar Assinatura
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col space-y-2">
              <button 
                onClick={handleEnable}
                disabled={isActivating}
                className="w-full py-2.5 bg-orange-600 text-white font-medium rounded-xl hover:bg-orange-700 transition disabled:opacity-50 text-sm flex items-center justify-center space-x-2 shadow-sm"
              >
                {isActivating ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    <span>Solicitando permissão...</span>
                  </>
                ) : (
                  <>
                    <Bell size={16} />
                    <span>Ativar Notificações Push</span>
                  </>
                )}
              </button>
              <p className="text-[10px] text-gray-400 text-center">Permissões de notificação do Chrome serão abertas.</p>
            </div>
          )}
        </div>
      )}

      {/* Device Info Badges */}
      {capability && (
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-50 text-[10px]">
          <span className="px-2 py-0.5 rounded bg-gray-50 border border-gray-100 text-gray-600 font-mono capitalize">
            Plataforma: {capability.platform}
          </span>
          <span className="px-2 py-0.5 rounded bg-gray-50 border border-gray-100 text-gray-600 font-mono capitalize">
            Modo: {capability.displayMode}
          </span>
          <span className="px-2 py-0.5 rounded bg-gray-50 border border-gray-100 text-gray-600 font-mono">
            Permissão: {permission}
          </span>
        </div>
      )}
    </div>
  );
};
