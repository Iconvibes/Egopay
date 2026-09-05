import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeftRight, Clock, RefreshCw, SearchCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { ScreenHeader } from '../components/ScreenHeader';
import { StatusChip } from '../components/StatusChip';
import { toastError } from '../components/Toast';
import { api, type TransactionItem } from '../lib/api';
import { formatDate, formatNaira } from '../lib/format';

export function TransactionStatus() {
  const [params] = useSearchParams();
  const [txId, setTxId] = useState(params.get('tx') ?? '');
  const [transaction, setTransaction] = useState<TransactionItem | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function lookup(id: string) {
    setError(null);
    if (!id.trim()) {
      setError('Enter a transaction id.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.transactionStatus(id.trim());
      setTransaction(res.transaction);
      setSource(res.source ?? null);
    } catch (err) {
      setTransaction(null);
      setError(toastError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await lookup(txId);
  }

  useEffect(() => {
    const fromQuery = params.get('tx');
    if (fromQuery) {
      setTxId(fromQuery);
      void lookup(fromQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="screen">
      <ScreenHeader title="Transaction status" subtitle="Live status from the NIBSS TSQ endpoint" />

      {error && <div className="alert alert--error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="field" style={{ marginBottom: 4 }}>
            <label htmlFor="tx-id">Transaction id</label>
            <input
              id="tx-id"
              className="input"
              value={txId}
              onChange={(e) => setTxId(e.target.value)}
              placeholder="e.g. cm3f9xk... (from a transfer)"
            />
            <div className="input-hint">The internal id returned when you sent money.</div>
          </div>
        </div>
        <button className="btn btn--primary" disabled={busy}>
          {busy ? <span className="spinner" /> : 'Check status'}
        </button>
      </form>

      {transaction && (
        <div className="card" style={{ marginTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <span
              className={`list-item-icon ${
                transaction.status === 'SUCCESS'
                  ? 'list-item-icon--green'
                  : transaction.status === 'FAILED'
                    ? 'list-item-icon--red'
                    : 'list-item-icon--amber'
              }`}
            >
              {transaction.status === 'SUCCESS' ? <SearchCheck size={20} /> : <Clock size={20} />}
            </span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Transaction {transaction.status.toLowerCase()}</div>
              <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 2 }}>
                {source === 'nibss' ? 'Synced from NIBSS' : 'Local record'}
              </div>
            </div>
            <div style={{ marginLeft: 'auto' }}>
              <StatusChip status={transaction.status} />
            </div>
          </div>

          <div className="summary-row">
            <span className="k">Amount</span>
            <span className="v" style={{ fontSize: 17, color: 'var(--primary)' }}>
              {formatNaira(transaction.amount)}
            </span>
          </div>
          <div className="summary-row">
            <span className="k">Reference (TSQ)</span>
            <span className="v" style={{ fontSize: 12.5 }}>
              {transaction.reference ?? '—'}
            </span>
          </div>
          <div className="summary-row">
            <span className="k">From</span>
            <span className="v" style={{ fontSize: 13 }}>
              {transaction.from}
            </span>
          </div>
          <div className="summary-row">
            <span className="k">To</span>
            <span className="v" style={{ fontSize: 13 }}>
              {transaction.recipientName ? `${transaction.recipientName} · ${transaction.to}` : transaction.to}
            </span>
          </div>
          <div className="summary-row">
            <span className="k">Type</span>
            <span className="v" style={{ fontSize: 13 }}>
              {transaction.type === 'INTRABANK' ? 'Intra-bank' : 'Inter-bank'}
            </span>
          </div>
          <div className="summary-row">
            <span className="k">Initiated</span>
            <span className="v" style={{ fontSize: 13 }}>
              {formatDate(transaction.createdAt)}
            </span>
          </div>
          {transaction.completedAt && (
            <div className="summary-row">
              <span className="k">Completed</span>
              <span className="v" style={{ fontSize: 13 }}>
                {formatDate(transaction.completedAt)}
              </span>
            </div>
          )}
          {transaction.errorMessage && (
            <div className="alert alert--error" style={{ marginTop: 12, marginBottom: 0 }}>
              <ArrowLeftRight size={16} /> {transaction.errorMessage}
            </div>
          )}
        </div>
      )}

      {transaction && (
        <button className="btn btn--outline" style={{ marginTop: 4 }} onClick={() => void lookup(txId)}>
          <RefreshCw size={16} /> Refresh status
        </button>
      )}
    </div>
  );
}