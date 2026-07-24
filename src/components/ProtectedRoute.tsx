import React, { useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useLocation } from '../hooks/useLocation';
import { useApp } from '../context/AppContext';
import { UserRole } from '../types/auth';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { currentUser, userProfile, loading, isAuthenticated } = useAuth();
  const [path, navigate] = useLocation();
  const { showToast } = useApp();

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      if (path === '/meus-pedidos' || path === '/minha-conta' || path.startsWith('/acompanhar-pedido/')) {
        sessionStorage.setItem('redirect_after_login', path);
      }
      showToast('Por favor, efetue o login para acessar esta página.', 'info');
      navigate('/login');
      return;
    }

    if (allowedRoles && userProfile) {
      const hasRole = allowedRoles.includes(userProfile.role);
      if (!hasRole) {
        // Access Denied! Redirect rules based on role and path:
        if (userProfile.role === 'customer') {
          if (path === '/admin') {
            showToast('Você não possui permissão para acessar esta área.', 'error');
          } else {
            showToast('Acesso negado. Esta área é restrita.', 'error');
          }
          navigate('/');
        } else if (userProfile.role === 'merchant') {
          if (path === '/admin') {
            showToast('Acesso negado. Esta área é restrita a administradores.', 'error');
            navigate('/gestor');
          } else {
            showToast('Acesso negado para o seu nível de permissão.', 'error');
            navigate('/gestor');
          }
        } else {
          showToast('Acesso negado para o seu nível de permissão.', 'error');
          navigate('/');
        }
      }
    }
  }, [isAuthenticated, userProfile, loading, allowedRoles, navigate, showToast]);

  if (loading) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center bg-[#F7F4EF] gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#E94F2F]" />
        <p className="text-xs text-[#756B66] font-bold">Verificando credenciais...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (allowedRoles && userProfile && !allowedRoles.includes(userProfile.role)) {
    return null;
  }

  return <>{children}</>;
};

interface RoleRouteProps {
  children: React.ReactNode;
  role: UserRole;
}

export const RoleRoute: React.FC<RoleRouteProps> = ({ children, role }) => {
  return <ProtectedRoute allowedRoles={[role]}>{children}</ProtectedRoute>;
};
