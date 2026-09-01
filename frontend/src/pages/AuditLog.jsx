import { useEffect, useState } from 'react';
import api from '../api';
import Pagination from '../components/Pagination';
import { getUser } from '../utils/auth';

export const ACAO_LABEL = {
  orcamento_criado: 'Orçamento criado',
  orcamento_criado_automatico: 'Orçamento criado automaticamente (importação Milvus)',
  orcamento_aprovado: 'Orçamento aprovado',
  orcamento_rejeitado: 'Orçamento rejeitado',
  orcamento_enviado: 'Orçamento enviado',
  orcamento_rascunho: 'Orçamento voltou a rascunho',
  orcamento_excluido: 'Orçamento excluído',
  chamado_criado: 'Chamado criado',
  chamado_excluido: 'Chamado excluído',
  contrato_excluido: 'Contrato excluído',
  termo_conclusao_aceito: 'Termo de conclusão assinado',
  termo_conclusao_excluido: 'Termo de conclusão excluído',
  milvus_chamado_importado: 'Chamado importado do Milvus',
  visita_aprovada: 'Visita técnica autorizada',
  visita_recusada: 'Visita técnica recusada',
  usuario_criado: 'Usuário criado',
  usuario_autocadastro: 'Novo cliente cadastrado pelo portal',
  usuario_alterado: 'Usuário alterado',
  usuario_excluido: 'Usuário excluído',
  equipamento_excluido: 'Equipamento excluído',
  auditoria_limpa: 'Auditoria limpa'
};

const PAGE_SIZE = 50;

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR');
}

export default function AuditLog() {
  const user = getUser();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    setLoading(true);
    setError('');
    api.get('/audit', { params: { page, pageSize: PAGE_SIZE } })
      .then((res) => {
        setItems(res.data.items);
        setTotal(res.data.total);
      })
      .catch((err) => setError(err.response?.data?.error || 'Erro ao carregar log de auditoria'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handleClear = async () => {
    if (!window.confirm('Limpar 100% do log de auditoria? Esta ação não pode ser desfeita.')) return;
    setError('');
    try {
      await api.delete('/audit');
      setPage(1);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao limpar auditoria');
    }
  };

  return (
    <div>
      <h2 className="page-title">Log de Auditoria</h2>
      <p className="section-text">Histórico de ações sensíveis: aprovação/rejeição de orçamentos, exclusões e mudanças de usuário.</p>
      {user?.role === 'gestor' && (
        <div className="row-actions" style={{ marginBottom: 16 }}>
          <button type="button" className="btn btn-danger" onClick={handleClear}>Limpar auditoria</button>
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p className="section-text">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="section-text">Nenhum registro de auditoria ainda.</p>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.criado_em)}</td>
                  <td>{item.user_nome || '—'}</td>
                  <td>{ACAO_LABEL[item.acao] || item.acao}</td>
                  <td>{item.detalhes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
