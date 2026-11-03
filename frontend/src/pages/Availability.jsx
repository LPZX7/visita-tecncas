import { getUser } from '../utils/auth';
import TechnicianAvailabilityCalendar from '../components/TechnicianAvailabilityCalendar';

export default function Availability() {
  const user = getUser();
  const manager = user?.role === 'gestor';
  const readOnly = user?.role === 'analista';

  return (
    <div className="availability-page">
      <h2 className="page-title">Disponibilidade</h2>
      <p className="section-text">Consulte os horários da equipe ou informe seus dias disponíveis para atendimento.</p>
      <TechnicianAvailabilityCalendar manager={manager} readOnly={readOnly} />
    </div>
  );
}
