import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { ACAO_LABEL } from '../pages/AuditLog';

const LAST_SEEN_KEY = 'atividade_ultima_visualizacao';

function timeAgo(iso) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  return `${days}d atrás`;
}

// Feed de atividade interna (analista/gestor) baseado na Auditoria — cria,
// exclui, importa, aprova... tudo que a equipe faz no sistema aparece aqui.
// Separado do sino de notificações do cliente, que é por empresa e sempre
// vazio para a equipe (que não tem empresa_id).
export default function ActivityBell() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(() => localStorage.getItem(LAST_SEEN_KEY) || '1970-01-01T00:00:00.000Z');
  const navigate = useNavigate();
  const boxRef = useRef(null);

  const load = () => {
    api.get('/audit', { params: { page: 1, pageSize: 15 } }).then((res) => setItems(res.data.items)).catch(() => {});
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const unreadCount = items.filter((n) => new Date(n.criado_em) > new Date(lastSeen)).length;

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SEEN_KEY, now);
      setLastSeen(now);
    }
  };

  return (
    <div className="notif-bell" ref={boxRef}>
      <button type="button" className="notif-bell__trigger" onClick={toggleOpen} aria-label="Atividade do sistema">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M3 12h4l2-7 6 14 2-7h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {unreadCount > 0 && <span className="notif-bell__badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown__header">Atividade do sistema</div>
          {items.length === 0 ? (
            <p className="notif-dropdown__empty">Nenhuma atividade registrada ainda.</p>
          ) : (
            <ul className="notif-dropdown__list">
              {items.map((n) => (
                <li key={n.id} onClick={() => { setOpen(false); navigate('/auditoria'); }}>
                  <strong>{ACAO_LABEL[n.acao] || n.acao}</strong>
                  {n.detalhes && <span>{n.detalhes}</span>}
                  <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{n.user_nome || 'Sistema'}</span>
                  <time>{timeAgo(n.criado_em)}</time>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
