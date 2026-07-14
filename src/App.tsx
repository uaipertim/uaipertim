import React, { useEffect } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './hooks/useAuth';
import { useLocation } from './hooks/useLocation';
import { Header } from './components/Header';
import { ClientArea } from './components/ClientArea';
import { EstablishmentArea } from './components/EstablishmentArea';
import { AdminArea } from './components/AdminArea';
import { ToastContainer } from './components/Toast';
import { Login } from './components/Login';
import { Cadastro } from './components/Cadastro';
import { MyAccount } from './components/MyAccount';
import { OrderTrackingPage } from './components/account/OrderTrackingPage';
import { ProtectedRoute } from './components/ProtectedRoute';

function AppContent() {
  const { environment, setEnvironment } = useApp();
  const [path] = useLocation();

  // Sync environment with active path
  useEffect(() => {
    if (path === '/gestor') {
      setEnvironment('estabelecimento');
    } else if (path === '/admin' || path === '/admin/migracao-catalogo') {
      setEnvironment('administracao');
    } else if (path === '/minha-conta' || path === '/login' || path === '/cadastro' || path === '/meus-pedidos' || path.startsWith('/acompanhar-pedido/')) {
      setEnvironment('cliente');
    }
  }, [path, setEnvironment]);

  return (
    <div className="bg-[#F7F4EF] min-h-screen font-sans">
      <Header />
      <main>
        {path === '/login' && <Login />}
        {path === '/cadastro' && <Cadastro />}
        
        {path === '/minha-conta' && (
          <ProtectedRoute allowedRoles={['customer', 'merchant', 'admin']}>
            <MyAccount />
          </ProtectedRoute>
        )}

        {path === '/meus-pedidos' && (
          <ProtectedRoute allowedRoles={['customer', 'merchant', 'admin']}>
            <MyAccount />
          </ProtectedRoute>
        )}

        {path.startsWith('/acompanhar-pedido/') && (
          <ProtectedRoute allowedRoles={['customer', 'merchant', 'admin']}>
            <OrderTrackingPage />
          </ProtectedRoute>
        )}
        
        {path === '/gestor' && (
          <ProtectedRoute allowedRoles={['merchant', 'admin']}>
            <EstablishmentArea />
          </ProtectedRoute>
        )}
        
        {(path === '/admin' || path === '/admin/migracao-catalogo') && (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminArea />
          </ProtectedRoute>
        )}
        
        {path !== '/login' && path !== '/cadastro' && path !== '/minha-conta' && path !== '/meus-pedidos' && !path.startsWith('/acompanhar-pedido/') && path !== '/gestor' && path !== '/admin' && path !== '/admin/migracao-catalogo' && (
          <>
            {path === '/demo' ? (
              <>
                {environment === 'cliente' && <ClientArea />}
                {environment === 'estabelecimento' && <EstablishmentArea />}
                {environment === 'administracao' && <AdminArea />}
              </>
            ) : (
              <ClientArea />
            )}
          </>
        )}
      </main>
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </AppProvider>
  );
}

