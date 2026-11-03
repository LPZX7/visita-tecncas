import { getUser } from '../utils/auth';
import TechnicianAvailabilityCalendar from '../components/TechnicianAvailabilityCalendar';

export default function Availability() {
  const user = getUser();
  const manager = user?.role === 'gestor';
  const readOnly = ['gestor', 'analista'].includes(user?.role);

  return (
    <div className="availability-page">
      <h2 className="page-title">Disponibilidade</h2>
      <p className="section-text">Técnicos bloqueiam os dias em que não podem atender. Nos demais dias, os horários ficam livres para agendamento.</p>
      <TechnicianAvailabilityCalendar manager={manager} readOnly={readOnly} />
    </div>
  );
}
