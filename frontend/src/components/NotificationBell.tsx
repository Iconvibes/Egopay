import type { CSSProperties } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../notifications/NotificationsContext';

export function NotificationBell({ style }: { style?: CSSProperties }) {
  const navigate = useNavigate();
  const { unreadCount } = useNotifications();

  return (
    <button className="icon-btn" style={{ position: 'relative', ...style }} onClick={() => navigate('/notifications')} aria-label="Notifications">
      <Bell size={18} />
      {unreadCount > 0 && (
        <span className="bell-badge" aria-label={`${unreadCount} unread notifications`}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}