import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { Eye, EyeOff, ArrowLeft, Mail, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const Login: React.FC = () => {
  const { login, resetPassword, isAuthenticated, userProfile, loading } = useAuth();
  const [, navigate] = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Forgot password states
  const [isForgotMode, setIsForgotMode] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated && userProfile) {
      if (userProfile.role === 'admin') {
        navigate('/admin');
      } else if (userProfile.role === 'merchant') {
        navigate('/gestor');
      } else {
        const redirectPath = sessionStorage.getItem('redirect_after_login');
        sessionStorage.removeItem('redirect_after_login');
        if (redirectPath && userProfile.role === 'customer') {
          navigate(redirectPath);
        } else {
          navigate('/');
        }
      }
    }
  }, [isAuthenticated, userProfile, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!email || !password) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await login(email, password);
    } catch (err: any) {
      console.error("Login component error:", err);
      setPassword(''); // Clear password field on error as per requirements
      setError(err.message || 'Erro ao efetuar login. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) {
      setForgotError('Por favor, digite seu e-mail.');
      return;
    }

    setIsSubmitting(true);
    setForgotError(null);
    setForgotSuccess(null);

    try {
      await resetPassword(forgotEmail);
      setForgotSuccess('Caso exista uma conta com esse e-mail, enviaremos as instruções de recuperação.');
    } catch (err: any) {
      console.error("Forgot password error:", err);
      // Even if user-not-found, we want to be safe and handle it nicely
      setForgotError(err.message || 'Erro ao enviar e-mail de recuperação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center bg-[#F7F4EF]">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-4 border-[#E94F2F] border-t-transparent rounded-full animate-spin mx-auto" id="login-spinner"></div>
          <p className="text-xs font-semibold text-[#756B66]">Carregando sessão...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8 bg-[#F7F4EF]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="max-w-md w-full space-y-8 bg-white p-8 rounded-3xl border border-[#EADFD8] shadow-sm relative"
      >
        {/* Back Button to Public Area */}
        <button
          onClick={() => navigate('/')}
          className="absolute top-6 left-6 text-[#756B66] hover:text-[#201A17] flex items-center gap-1 text-xs font-bold transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Voltar</span>
        </button>

        <div className="text-center pt-4">
          {/* Logo */}
          <div className="mx-auto bg-[#E94F2F] text-white p-2 rounded-2xl shadow-md flex items-center justify-center font-black tracking-tight text-xl w-12 h-12">
            UP
          </div>
          <h2 className="mt-4 text-2xl font-black text-[#201A17] tracking-tight">
            <span>Uai</span><span className="text-[#E94F2F]">Pertim</span>
          </h2>
          <p className="mt-1 text-xs text-[#756B66] font-semibold">
            Tudo da sua cidade, pertim de você
          </p>
        </div>

        <AnimatePresence mode="wait">
          {!isForgotMode ? (
            <motion.form 
              key="login-form"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              onSubmit={handleSubmit} 
              className="mt-8 space-y-6"
            >
              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-2 text-xs font-semibold">
                  <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div className="space-y-4">
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
                      name="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-sm text-[#201A17] transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label htmlFor="password" className="text-xs font-black text-[#756B66] uppercase tracking-wider block">
                    Senha
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                      <Lock className="w-4 h-4" />
                    </span>
                    <input
                      id="password"
                      name="password"
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
              </div>

              <div className="flex items-center justify-between text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotMode(true);
                    setForgotError(null);
                    setForgotSuccess(null);
                    setError(null);
                  }}
                  className="text-[#E94F2F] hover:text-[#BD351C] transition-colors cursor-pointer"
                >
                  Esqueci minha senha
                </button>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-black rounded-xl text-white bg-[#E94F2F] hover:bg-[#BD351C] focus:outline-none transition-colors shadow-md shadow-orange-600/10 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Acessando...' : 'Entrar na Conta'}
                </button>
              </div>

              <div className="pt-4 border-t border-[#EADFD8] text-center space-y-3">
                <p className="text-xs text-[#756B66] font-bold">
                  Ainda não tem uma conta?
                </p>
                <button
                  type="button"
                  onClick={() => navigate('/cadastro')}
                  className="w-full flex justify-center py-3 px-4 border border-[#EADFD8] text-xs font-black rounded-xl text-[#201A17] bg-white hover:bg-[#F7F4EF] focus:outline-none transition-colors cursor-pointer"
                >
                  Criar minha conta
                </button>
              </div>

              {/* Guia de Acesso para Testes */}
              <div className="hidden mt-4 p-4 rounded-2xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs space-y-2 text-left">
                <p className="font-extrabold text-amber-800 flex items-center gap-1.5 uppercase tracking-wider text-[10px]">
                  <span>💡 Guia de Acesso UaiPertim</span>
                </p>
                <p className="font-semibold leading-relaxed text-amber-850">
                  Esta aplicação utiliza <strong>autenticação real do Firebase</strong> integrada ao Firestore:
                </p>
                <ul className="list-disc pl-4 space-y-1 font-semibold text-amber-850">
                  <li>
                    <strong>Como Cliente (Customer):</strong> Clique em <span className="text-[#E94F2F] hover:underline cursor-pointer" onClick={() => navigate('/cadastro')}>Criar minha conta</span> para criar um perfil de testes com seu e-mail e senha e acessar imediatamente.
                  </li>
                  <li>
                    <strong>Como Estabelecimento (Merchant):</strong> Crie uma conta de cliente normalmente e altere o campo <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-[11px] text-amber-950">role</code> para <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-[11px] text-amber-950">"merchant"</code> e configure <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-[11px] text-amber-950">establishmentId</code> no documento do usuário (coleção <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-[11px] text-amber-950">users</code>) no Console do Firebase.
                  </li>
                </ul>
              </div>
            </motion.form>
          ) : (
            <motion.form 
              key="forgot-form"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              onSubmit={handleForgotPassword} 
              className="mt-8 space-y-6"
            >
              {forgotError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start gap-2 text-xs font-semibold">
                  <AlertCircle className="w-4.5 h-4.5 text-rose-600 shrink-0 mt-0.5" />
                  <span>{forgotError}</span>
                </div>
              )}

              {forgotSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-start gap-2 text-xs font-semibold">
                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
                  <span>{forgotSuccess}</span>
                </div>
              )}

              <div className="space-y-4">
                <p className="text-xs text-[#756B66] font-semibold leading-relaxed">
                  Digite seu e-mail cadastrado para receber as instruções e o link para redefinir sua senha de acesso.
                </p>
                
                <div className="space-y-1">
                  <label htmlFor="forgot-email" className="text-xs font-black text-[#756B66] uppercase tracking-wider block">
                    E-mail
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#756B66]">
                      <Mail className="w-4 h-4" />
                    </span>
                    <input
                      id="forgot-email"
                      type="email"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      placeholder="seu@email.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-[#EADFD8] outline-none focus:border-[#E94F2F]/50 bg-white font-bold text-sm text-[#201A17] transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotMode(false);
                    setForgotError(null);
                    setForgotSuccess(null);
                    setError(null);
                  }}
                  className="text-[#756B66] hover:text-[#201A17] transition-colors cursor-pointer"
                >
                  Voltar para o Login
                </button>
              </div>

              <div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="group relative w-full flex justify-center py-3.5 px-4 border border-transparent text-sm font-black rounded-xl text-white bg-[#E94F2F] hover:bg-[#BD351C] focus:outline-none transition-colors shadow-md shadow-orange-600/10 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Enviando...' : 'Enviar Instruções'}
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
