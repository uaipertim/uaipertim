import React, { useState, useEffect } from 'react';
import { UserAddress } from '../../types/address';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../hooks/useAuth';
import { AlertCircle, Loader2, MapPin } from 'lucide-react';

interface AddressFormProps {
  initialValues?: Partial<UserAddress>;
  onSubmit: (address: Omit<UserAddress, 'id'>) => Promise<void>;
  onCancel: () => void;
  submitButtonText?: string;
}

export const AddressForm: React.FC<AddressFormProps> = ({
  initialValues,
  onSubmit,
  onCancel,
  submitButtonText = 'Salvar Endereço'
}) => {
  const { neighborhoods } = useApp();
  const { userProfile } = useAuth();

  const [label, setLabel] = useState<'Casa' | 'Trabalho' | 'Outro'>(initialValues?.label || 'Casa');
  const [recipientName, setRecipientName] = useState(initialValues?.recipientName || userProfile?.name || '');
  const [phone, setPhone] = useState(initialValues?.phone || userProfile?.phone || '');
  const [zipCode, setZipCode] = useState(initialValues?.zipCode || '');
  const [street, setStreet] = useState(initialValues?.street || '');
  const [number, setNumber] = useState(initialValues?.number || '');
  const [complement, setComplement] = useState(initialValues?.complement || '');
  const [neighborhood, setNeighborhood] = useState(initialValues?.neighborhood || (neighborhoods[0]?.name || ''));
  const [cityId, setCityId] = useState<'sao-joao-batista-do-gloria-mg' | 'passos-mg'>(
    (initialValues?.cityId as any) || (userProfile?.cityId as any) || 'sao-joao-batista-do-gloria-mg'
  );
  const [reference, setReference] = useState(initialValues?.reference || '');
  const [isDefault, setIsDefault] = useState(initialValues?.isDefault || false);

  const [isSearchingCEP, setIsSearchingCEP] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auto-set neighborhood if list loads and field is empty
  useEffect(() => {
    if (neighborhoods.length > 0 && !neighborhood) {
      setNeighborhood(neighborhoods[0].name);
    }
  }, [neighborhoods, neighborhood]);

  // Brazilian Phone Mask
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    
    if (value.length > 10) {
      value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
    } else if (value.length > 6) {
      value = `(${value.slice(0, 2)}) ${value.slice(2, 6)}-${value.slice(6)}`;
    } else if (value.length > 2) {
      value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
    } else if (value.length > 0) {
      value = `(${value}`;
    }
    setPhone(value);
  };

  // Brazilian CEP Mask & Auto lookup
  const handleZipCodeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 8) value = value.slice(0, 8);
    
    if (value.length > 5) {
      value = `${value.slice(0, 5)}-${value.slice(5)}`;
    }
    setZipCode(value);

    // If CEP is complete (8 digits), trigger ViaCEP search
    const cleanCEP = value.replace(/\D/g, '');
    if (cleanCEP.length === 8) {
      setIsSearchingCEP(true);
      setCepError(null);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`);
        if (!response.ok) throw new Error('CEP não encontrado.');
        const data = await response.json();
        
        if (data.erro) {
          setCepError('CEP inválido ou não encontrado.');
        } else {
          // Fill street
          if (data.logradouro) setStreet(data.logradouro);
          
          // Autofill matching neighborhood if found in our valid neighborhoods
          if (data.bairro) {
            const matched = neighborhoods.find(
              (n) => n.name.toLowerCase().trim() === data.bairro.toLowerCase().trim()
            );
            if (matched) {
              setNeighborhood(matched.name);
            } else {
              // Try partial match or just keep first neighborhood but show a gentle warning
              const fallbackMatched = neighborhoods.find(
                (n) => data.bairro.toLowerCase().includes(n.name.toLowerCase()) || n.name.toLowerCase().includes(data.bairro.toLowerCase())
              );
              if (fallbackMatched) {
                setNeighborhood(fallbackMatched.name);
              }
            }
          }

          // Force corresponding city
          if (data.localidade) {
            const isPassos = data.localidade.toLowerCase().includes('passos');
            const isGloria = data.localidade.toLowerCase().includes('gloria') || data.localidade.toLowerCase().includes('glória');
            if (isPassos) {
              setCityId('passos-mg');
            } else if (isGloria) {
              setCityId('sao-joao-batista-do-gloria-mg');
            }
          }
        }
      } catch (err) {
        console.error('Error fetching ViaCEP:', err);
        setCepError('Não foi possível carregar dados do CEP automaticamente.');
      } finally {
        setIsSearchingCEP(false);
      }
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Form validations
    if (!recipientName.trim()) {
      setFormError('Nome do destinatário é obrigatório.');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setFormError('Informe um telefone válido de contato (DDD + número).');
      return;
    }
    const cleanCEP = zipCode.replace(/\D/g, '');
    if (cleanCEP.length !== 8) {
      setFormError('Informe um CEP válido com 8 dígitos.');
      return;
    }
    if (!street.trim()) {
      setFormError('O nome da rua é obrigatório.');
      return;
    }
    if (!number.trim()) {
      setFormError('O número da residência é obrigatório.');
      return;
    }
    if (!neighborhood) {
      setFormError('Selecione um bairro válido para entrega.');
      return;
    }

    setIsSubmitting(true);
    const cityName = cityId === 'sao-joao-batista-do-gloria-mg' ? 'São João Batista do Glória' : 'Passos';

    try {
      await onSubmit({
        label,
        recipientName: recipientName.trim(),
        phone,
        zipCode,
        street: street.trim(),
        number: number.trim(),
        complement: complement.trim() || undefined,
        neighborhood,
        cityId,
        cityName,
        state: 'MG',
        reference: reference.trim() || undefined,
        isDefault
      });
    } catch (err: any) {
      console.error('Error submitting address:', err);
      setFormError(err.message || 'Erro ao salvar endereço. Verifique os dados.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUseMyData = () => {
    if (userProfile) {
      setRecipientName(userProfile.name);
      if (userProfile.phone) {
        setPhone(userProfile.phone);
      }
    }
  };

  return (
    <form onSubmit={handleFormSubmit} className="space-y-5 bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-xs">
      <div className="flex items-center gap-2 pb-2 border-b border-[#F7F4EF]">
        <MapPin className="w-5 h-5 text-[#E94F2F]" />
        <h3 className="font-extrabold text-sm text-[#201A17]">
          {initialValues?.id ? 'Editar Endereço' : 'Cadastrar Novo Endereço'}
        </h3>
      </div>

      {formError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-2 text-xs font-semibold">
          <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
          <span>{formError}</span>
        </div>
      )}

      {/* Label selector */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">Identificador do Endereço</label>
        <div className="flex gap-2">
          {(['Casa', 'Trabalho', 'Outro'] as const).map((lbl) => (
            <button
              key={lbl}
              type="button"
              onClick={() => setLabel(lbl)}
              className={`px-4 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                label === lbl
                  ? 'bg-[#E94F2F] text-white border-[#E94F2F]'
                  : 'bg-white text-[#5C534E] border-[#EADFD8] hover:bg-[#F7F4EF]'
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-[#F7F4EF]" />

      {/* Recipient info & Quick Fill */}
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Informações do Destinatário</h4>
          {userProfile && (
            <button
              type="button"
              onClick={handleUseMyData}
              className="text-[10px] font-black text-[#E94F2F] hover:text-[#BD351C] transition-colors cursor-pointer uppercase"
            >
              Usar meus dados de cadastro
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-[#756B66] uppercase block">Nome do Destinatário *</label>
            <input
              type="text"
              required
              placeholder="Ex: Amanda Silva"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-[#756B66] uppercase block">Telefone de Contato *</label>
            <input
              type="tel"
              required
              placeholder="Ex: (35) 99876-5432"
              value={phone}
              onChange={handlePhoneChange}
              className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
            />
          </div>
        </div>
      </div>

      <div className="h-px bg-[#F7F4EF]" />

      {/* Address particulars */}
      <div className="space-y-4">
        <h4 className="text-[10px] font-black text-[#756B66] uppercase tracking-wider">Dados da Entrega</h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-[#756B66] uppercase flex items-center justify-between">
              <span>CEP *</span>
              {isSearchingCEP && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E94F2F]" />}
            </label>
            <input
              type="text"
              required
              placeholder="Ex: 37940-000"
              value={zipCode}
              onChange={handleZipCodeChange}
              className={`w-full text-xs p-3 rounded-xl border outline-none bg-white font-bold ${
                cepError ? 'border-rose-400 focus:border-rose-500' : 'border-[#EADFD8] focus:border-[#E94F2F]/50'
              }`}
            />
            {cepError && <span className="text-[10px] text-rose-600 font-bold block">{cepError}</span>}
          </div>

          <div className="col-span-2 space-y-1.5">
            <label className="text-[10px] font-black text-[#756B66] uppercase block">Logradouro / Rua *</label>
            <input
              type="text"
              required
              placeholder="Ex: Rua Benedito de Souza"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-[#756B66] uppercase block">Número *</label>
            <input
              type="text"
              required
              placeholder="Ex: 125 ou S/N"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
            />
          </div>

          <div className="space-y-1.5 col-span-1 sm:col-span-2">
            <label className="text-[10px] font-black text-[#756B66] uppercase block">Complemento (Opcional)</label>
            <input
              type="text"
              placeholder="Ex: Ap 203, Bloco A"
              value={complement}
              onChange={(e) => setComplement(e.target.value)}
              className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-[#756B66] uppercase block">Bairro *</label>
            <select
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold appearance-none cursor-pointer"
            >
              {neighborhoods.map((n) => (
                <option key={n.id} value={n.name}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-[#756B66] uppercase block">Cidade *</label>
            <select
              value={cityId}
              onChange={(e) => setCityId(e.target.value as any)}
              className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold appearance-none cursor-pointer"
            >
              <option value="sao-joao-batista-do-gloria-mg">São João Batista do Glória - MG</option>
              <option value="passos-mg">Passos - MG</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-[#756B66] uppercase block">Estado *</label>
            <input
              type="text"
              disabled
              value="MG"
              className="w-full text-xs p-3 rounded-xl border border-gray-100 bg-gray-50 font-bold text-gray-400"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-black text-[#756B66] uppercase block">Ponto de Referência (Opcional)</label>
          <input
            type="text"
            placeholder="Ex: Próximo à praça central ou de frente ao mercado"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full text-xs p-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold"
          />
        </div>
      </div>

      {/* Default Checkbox */}
      <div className="flex items-center gap-2 pt-2">
        <input
          id="isDefault"
          type="checkbox"
          checked={isDefault}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="w-4 h-4 text-[#E94F2F] border-[#EADFD8] rounded-sm focus:ring-[#E94F2F]/50 accent-[#E94F2F]"
        />
        <label htmlFor="isDefault" className="text-xs font-bold text-[#5C534E] select-none cursor-pointer">
          Definir como meu endereço padrão de entregas
        </label>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-3 border-t border-[#F7F4EF]">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-4 py-2.5 rounded-xl text-xs font-black text-[#5C534E] hover:bg-[#F7F4EF] transition-all cursor-pointer border border-[#EADFD8] bg-white"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] transition-all cursor-pointer shadow-sm disabled:opacity-50"
        >
          {isSubmitting ? 'Salvando...' : submitButtonText}
        </button>
      </div>
    </form>
  );
};
