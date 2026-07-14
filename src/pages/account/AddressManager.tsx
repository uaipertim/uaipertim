import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useApp } from '../../context/AppContext';
import { UserAddress } from '../../types/address';
import { addressService } from '../../services/addressService';
import { AddressCard } from '../../components/account/AddressCard';
import { AddressForm } from '../../components/account/AddressForm';
import { MapPin, Plus, AlertTriangle, AlertCircle, X, HelpCircle } from 'lucide-react';

export const AddressManager: React.FC = () => {
  const { currentUser } = useAuth();
  const { showToast } = useApp();

  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form toggles
  const [showForm, setShowForm] = useState(false);
  const [editingAddress, setEditingAddress] = useState<UserAddress | null>(null);

  // Deletion state to choose a new default address
  const [addressToDelete, setAddressToDelete] = useState<UserAddress | null>(null);
  const [newDefaultCandidate, setNewDefaultCandidate] = useState<string>('');

  useEffect(() => {
    loadAddresses();
  }, [currentUser]);

  const loadAddresses = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const list = await addressService.getAddresses(currentUser.uid);
      setAddresses(list);
    } catch (err) {
      console.error('Error loading addresses:', err);
      setError('Não foi possível carregar seus endereços de entrega.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrUpdate = async (addressData: Omit<UserAddress, 'id'>) => {
    if (!currentUser) return;
    try {
      if (editingAddress?.id) {
        // Edit existing
        await addressService.updateAddress(currentUser.uid, editingAddress.id, addressData);
        showToast('Endereço atualizado com sucesso!', 'success');
      } else {
        // Create new
        await addressService.addAddress(currentUser.uid, addressData);
        showToast('Novo endereço cadastrado com sucesso!', 'success');
      }
      setShowForm(false);
      setEditingAddress(null);
      await loadAddresses();
    } catch (err) {
      console.error('Error saving address:', err);
      showToast('Erro ao salvar endereço. Tente novamente.', 'error');
    }
  };

  const handleSetDefault = async (addressId: string) => {
    if (!currentUser) return;
    try {
      await addressService.setDefaultAddress(currentUser.uid, addressId);
      showToast('Endereço padrão atualizado!', 'success');
      await loadAddresses();
    } catch (err) {
      console.error('Error setting default address:', err);
      showToast('Erro ao definir endereço padrão.', 'error');
    }
  };

  const handleTriggerDelete = (address: UserAddress) => {
    setAddressToDelete(address);
    // If it's default and there are other candidates, pick the first other as candidate by default
    const others = addresses.filter((a) => a.id !== address.id);
    if (address.isDefault && others.length > 0) {
      setNewDefaultCandidate(others[0].id || '');
    } else {
      setNewDefaultCandidate('');
    }
  };

  const handleConfirmDelete = async () => {
    if (!currentUser || !addressToDelete || !addressToDelete.id) return;

    try {
      // If we are deleting the default address and there are others, we must promote the selected candidate to default first
      const others = addresses.filter((a) => a.id !== addressToDelete.id);
      
      if (addressToDelete.isDefault && others.length > 0) {
        if (!newDefaultCandidate) {
          showToast('Por favor, selecione qual será o novo endereço padrão.', 'error');
          return;
        }
        // Promote the candidate to default
        await addressService.setDefaultAddress(currentUser.uid, newDefaultCandidate);
      }

      // Delete the target address
      await addressService.deleteAddress(currentUser.uid, addressToDelete.id);
      showToast('Endereço removido com sucesso.', 'success');
      setAddressToDelete(null);
      setNewDefaultCandidate('');
      await loadAddresses();
    } catch (err) {
      console.error('Error deleting address:', err);
      showToast('Não foi possível remover o endereço.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#E94F2F]" />
      </div>
    );
  }

  const otherAddresses = addressToDelete ? addresses.filter((a) => a.id !== addressToDelete.id) : [];

  return (
    <div className="space-y-6">
      {/* Header and Add button */}
      <div className="flex items-center justify-between pb-2 border-b border-[#EADFD8]">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-[#E94F2F]" />
          <h3 className="font-extrabold text-base text-[#201A17]">Meus Endereços de Entrega</h3>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setEditingAddress(null);
              setShowForm(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar Endereço</span>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-2 text-xs font-semibold">
          <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Render form if open */}
      {showForm ? (
        <AddressForm
          initialValues={editingAddress || undefined}
          onSubmit={handleCreateOrUpdate}
          onCancel={() => {
            setShowForm(false);
            setEditingAddress(null);
          }}
          submitButtonText={editingAddress ? 'Atualizar Endereço' : 'Cadastrar Endereço'}
        />
      ) : (
        <>
          {/* List existing addresses */}
          {addresses.length === 0 ? (
            <div className="bg-white p-10 text-center rounded-3xl border border-[#EADFD8] shadow-xs space-y-4">
              <div className="bg-[#F7F4EF] w-12 h-12 rounded-full flex items-center justify-center mx-auto text-[#756B66]">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <p className="font-extrabold text-sm text-[#201A17]">Você ainda não salvou nenhum endereço</p>
                <p className="text-xs text-[#756B66] font-semibold max-w-sm mx-auto leading-relaxed">
                  Cadastre seus locais recorrentes de entrega (casa, trabalho, sítio) para facilitar a finalização dos seus próximos pedidos.
                </p>
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] px-4 py-2.5 rounded-xl transition-all cursor-pointer shadow-sm inline-block"
              >
                Cadastrar meu primeiro endereço
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {addresses.map((addr) => (
                <AddressCard
                  key={addr.id}
                  address={addr}
                  onEdit={() => {
                    setEditingAddress(addr);
                    setShowForm(true);
                  }}
                  onDelete={() => handleTriggerDelete(addr)}
                  onSetDefault={() => addr.id && handleSetDefault(addr.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Deletion Dialog Modal with selecting new default */}
      {addressToDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full border border-[#EADFD8] shadow-2xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-extrabold text-sm text-[#201A17]">Confirmar Exclusão de Endereço</h3>
                <p className="text-xs text-[#756B66] font-semibold leading-relaxed">
                  Tem certeza que deseja remover permanentemente o endereço identificado como <strong className="text-[#201A17]">"{addressToDelete.label}"</strong> ({addressToDelete.street}, {addressToDelete.number})?
                </p>
              </div>
            </div>

            {/* Custom choice of default address if deleting the active default */}
            {addressToDelete.isDefault && otherAddresses.length > 0 && (
              <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-1.5 text-amber-800 text-xs font-black uppercase tracking-wider">
                  <HelpCircle className="w-4.5 h-4.5 text-amber-700" />
                  <span>Definir novo endereço padrão</span>
                </div>
                <p className="text-[11px] text-[#756B66] font-semibold leading-relaxed">
                  Você está excluindo seu endereço padrão atual. Selecione abaixo qual dos outros endereços salvos deverá ser promovido a padrão de entrega:
                </p>

                <div className="space-y-2">
                  {otherAddresses.map((addr) => (
                    <label
                      key={addr.id}
                      className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer bg-white transition-all text-xs font-semibold ${
                        newDefaultCandidate === addr.id
                          ? 'border-[#E94F2F] ring-1 ring-[#E94F2F]'
                          : 'border-[#EADFD8] hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="newDefaultRadio"
                        checked={newDefaultCandidate === addr.id}
                        onChange={() => setNewDefaultCandidate(addr.id || '')}
                        className="mt-0.5 accent-[#E94F2F]"
                      />
                      <div className="space-y-0.5">
                        <span className="font-black text-[#201A17]">{addr.label}</span>
                        <p className="text-[10px] text-gray-500 leading-none">{addr.street}, {addr.number} - {addr.neighborhood}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-[#F7F4EF]">
              <button
                type="button"
                onClick={() => {
                  setAddressToDelete(null);
                  setNewDefaultCandidate('');
                }}
                className="px-4 py-2.5 rounded-xl text-xs font-black text-[#5C534E] hover:bg-[#F7F4EF] transition-all cursor-pointer border border-[#EADFD8] bg-white"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2.5 rounded-xl text-xs font-black text-white bg-rose-600 hover:bg-rose-700 transition-all cursor-pointer shadow-sm"
              >
                Sim, Remover Endereço
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
