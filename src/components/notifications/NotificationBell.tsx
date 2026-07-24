import React from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';

export const NotificationBell: React.FC = () => {
  const { unreadCount, openPanel } = useNotifications();

  return (
    <button
      onClick={openPanel}
      className="relative p-2 rounded-full hover:bg-[#F7F4EF] transition-colors text-[#756B66] hover:text-[#201A17]"
      aria-label="Notificações"
    >
      <Bell size={20} />
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#E94F2F] text-[9px] font-black text-white ring-2 ring-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};
