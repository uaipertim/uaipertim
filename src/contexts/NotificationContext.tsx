import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { AppNotification } from '../types/notification';
import { 
  subscribeToNotifications, 
  subscribeToUnreadNotificationCount, 
  markNotificationAsRead, 
  markAllNotificationsAsRead 
} from '../services/notificationService';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  panelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, role, establishmentId, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState<boolean>(false);

  useEffect(() => {
    if (authLoading) return;
    if (!currentUser || !role) {
      setNotifications([]);
      setUnreadCount(0);
      setLoading(false);
      return;
    }

    const recipientRole = role === 'merchant' ? 'merchant' : 'customer';
    const recipientId = role === 'merchant' ? (establishmentId || '') : currentUser.uid;

    if (!recipientId) return;

    setLoading(true);
    const unsubNotifications = subscribeToNotifications(
      recipientRole,
      recipientId,
      (n) => {
        setNotifications(n);
        setLoading(false);
      },
      (e) => {
        setError(e.message);
        setLoading(false);
      }
    );

    const unsubCount = subscribeToUnreadNotificationCount(
      recipientRole,
      recipientId,
      (count) => {
        setUnreadCount(count);
      },
      (e) => {
        console.error(e);
      }
    );

    return () => {
      unsubNotifications();
      unsubCount();
    };
  }, [currentUser, role, establishmentId, authLoading]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!currentUser || !role) return;
    const recipientRole = role === 'merchant' ? 'merchant' : 'customer';
    const recipientId = role === 'merchant' ? (establishmentId || '') : currentUser.uid;
    await markNotificationAsRead(recipientRole, recipientId, notificationId);
  }, [currentUser, role, establishmentId]);

  const markAllAsRead = useCallback(async () => {
    if (!currentUser || !role) return;
    const recipientRole = role === 'merchant' ? 'merchant' : 'customer';
    const recipientId = role === 'merchant' ? (establishmentId || '') : currentUser.uid;
    await markAllNotificationsAsRead(recipientRole, recipientId);
  }, [currentUser, role, establishmentId]);

  return (
    <NotificationContext.Provider value={{
      notifications,
      unreadCount,
      loading,
      error,
      markAsRead,
      markAllAsRead,
      panelOpen,
      openPanel: () => setPanelOpen(true),
      closePanel: () => setPanelOpen(false)
    }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
