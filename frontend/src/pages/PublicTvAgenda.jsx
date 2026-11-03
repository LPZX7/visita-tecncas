import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './PublicTvAgenda.css';

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dateLabel(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return 'Data não definida';
  const date = new Date(Date.UTC(year, month - 1, day));
  const today = todayInSaoPaulo();
  const tomorrowDate = new Date(`${today}T12:00:00Z`);
  tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
  const tomorrow = tomorrowDate.toISOString().slice(0, 10);
  if (`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` === today) return 'HOJE';
  if (`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` === tomorrow) return 'AMANHÃ';
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'short', timeZone: 'UTC'
  }).format(date).replace(',', '');
}

function visitTime(value) {
  return String(value || '').match(/[T ](\d{2}:\d{2})/)?.[1] || '--:--';
}

function currentTimeLabel() {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date());
}

function updatedAtLabel(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(value));
}

export default function PublicTvAgenda() {
  const location = useLocation();
  const linkKey = location.hash.slice(1).trim();
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [clock, setClock] = useState(currentTimeLabel());

  useEffect(() => {
    const originalTitle = document.title;
    const originalRobots = document.querySelector('meta[name="robots"]');
    const originalRobotsContent = originalRobots?.content;
    const robots = originalRobots || document.createElement('meta');
    if (!originalRobots) {
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = 'noindex, nofollow, noarchive';
    document.title = 'Agenda de visitas | Mirontec';

    let active = true;
    let inFlight = false;

    async function loadAgenda() {
      if (!linkKey) {
        if (active) {
          setError('Este link está incompleto. Use o endereço completo enviado pelo gestor.');
          setLoading(false);
          setRefreshing(false);
        }
        return;
      }
      if (inFlight) return;
      inFlight = true;
      if (active) setRefreshing(true);
      try {
        const response = await fetch('/api/public/agenda-tv', {
          method: 'GET',
          cache: 'no-store',
          headers: { 'X-Agenda-TV-Key': linkKey }
        });
        if (!response.ok) {
          throw new Error(response.status === 404
            ? 'Este link não é válido. Peça um link atualizado ao gestor.'
            : 'Não foi possível atualizar a agenda agora.');
        }
        const data = await response.json();
        if (active) {
          setVisits(Array.isArray(data.visitas) ? data.visitas : []);
          setUpdatedAt(data.atualizado_em || new Date().toISOString());
          setError('');
        }
      } catch (err) {
        if (active) setError(err.message || 'Agenda temporariamente indisponível.');
      } finally {
        inFlight = false;
        if (active) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    loadAgenda();
    const refreshId = window.setInterval(loadAgenda, 60 * 1000);
    const clockId = window.setInterval(() => setClock(currentTimeLabel()), 15 * 1000);

    return () => {
      active = false;
      window.clearInterval(refreshId);
      window.clearInterval(clockId);
      document.title = originalTitle;
      if (originalRobots) originalRobots.content = originalRobotsContent;
      else robots.remove();
    };
  }, [linkKey]);

  return (
    <main className="tv-agenda">
      <div className="tv-agenda__glow tv-agenda__glow--one" />
      <div className="tv-agenda__glow tv-agenda__glow--two" />
      <div className="tv-agenda__content">
        <header className="tv-agenda__header">
          <div className="tv-agenda__brand">
            <span className="tv-agenda__logo" aria-hidden="true">M</span>
            <div>
              <strong>MIRONTEC</strong>
              <span>OPERAÇÕES DE CAMPO</span>
            </div>
          </div>
          <div className="tv-agenda__heading">
            <span className="tv-agenda__eyebrow">PLANEJAMENTO DA EQUIPE</span>
            <h1>Próximas visitas</h1>
          </div>
          <div className="tv-agenda__clock" aria-label={`Horário de Brasília: ${clock}`}>
            <strong>{clock}</strong>
            <span>HORÁRIO DE BRASÍLIA</span>
          </div>
        </header>

        <section className="tv-agenda__summary" aria-live="polite">
          <div>
            <span className="tv-agenda__live-dot" />
            <span>PRÓXIMOS 7 DIAS</span>
          </div>
          <strong>{visits.length} visita{visits.length === 1 ? '' : 's'} agendada{visits.length === 1 ? '' : 's'}</strong>
          <small>{refreshing ? 'Atualizando…' : `Atualizado às ${updatedAtLabel(updatedAt)}`}</small>
        </section>

        {error ? (
          <section className="tv-agenda__state tv-agenda__state--error" role="alert">
            <span className="tv-agenda__state-icon">!</span>
            <h2>{error}</h2>
            {!linkKey && <p>Confira se o endereço da TV termina com a chave completa do link.</p>}
          </section>
        ) : loading ? (
          <section className="tv-agenda__state"><span className="tv-agenda__spinner" /><h2>Carregando agenda…</h2></section>
        ) : visits.length === 0 ? (
          <section className="tv-agenda__state tv-agenda__state--empty">
            <span className="tv-agenda__empty-icon" aria-hidden="true">✓</span>
            <h2>Nenhuma visita agendada para os próximos dias</h2>
            <p>As próximas visitas aparecerão aqui automaticamente.</p>
          </section>
        ) : (
          <section className="tv-agenda__grid" aria-label="Próximas visitas">
            {visits.map((visit) => (
              <article className="tv-visit" key={`${visit.milvus_codigo}-${visit.agendado_para}`}>
                <div className="tv-visit__time">
                  <span>{dateLabel(visit.agendado_para)}</span>
                  <strong>{visitTime(visit.agendado_para)}</strong>
                </div>
                <div className="tv-visit__details">
                  <div className="tv-visit__company-row">
                    <h2>{visit.company_name}</h2>
                    <span className="tv-visit__milvus">MILVUS #{visit.milvus_codigo}</span>
                  </div>
                  <div className="tv-visit__facts">
                    <div><span>TÉCNICO</span><strong>{visit.technician_name}</strong></div>
                    <div><span>LOCAL</span><strong>{visit.local}</strong></div>
                  </div>
                </div>
                <div className={`tv-visit__confirmation ${visit.confirmacao === 'Confirmada' ? 'is-confirmed' : ''}`}>
                  <span aria-hidden="true">{visit.confirmacao === 'Confirmada' ? '✓' : '◷'}</span>
                  {visit.confirmacao || 'Aguardando confirmação'}
                </div>
              </article>
            ))}
          </section>
        )}

        <footer className="tv-agenda__footer">
          <span>Agenda sincronizada com os chamados do Milvus</span>
          <span>Atualização automática a cada minuto</span>
        </footer>
      </div>
    </main>
  );
}
