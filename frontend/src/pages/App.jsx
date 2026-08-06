import { useEffect, useState } from 'react';
import { Routes, Route, Link, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './Dashboard';
import Requests from './Requests';
import Budgets from './Budgets';
import Companies from './Companies';
import Equipments from './Equipments';
import Parts from './Parts';
import Rules from './Rules';
import Users from './Users';
import Contracts from './Contracts';
import ApproveBudget from './ApproveBudget';
import NotificationBell from '../components/NotificationBell';
import Signup from './Signup';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import ProtectedRoute from '../components/ProtectedRoute';
import api from '../api';
import { getUser, clearAuth } from '../utils/auth';
import { useNavigate } from 'react-router-dom';

export default function App() {
  const user = getUser();
  const navigate = useNavigate();
  const [status, setStatus] = useState({ visitasHoje: 0, tecnicosEmCampo: 0, orcamentosPendentes: 0 });

  useEffect(() => {
    if (!user) return;
    async function loadStatus() {
      try {
        const [requestsRes, budgetsRes] = await Promise.all([api.get('/requests'), api.get('/budgets')]);
        const today = new Date().toISOString().slice(0, 10);
        const requests = requestsRes.data;
        const visitasHoje = requests.filter((r) => (r.agendado_para || '').slice(0, 10) === today).length;
        const tecnicosEmCampo = new Set(
          requests.filter((r) => r.status === 'Em Atendimento' && r.assigned_technician).map((r) => r.assigned_technician)
        ).size;
        const orcamentosPendentes = budgetsRes.data.filter((b) => b.status === 'Enviado').length;
        setStatus({ visitasHoje, tecnicosEmCampo, orcamentosPendentes });
      } catch (err) {
        console.error(err);
      }
    }
    loadStatus();
  }, [user?.id]);

  const handleLogout = () => {
    clearAuth();
    navigate('/');
    window.location.reload();
  };

  const linksForRole = (role) => {
    if (!role) return [];
    if (role === 'cliente') return [
      { to: '/requests', label: 'Chamados' },
      { to: '/budgets', label: 'Orçamentos' },
      { to: '/contracts', label: 'Contratos' }
    ];
    if (role === 'tecnico') return [
      { to: '/dashboard', label: 'Agenda' },
      { to: '/requests', label: 'Chamados' }
    ];
    if (role === 'analista') return [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/requests', label: 'Chamados' },
      { to: '/budgets', label: 'Orçamentos' },
      { to: '/contracts', label: 'Contratos' },
      { to: '/companies', label: 'Empresas' },
      { to: '/equipments', label: 'Equipamentos' },
      { to: '/users', label: 'Usuários' }
    ];
    if (role === 'gestor') return [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/requests', label: 'Chamados' },
      { to: '/budgets', label: 'Orçamentos' },
      { to: '/contracts', label: 'Contratos' },
      { to: '/companies', label: 'Empresas' },
      { to: '/equipments', label: 'Equipamentos' },
      { to: '/parts', label: 'Peças' },
      { to: '/rules', label: 'Regras' },
      { to: '/users', label: 'Usuários' }
    ];
    return [{ to: '/login', label: 'Login' }];
  };

  const links = linksForRole(user?.role);

  const isPublicStandaloneRoute = /^\/(aprovar-orcamento|cadastro|esqueci-senha|redefinir-senha)(\/|$)/.test(window.location.pathname);
  if (isPublicStandaloneRoute) {
    return (
      <Routes>
        <Route path="/aprovar-orcamento/:token" element={<ApproveBudget />} />
        <Route path="/cadastro" element={<Signup />} />
        <Route path="/esqueci-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha/:token" element={<ResetPassword />} />
      </Routes>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  const isCliente = user.role === 'cliente';

  return (
    <div className="app-shell">
      <header className="app-header">
        <Link to="/dashboard" className="brand-block">
          <img src="/mirontec-logo.jpg" alt="Mirontec" className="mirontec-mark" onError={(e)=>{e.target.src='/mirontec-logo.svg'}} />
          <div>
            <span className="brand-eyebrow">MIRONTEC · OPERAÇÕES DE CAMPO</span>
            <h1 className="brand-title">Sistema de manutenção de catracas</h1>
          </div>
        </Link>

        <nav className="app-nav">
          {links.map((l) => (
            <Link key={l.to} to={l.to}>{l.label}</Link>
          ))}
          {isCliente && <NotificationBell />}
          <button className="secondary-button" onClick={handleLogout} style={{ marginLeft: 12 }}>Sair</button>
        </nav>
      </header>

      {!isCliente && (
        <div className="status-bar">
          <span className="status-item">
            <span className="status-dot status-dot--green" /> {status.visitasHoje} visita{status.visitasHoje === 1 ? '' : 's'} hoje
          </span>
          <span className="status-item">
            <span className="status-dot status-dot--amber" /> {status.tecnicosEmCampo} técnico{status.tecnicosEmCampo === 1 ? '' : 's'} em campo
          </span>
          <span className="status-item">
            <span className="status-dot status-dot--red" /> {status.orcamentosPendentes} orçamento{status.orcamentosPendentes === 1 ? '' : 's'} pendente{status.orcamentosPendentes === 1 ? '' : 's'}
          </span>
        </div>
      )}

      <main className="page-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista', 'tecnico', 'cliente']}>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/requests"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista', 'tecnico', 'cliente']}>
                <Requests />
              </ProtectedRoute>
            }
          />
          <Route
            path="/budgets"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista', 'tecnico', 'cliente']}>
                <Budgets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista']}>
                <Companies />
              </ProtectedRoute>
            }
          />
          <Route
            path="/equipments"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista']}>
                <Equipments />
              </ProtectedRoute>
            }
          />
          <Route
            path="/parts"
            element={
              <ProtectedRoute allowedRoles={['gestor']}>
                <Parts />
              </ProtectedRoute>
            }
          />
          <Route
            path="/rules"
            element={
              <ProtectedRoute allowedRoles={['gestor']}>
                <Rules />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista']}>
                <Users />
              </ProtectedRoute>
            }
          />
          <Route
            path="/contracts"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista', 'cliente']}>
                <Contracts />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
