import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowDownLeft, ArrowUpRight, BellOff, BellRing, CheckCheck, Megaphone } from 'lucide-react';
import { ScreenHeader } from '../components/ScreenHeader';
import { toastError, useToast } from '../components/Toast';
import { api, type NotificationItem } from '../lib/api';
import { formatDate } from '../lib/format';
import { enableNotifications, getNotificationPermission, showPaymentNotification } from '../lib/pwa';
import { useNotifications } from '../notifications/NotificationsContext';

export function Notifications() {
  const { toast } = useToast();
  const { unreadCount, reload: reloadContext } = useNotifications();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.notifications();
      setItems(res.items);
    } catch (err) {
      toast('error', toastError(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const markAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      await Promise.all([load(), reloadContext()]);
    } catch (err) {
      toast('error', toastError(err));
    }
  };

  const markRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      await reloadContext();
    } catch {
      // non-fatal
    }
  };

  const permission = getNotificationPermission();

  function kindVisual(kind: string): { icon: ReactNode; cls: string } {
    if (kind === 'INCOMING_CREDIT') return { icon: <ArrowDownLeft size={18} />, cls: 'list-item-icon--green' };
    if (kind === 'OUTGOING_FAILED') return { icon: <ArrowUpRight size={18} />, cls: 'list-item-icon--red' };
    if (kind === 'OUTGOING_SUCCESS') return { icon: <ArrowUpRight size={18} />, cls: 'list-item-icon--green' };
    return { icon: <BellRing size={18} />, cls: 'list-item-icon--green' };
  }

  async function requestAlerts() {
    const result = await enableNotifications();
    if (result === 'granted') {
      toast('success', 'Payment alerts enabled — you will be notified when money moves.');
    } else if (result === 'denied') {
      toast('error', 'Notifications are blocked. Allow them in your browser settings.');
    } else {
      toast('info', 'Notifications are not supported in this browser.');
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Notifications" subtitle={unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'} />

      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--primary-soft)' }}>
        <BellRing size={22} color="#2563eb" style={{ flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>Payment alerts</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
            {permission === 'granted'
              ? 'Enabled — incoming and outgoing payments alert you even outside the app tab.'
              : permission === 'denied'
                ? 'Blocked in browser settings — enable it to get alerts.'
                : 'Get an alert the moment money moves in or out of your account.'}
          </div>
        </div>
        {permission === 'granted' ? (
          <button
            className="btn btn--outline btn--sm"
            onClick={() => showPaymentNotification('EgoPay — test alert', 'This is a test notification from EgoPay.', `test-${Date.now()}`)}
          >
            <Megaphone size={15} /> Test
          </button>
        ) : (
          <button className="btn btn--primary btn--sm" style={{ width: 'auto' }} onClick={requestAlerts}>
            Enable
          </button>
        )}
      </div>

      {unreadCount > 0 && (
        <button className="btn btn--outline btn--sm" style={{ marginBottom: 16, width: 'auto' }} onClick={markAllRead}>
          <CheckCheck size={16} /> Mark all as read
        </button>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <span className="spinner spinner--dark" />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <BellOff size={40} />
          <h3>No notifications</h3>
          <p>Money in and money out will appear here with an alert.</p>
        </div>
      ) : (
        <div className="list">
          {items.map((n) => (
            <div key={n.id} className={`list-item notif-item ${n.read ? '' : 'notif-item--unread'}`} onClick={() => !n.read && void markRead(n.id)}>
              <span className={`list-item-icon ${kindVisual(n.kind).cls}`}>{kindVisual(n.kind).icon}</span>
              <div className="list-item-body">
                <div className="list-item-title">{n.title}</div>
                <div className="list-item-sub">{n.message}</div>
                <div className="list-item-sub" style={{ marginTop: 2 }}>{formatDate(n.createdAt)}</div>
              </div>
              {!n.read && <span className="notif-dot" aria-label="Unread" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}