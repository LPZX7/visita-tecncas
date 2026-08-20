import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Dashboard from './Dashboard';
import Requests from './Requests';
import Budgets from './Budgets';
import Companies from './Companies';
import CreateSede from './CreateSede';
import CreateFilial from './CreateFilial';
import Equipments from './Equipments';
import Parts from './Parts';
import Rules from './Rules';
import Users from './Users';
import Profile from './Profile';
import AuditLog from './AuditLog';
import MilvusImport from './MilvusImport';
import Contracts from './Contracts';
import Reports from './Reports';
import ApproveBudget from './ApproveBudget';
import ApproveVisit from './ApproveVisit';
import TermoConclusao from './TermoConclusao';
import ValidarTermo from './ValidarTermo';
import NotificationBell from '../components/NotificationBell';
import ActivityBell from '../components/ActivityBell';
import WhatsAppButton from '../components/WhatsAppButton';
import Sidebar from '../components/Sidebar';
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
      { to: '/dashboard', label: 'Início' },
      { to: '/requests', label: 'Chamados' },
      { to: '/budgets', label: 'Orçamentos' },
      { to: '/contracts', label: 'Contratos' }
    ];
    if (role === 'tecnico') return [
      { to: '/dashboard', label: 'Agenda' },
      { to: '/requests', label: 'Chamados' }
    ];
    const empresaGroup = {
      label: 'Empresa',
      children: [
        { to: '/companies/nova', label: 'Cadastrar Empresa' },
        { to: '/companies/sede', label: 'Cadastrar Sede' },
        { to: '/companies/filial', label: 'Cadastrar Filial' }
      ]
    };
    if (role === 'analista') return [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/requests', label: 'Chamados' },
      { to: '/budgets', label: 'Orçamentos' },
      { to: '/contracts', label: 'Contratos' },
      empresaGroup,
      { to: '/equipments', label: 'Equipamentos' },
      { to: '/users', label: 'Usuários' },
      { to: '/milvus-import', label: 'Importar Milvus' }
    ];
    if (role === 'gestor') return [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/reports', label: 'Relatórios' },
      { to: '/requests', label: 'Chamados' },
      { to: '/budgets', label: 'Orçamentos' },
      { to: '/contracts', label: 'Contratos' },
      empresaGroup,
      { to: '/equipments', label: 'Equipamentos' },
      { to: '/parts', label: 'Peças' },
      { to: '/users', label: 'Usuários' },
      { to: '/milvus-import', label: 'Importar Milvus' },
      { to: '/auditoria', label: 'Auditoria' }
    ];
    return [{ to: '/login', label: 'Login' }];
  };

  const links = linksForRole(user?.role);

  const isPublicStandaloneRoute = /^\/(aprovar-orcamento|aprovar-visita|cadastro|esqueci-senha|redefinir-senha|validar)(\/|$)/.test(window.location.pathname);
  if (isPublicStandaloneRoute) {
    return (
      <>
        <Routes>
          <Route path="/aprovar-orcamento/:token" element={<ApproveBudget />} />
          <Route path="/aprovar-visita/:token" element={<ApproveVisit />} />
          <Route path="/cadastro" element={<Signup />} />
          <Route path="/esqueci-senha" element={<ForgotPassword />} />
          <Route path="/redefinir-senha/:token" element={<ResetPassword />} />
          <Route path="/validar/:codigo" element={<ValidarTermo />} />
        </Routes>
        <WhatsAppButton />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
        <WhatsAppButton />
      </>
    );
  }

  const isCliente = user.role === 'cliente';

  return (
    <div className="app-shell">
      <Sidebar links={links} user={user} onLogout={handleLogout} />

      <div className="app-main">
        <header className="topbar">
          <div className="topbar__title">
            <span className="topbar__eyebrow">MIRONTEC · OPERAÇÕES DE CAMPO</span>
          </div>

          {!isCliente && (
            <div className="topbar__status">
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

          <div className="topbar__actions">
            {['analista', 'gestor'].includes(user?.role) && <ActivityBell />}
            <NotificationBell />
            <button type="button" className="topbar__logout-mobile" onClick={handleLogout} aria-label="Sair">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                <path d="M16 17l5-5-5-5M21 12H9" />
              </svg>
            </button>
          </div>
        </header>

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
            path="/reports"
            element={
              <ProtectedRoute allowedRoles={['gestor']}>
                <Reports />
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
            path="/companies/nova"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista']}>
                <Companies />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/sede"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista']}>
                <CreateSede />
              </ProtectedRoute>
            }
          />
          <Route
            path="/companies/filial"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista']}>
                <CreateFilial />
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
          <Route
            path="/visitas/:id/termo"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista', 'cliente']}>
                <TermoConclusao />
              </ProtectedRoute>
            }
          />
          <Route
            path="/milvus-import"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista']}>
                <MilvusImport />
              </ProtectedRoute>
            }
          />
          <Route
            path="/auditoria"
            element={
              <ProtectedRoute allowedRoles={['gestor']}>
                <AuditLog />
              </ProtectedRoute>
            }
          />
          <Route
            path="/perfil"
            element={
              <ProtectedRoute allowedRoles={['gestor', 'analista', 'tecnico', 'cliente']}>
                <Profile />
              </ProtectedRoute>
            }
          />
        </Routes>
        </main>
      </div>
      <WhatsAppButton />
    </div>
  );
}
