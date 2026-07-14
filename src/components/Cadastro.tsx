import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { Eye, EyeOff, ArrowLeft, Mail, Lock, User, Phone, MapPin, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

export const Cadastro: React.FC = () => {
  const { registerCustomer } = useAuth();
  const [, navigate] = useLocation();

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [cityId, setCityId] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Brazilian phone mask helper
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Validation checks
    const trimmedName = name.replace(/\s+/g, ' ').trim();
    if (!trimmedName || trimmedName.length < 3) {
      setError('O nome completo deve conter no mínimo 3 caracteres.');
      return;
    }

    if (!email) {
      setError('Por favor, informe seu e-mail.');
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Por favor, insira um e-mail com formato válido (exemplo@email.com).');
      return;
    }

    const unmaskedPhone = phone.replace(/\D/g, '');
    if (!phone || unmaskedPhone.length < 10) {
      setError('Por favor, informe um número de telefone válido com DDD (mínimo 10 dígitos).');
      return;
    }

    if (!cityId) {
      setError('Selecione uma das cidades atendidas pela UaiPertim.');
      return;
    }

    if (!password || password.length < 8) {
      setError('A senha deve conter no mínimo 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('As senhas inseridas não coincidem.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 2. Call register flow
      await registerCustomer({
        name: trimmedName,
        email: email,
        phone: phone,
        cityId: cityId,
        password: password
      });

      // 3. Post-registration redirect
      navigate('/');
    } catch (err: any) {
      console.error("Registration component error:", err);
      setError(err.message || 'Erro ao efetuar cadastro. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-[#F7F4EF]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full space-y-8 bg-white p-8 rounded-3xl border border-[#EADFD8] shadow-sm relative"
      >
        {/* Back Button to Login Screen */}
        <button
          onClick={() => navigate('/login')}
          className="absolute top-6 left-6 text-[#756B66] hover:text-[#201A17] flex items-center gap-1 text-xs font-bold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar para o Login</span>
        </button>

        <div className="text-center pt-4">
          {/* Logo */}
          <div className="mx-auto bg-[#E94F2F] text-white p-2 rounded-2xl shadow-md flex items-center justify-center font-black tracking-tight text-xl w-12 h-12">
            UP
          </div>
          <h2 className="mt-4 text-2xl font-black text-[#201A17] tracking-tight">
            <span>Crie sua conta</span>
          </h2>
          <p className="mt-1 text-xs text-[#756B66] font-semibold">
            Cadastre-se na UaiPertim e peça dos estabelecimentos locais
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-2 text-xs font-semibold">
              <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* Nome Completo */}
            <div className="space-y-1">
              <label htmlFor="name" className="text-xs font-black text-[#756B66] uppercase tracking-wider block">
                Nome Completo
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                  <User className="w-4 h-4" />
                </span>
                <input
                  id="name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-sm text-[#201A17] transition-all"
                />
              </div>
            </div>

            {/* E-mail */}
            <div className="space-y-1">
              <label htmlFor="email" className="text-xs font-black text-[#756B66] uppercase tracking-wider block">
                E-mail
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-sm text-[#201A17] transition-all"
                />
              </div>
            </div>

            {/* Telefone */}
            <div className="space-y-1">
              <label htmlFor="phone" className="text-xs font-black text-[#756B66] uppercase tracking-wider block">
                Telefone / Celular
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                  <Phone className="w-4 h-4" />
                </span>
                <input
                  id="phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="(35) 99999-9999"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-sm text-[#201A17] transition-all"
                />
              </div>
            </div>

            {/* Cidade */}
            <div className="space-y-1">
              <label htmlFor="cityId" className="text-xs font-black text-[#756B66] uppercase tracking-wider block">
                Cidade Atendida
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                  <MapPin className="w-4 h-4" />
                </span>
                <select
                  id="cityId"
                  required
                  value={cityId}
                  onChange={(e) => setCityId(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-sm text-[#201A17] transition-all appearance-none cursor-pointer"
                >
                  <option value="" disabled>Selecione sua cidade...</option>
                  <option value="sao-joao-batista-do-gloria-mg">São João Batista do Glória - MG</option>
                  <option value="passos-mg">Passos - MG</option>
                </select>
              </div>
            </div>

            {/* Senha */}
            <div className="space-y-1">
              <label htmlFor="password" className="text-xs font-black text-[#756B66] uppercase tracking-wider block">
                Senha (mínimo 8 caracteres)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-sm text-[#201A17] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#756B66] hover:text-[#201A17] transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirmar Senha */}
            <div className="space-y-1">
              <label htmlFor="confirmPassword" className="text-xs font-black text-[#756B66] uppercase tracking-wider block">
                Confirmar Senha
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-sm text-[#201A17] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#756B66] hover:text-[#201A17] transition-colors cursor-pointer"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-black rounded-xl text-white bg-[#E94F2F] hover:bg-[#BD351C] focus:outline-none transition-colors shadow-md shadow-orange-600/10 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Criando Conta...' : 'Criar minha conta'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
