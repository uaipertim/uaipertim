import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { AvatarSelector } from '../../components/account/AvatarSelector';
import { useApp } from '../../context/AppContext';
import { User, Mail, Phone, MapPin, CheckCircle2, AlertCircle } from 'lucide-react';

export const ProfileSettings: React.FC = () => {
  const { userProfile, updateUserProfile } = useAuth();
  const { showToast } = useApp();

  const [name, setName] = useState(userProfile?.name || '');
  const [email] = useState(userProfile?.email || '');
  const [phone, setPhone] = useState(userProfile?.phone || '');
  const [cityId, setCityId] = useState(userProfile?.cityId || 'sao-joao-batista-do-gloria-mg');
  const [avatarType, setAvatarType] = useState<'initials' | 'preset'>(userProfile?.avatarType || 'initials');
  const [avatarKey, setAvatarKey] = useState<string | null>(userProfile?.avatarKey || null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleAvatarChange = (type: 'initials' | 'preset', key: string | null) => {
    setAvatarType(type);
    setAvatarKey(key);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.replace(/\s+/g, ' ').trim();
    if (!trimmedName || trimmedName.length < 3) {
      setError('O nome completo deve conter no mínimo 3 caracteres.');
      return;
    }

    const unmaskedPhone = phone.replace(/\D/g, '');
    if (!phone || unmaskedPhone.length < 10) {
      setError('Por favor, informe um número de telefone válido com DDD (mínimo 10 dígitos).');
      return;
    }

    setIsSubmitting(true);
    try {
      await updateUserProfile({
        name: trimmedName,
        phone,
        cityId,
        avatarType,
        avatarKey,
        avatarUrl: null // Must keep null as per prompt
      });
      showToast('Dados atualizados com sucesso!', 'success');
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setError(err.message || 'Não foi possível salvar suas alterações. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-[#EADFD8]">
        <User className="w-5 h-5 text-[#E94F2F]" />
        <h3 className="font-extrabold text-base text-[#201A17]">Meus Dados</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-2 text-xs font-semibold">
            <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Avatar Component Integration */}
        <AvatarSelector
          name={name || userProfile?.name || 'Cliente'}
          avatarType={avatarType}
          avatarKey={avatarKey}
          onChange={handleAvatarChange}
        />

        {/* Input Fields */}
        <div className="bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-xs space-y-4">
          <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider">Dados Cadastrais</h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nome Completo */}
            <div className="space-y-1.5">
              <label htmlFor="p-name" className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">
                Nome Completo *
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                  <User className="w-4 h-4" />
                </span>
                <input
                  id="p-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                />
              </div>
            </div>

            {/* Telefone */}
            <div className="space-y-1.5">
              <label htmlFor="p-phone" className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">
                Telefone / Celular *
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                  <Phone className="w-4 h-4" />
                </span>
                <input
                  id="p-phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="(35) 99999-9999"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* E-mail (Exibição apenas com aviso) */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">
                E-mail de Cadastro (Inalterável)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  disabled
                  value={email}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-100 bg-gray-50 font-bold text-xs text-gray-400 cursor-not-allowed"
                />
              </div>
              <span className="text-[10px] text-[#756B66] font-semibold block leading-relaxed">
                Por motivos de segurança, a alteração do e-mail de login requer contato com o suporte da plataforma.
              </span>
            </div>

            {/* Cidade Padrão */}
            <div className="space-y-1.5">
              <label htmlFor="p-city" className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">
                Cidade Padrão *
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                  <MapPin className="w-4 h-4" />
                </span>
                <select
                  id="p-city"
                  required
                  value={cityId}
                  onChange={(e) => setCityId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs appearance-none cursor-pointer"
                >
                  <option value="sao-joao-batista-do-gloria-mg">São João Batista do Glória - MG</option>
                  <option value="passos-mg">Passos - MG</option>
                </select>
              </div>
              <span className="text-[10px] text-[#756B66] font-semibold block leading-relaxed">
                Define os estabelecimentos exibidos prioritariamente para você na página inicial.
              </span>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-3 rounded-xl text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] transition-all cursor-pointer shadow-sm disabled:opacity-50"
          >
            {isSubmitting ? 'Salvando Alterações...' : 'Salvar Meus Dados'}
          </button>
        </div>
      </form>
    </div>
  );
};
