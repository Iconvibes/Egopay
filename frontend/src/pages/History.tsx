import { useCallback, useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowLeftRight, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusChip } from '../components/StatusChip';
import { toastError, useToast } from '../components/Toast';
import { api, type TransactionItem } from '../lib/api';
import { formatDate, formatNaira } from '../lib/format';

const STATUS_FILTERS = ['ALL', 'SUCCESS', 'FAILED', 'PENDING'] as const;
const TYPE_FILTERS = ['ALL', 'INTRABANK', 'INTERBANK', 'INCOMING'] as const;

export function History() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [items, setItems] = useState<TransactionItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>('ALL');
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>('ALL');
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (p: number, status: string, type: string) => {
      setLoading(true);
      try {
        const res = await api.transactions({
          page: p,
          limit: 15,
          status: status === 'ALL' ? undefined : status,
          type: type === 'ALL' ? undefined : type,
        });
        setItems(res.items);
        setTotal(res.pagination.total);
        setPages(res.pagination.pages);
        setPage(res.pagination.page);
      } catch (err) {
        toast('error', toastError(err));
      } finally {
        setLoading(false);
      }
    },
    [toast],
  );

  useEffect(() => {
    void load(1, statusFilter, typeFilter);
  }, [load, statusFilter, typeFilter]);

  return (
    <div className="screen">
      <ScreenHeader title="Transactions" subtitle={`${total} total`} />

      <div className="filters">
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={`filter-pill ${statusFilter === s ? 'active' : ''}`} onClick={() => setStatusFilter(s)}>
            {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
          </button>
        ))}
      </div>
      <div className="filters" style={{ marginBottom: 16 }}>
        {TYPE_FILTERS.map((t) => (
          <button key={t} className={`filter-pill ${typeFilter === t ? 'active' : ''}`} onClick={() => setTypeFilter(t)}>
            {t === 'ALL' ? 'All banks' : t === 'INTRABANK' ? 'Intra-bank' : t === 'INTERBANK' ? 'Inter-bank' : 'Incoming'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <span className="spinner spinner--dark" />
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <Clock size={40} />
          <h3>No transactions</h3>
          <p>Try a different filter, or send some money.</p>
        </div>
      ) : (
        <div className="list">
          {items.map((tx) =>
            tx.direction === 'CREDIT' ? (
              <div key={tx.id} className="list-item">
                <span className="list-item-icon list-item-icon--green">
                  <ArrowDownLeft size={18} />
                </span>
                <div className="list-item-body">
                  <div className="list-item-title">Incoming transfer</div>
                  <div className="list-item-sub">
                    {formatDate(tx.createdAt)} · Incoming{tx.reference ? ` · ${tx.reference}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="list-item-amount list-item-amount--plus">+{formatNaira(tx.amount)}</div>
                  <StatusChip status={tx.status} />
                </div>
              </div>
            ) : (
              <div key={tx.id} className="list-item" onClick={() => navigate(`/status?tx=${tx.id}`)}>
                <span
                  className={`list-item-icon ${
                    tx.status === 'SUCCESS'
                      ? 'list-item-icon--green'
                      : tx.status === 'FAILED'
                        ? 'list-item-icon--red'
                        : 'list-item-icon--amber'
                  }`}
                >
                  <ArrowLeftRight size={18} />
                </span>
                <div className="list-item-body">
                  <div className="list-item-title">{tx.recipientName ?? `To ${tx.to}`}</div>
                  <div className="list-item-sub">
                    {formatDate(tx.createdAt)} · {tx.type === 'INTRABANK' ? 'Intra' : 'Inter'}
                    {tx.reference ? ` · ${tx.reference}` : ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="list-item-amount list-item-amount--minus">-{formatNaira(tx.amount)}</div>
                  <StatusChip status={tx.status} />
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {pages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 18 }}>
          <button className="btn btn--outline btn--sm" disabled={page <= 1 || loading} onClick={() => void load(page - 1, statusFilter, typeFilter)}>
            Previous
          </button>
          <span style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600 }}>
            Page {page} of {pages}
          </span>
          <button className="btn btn--outline btn--sm" disabled={page >= pages || loading} onClick={() => void load(page + 1, statusFilter, typeFilter)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}