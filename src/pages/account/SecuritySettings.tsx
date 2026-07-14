import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useApp } from '../../context/AppContext';
import { securityService } from '../../services/securityService';
import { Lock, Eye, EyeOff, AlertCircle, ShieldAlert, CheckCircle } from 'lucide-react';

export const SecuritySettings: React.FC = () => {
  const { currentUser, logout } = useAuth();
  const { showToast } = useApp();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!currentUser) return;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    if (newPassword.length < 8) {
      setError('A nova senha deve possuir pelo menos 8 caracteres.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('As novas senhas inseridas não coincidem.');
      return;
    }

    if (currentPassword === newPassword) {
      setError('A nova senha não pode ser idêntica à senha atual.');
      return;
    }

    setIsSubmitting(true);
    try {
      await securityService.changePassword(currentUser, currentPassword, newPassword);
      setSuccess('Sua senha de acesso foi atualizada com sucesso!');
      showToast('Senha alterada com sucesso!', 'success');
      
      // Clear inputs
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err: any) {
      console.error('Password change error:', err);
      setError(err.message || 'Erro ao redefinir senha de acesso. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isGoogleUser = currentUser?.providerData.some((p) => p.providerId === 'google.com');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-[#EADFD8]">
        <Lock className="w-5 h-5 text-[#E94F2F]" />
        <h3 className="font-extrabold text-base text-[#201A17]">Segurança da Conta</h3>
      </div>

      {isGoogleUser ? (
        <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center space-y-3">
          <div className="bg-amber-100 text-amber-700 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="font-extrabold text-sm text-[#201A17]">Logado via Conta Google</p>
            <p className="text-xs text-[#756B66] font-semibold max-w-sm mx-auto leading-relaxed">
              Como seu login é feito utilizando as credenciais externas do Google, você não possui uma senha local na UaiPertim. Qualquer alteração de senha deve ser feita diretamente no seu painel da Conta Google.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-2 text-xs font-semibold">
              <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-start gap-2 text-xs font-semibold">
              <CheckCircle className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <div className="bg-white p-6 rounded-3xl border border-[#EADFD8] shadow-xs space-y-4">
            <h4 className="text-xs font-black text-[#756B66] uppercase tracking-wider">Alterar Senha de Acesso</h4>
            <p className="text-[11px] text-[#756B66] font-semibold leading-relaxed">
              Mantenha seu acesso seguro atualizando sua senha periodicamente. Recomendamos utilizar uma combinação de letras maiúsculas, minúsculas, números e caracteres especiais.
            </p>

            <div className="space-y-4 pt-2">
              {/* Senha Atual */}
              <div className="space-y-1.5">
                <label htmlFor="sec-curr" className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">
                  Senha Atual *
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    id="sec-curr"
                    type={showCurrent ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Sua senha atual"
                    className="w-full pl-10 pr-10 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#756B66] hover:text-[#201A17] transition-colors cursor-pointer"
                  >
                    {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Nova Senha */}
                <div className="space-y-1.5">
                  <label htmlFor="sec-new" className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">
                    Nova Senha *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      id="sec-new"
                      type={showNew ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      className="w-full pl-10 pr-10 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#756B66] hover:text-[#201A17] transition-colors cursor-pointer"
                    >
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirmar Nova Senha */}
                <div className="space-y-1.5">
                  <label htmlFor="sec-conf" className="text-[10px] font-black text-[#756B66] uppercase tracking-wider block">
                    Confirmar Nova Senha *
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      id="sec-conf"
                      type={showConfirm ? 'text' : 'password'}
                      required
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Repita a nova senha"
                      className="w-full pl-10 pr-10 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#756B66] hover:text-[#201A17] transition-colors cursor-pointer"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-3 rounded-xl text-xs font-black text-white bg-[#E94F2F] hover:bg-[#BD351C] transition-all cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isSubmitting ? 'Atualizando Senha...' : 'Atualizar Senha de Acesso'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
