import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useApp } from '../../context/AppContext';
import { Sliders, Bell, Mail, ShoppingBag, Bike, ToggleLeft, ToggleRight, CheckSquare, Square, AlertCircle } from 'lucide-react';
import { PushNotificationControl } from '../../components/notifications/PushNotificationControl';

export const PreferencesSettings: React.FC = () => {
  const { userProfile, updateUserProfile } = useAuth();
  const { showToast } = useApp();

  const [orderUpdates, setOrderUpdates] = useState(userProfile?.preferences?.orderUpdates ?? true);
  const [marketing, setMarketing] = useState(userProfile?.preferences?.marketing ?? false);
  const [preferredFulfillment, setPreferredFulfillment] = useState<'delivery' | 'pickup' | null>(
    userProfile?.preferences?.preferredFulfillment ?? null
  );
  const [confirmCartClear, setConfirmCartClear] = useState(userProfile?.preferences?.confirmCartClear ?? true);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setIsSaving(true);
    try {
      await updateUserProfile({
        preferences: {
          orderUpdates,
          marketing,
          preferredFulfillment,
          confirmCartClear
        }
      });
      showToast('Preferências atualizadas!', 'success');
    } catch (err: any) {
      console.error('Error saving preferences:', err);
      setError('Erro ao salvar preferências. Tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-[#EADFD8]">
        <Sliders className="w-5 h-5 text-[#E94F2F]" />
        <h3 className="font-extrabold text-base text-[#201A17]">Minhas Preferências</h3>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-2 text-xs font-semibold">
          <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Push Notification Integration */}
      <PushNotificationControl variant="page" />

      <div className="bg-white rounded-3xl border border-[#EADFD8] shadow-xs divide-y divide-[#F7F4EF]">
        {/* Notifications Preference */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="bg-orange-100/50 text-[#E94F2F] p-2 rounded-xl shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-extrabold text-[#201A17]">Alertas E-mail</h4>
              <p className="text-[11px] text-[#756B66] font-semibold leading-relaxed">
                Escolha como deseja receber as atualizações sobre o andamento e a entrega dos seus pedidos via e-mail.
              </p>
            </div>
          </div>

          <div className="space-y-3.5 pl-11.5">
            {/* Order Updates */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <button
                type="button"
                onClick={() => setOrderUpdates(!orderUpdates)}
                className="text-[#E94F2F] hover:text-[#BD351C] transition-colors shrink-0 pt-0.5"
              >
                {orderUpdates ? <CheckSquare className="w-4.5 h-4.5" /> : <Square className="w-4.5 h-4.5 text-[#EADFD8]" />}
              </button>
              <div className="space-y-0.5 select-none">
                <span className="text-xs font-black text-[#201A17] group-hover:text-[#E94F2F] transition-colors">Alertas em tempo real</span>
                <p className="text-[10px] text-[#756B66] font-medium leading-normal">
                  Desejo receber mensagens automatizadas e notificações no e-mail com a mudança de status do meu pedido.
                </p>
              </div>
            </label>

            {/* Marketing / Promos */}
            <label className="flex items-start gap-3 cursor-pointer group">
              <button
                type="button"
                onClick={() => setMarketing(!marketing)}
                className="text-[#E94F2F] hover:text-[#BD351C] transition-colors shrink-0 pt-0.5"
              >
                {marketing ? <CheckSquare className="w-4.5 h-4.5" /> : <Square className="w-4.5 h-4.5 text-[#EADFD8]" />}
              </button>
              <div className="space-y-0.5 select-none">
                <span className="text-xs font-black text-[#201A17] group-hover:text-[#E94F2F] transition-colors">Novidades e Promoções</span>
                <p className="text-[10px] text-[#756B66] font-medium leading-normal">
                  Aceito receber informativos periódicos sobre novos estabelecimentos na minha cidade, cupons de desconto sazonais e prêmios.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Fulfillment Preferences */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="bg-orange-100/50 text-[#E94F2F] p-2 rounded-xl shrink-0">
              <Bike className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-extrabold text-[#201A17]">Modalidade de Entrega Preferida</h4>
              <p className="text-[11px] text-[#756B66] font-semibold leading-relaxed">
                Sua modalidade favorita será selecionada por padrão ao prosseguir para a tela de finalização de compras.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pl-11.5">
            <button
              type="button"
              onClick={() => setPreferredFulfillment('delivery')}
              className={`px-3 py-2.5 rounded-xl border font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                preferredFulfillment === 'delivery'
                  ? 'bg-[#E94F2F] border-transparent text-white'
                  : 'bg-white border-[#EADFD8] text-[#5C534E] hover:bg-[#F7F4EF]'
              }`}
            >
              <Bike className="w-4 h-4" />
              <span>Entrega em Casa</span>
            </button>
            <button
              type="button"
              onClick={() => setPreferredFulfillment('pickup')}
              className={`px-3 py-2.5 rounded-xl border font-black text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                preferredFulfillment === 'pickup'
                  ? 'bg-[#E94F2F] border-transparent text-white'
                  : 'bg-white border-[#EADFD8] text-[#5C534E] hover:bg-[#F7F4EF]'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Retirada no Balcão</span>
            </button>
            <button
              type="button"
              onClick={() => setPreferredFulfillment(null)}
              className={`px-3 py-2.5 rounded-xl border font-black text-xs transition-all cursor-pointer ${
                preferredFulfillment === null
                  ? 'bg-[#E94F2F] border-transparent text-white'
                  : 'bg-white border-[#EADFD8] text-[#5C534E] hover:bg-[#F7F4EF]'
              }`}
            >
              Sem Preferência
            </button>
          </div>
        </div>

        {/* Shopping Preferences */}
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="bg-orange-100/50 text-[#E94F2F] p-2 rounded-xl shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-extrabold text-[#201A17]">Regras de Navegação e Carrinho</h4>
              <p className="text-[11px] text-[#756B66] font-semibold leading-relaxed">
                Controle o comportamento de segurança ao consultar pratos e produtos de múltiplos locais.
              </p>
            </div>
          </div>

          <div className="space-y-3.5 pl-11.5">
            <label className="flex items-start gap-3 cursor-pointer group">
              <button
                type="button"
                onClick={() => setConfirmCartClear(!confirmCartClear)}
                className="text-[#E94F2F] hover:text-[#BD351C] transition-colors shrink-0 pt-0.5"
              >
                {confirmCartClear ? <CheckSquare className="w-4.5 h-4.5" /> : <Square className="w-4.5 h-4.5 text-[#EADFD8]" />}
              </button>
              <div className="space-y-0.5 select-none">
                <span className="text-xs font-black text-[#201A17] group-hover:text-[#E94F2F] transition-colors">Alertar ao esvaziar carrinho</span>
                <p className="text-[10px] text-[#756B66] font-medium leading-normal">
                  Exibir caixa de confirmação caso eu adicione um item de outro estabelecimento, forçando a limpeza do carrinho atual.
                </p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-3 rounded-xl text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] transition-all cursor-pointer shadow-sm disabled:opacity-50"
        >
          {isSaving ? 'Salvando Preferências...' : 'Salvar Preferências'}
        </button>
      </div>
    </div>
  );
};
