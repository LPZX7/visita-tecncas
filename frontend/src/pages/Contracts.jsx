import { useEffect, useState } from 'react';
import api from '../api';

function money(value) {
  return `R$ ${Number(value || 0).toFixed(2)}`;
}

export default function Contracts() {
  const [contracts, setContracts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    api.get('/contracts').then((res) => setContracts(res.data));
    api.get('/companies').then((res) => setCompanies(res.data)).catch(() => {});
    api.get('/requests').then((res) => setRequests(res.data)).catch(() => {});
  }, []);

  const companyName = (id) => companies.find((c) => c.id === id)?.razao_social || '—';
  const requestLabel = (id) => requests.find((r) => r.id === id)?.descricao || '—';

  const openPdf = (id) => {
    api.get(`/contracts/${id}/pdf`, { responseType: 'blob' }).then((res) => {
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
    });
  };

  return (
    <div>
      <h2 className="page-title">Contratos</h2>
      <p className="section-text">Contratos gerados automaticamente sempre que um orçamento é aprovado pelo cliente.</p>

      <table className="data-table">
        <thead>
          <tr>
            <th>Número</th>
            <th>Empresa</th>
            <th>Chamado</th>
            <th>Valor</th>
            <th>Data</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {contracts.length === 0 && (
            <tr><td colSpan={6} style={{ color: '#64748b' }}>Nenhum contrato gerado ainda.</td></tr>
          )}
          {contracts.map((contract) => (
            <tr key={contract.id}>
              <td>{contract.numero}</td>
              <td>{companyName(contract.empresa_id)}</td>
              <td>{requestLabel(contract.request_id)}</td>
              <td>{money(contract.valor_total)}</td>
              <td>{new Date(contract.criado_em).toLocaleDateString('pt-BR')}</td>
              <td>
                <button className="btn btn-outline btn-sm" onClick={() => openPdf(contract.id)}>Baixar PDF</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
