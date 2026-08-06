const STEPS = ['Aberta', 'Agendada', 'Em Atendimento', 'Concluída'];

export default function Timeline({ status }) {
  if (status === 'Cancelada') {
    return (
      <div className="timeline timeline--cancelled">
        <span className="timeline__cancelled-dot" />
        <span>Chamado cancelado</span>
      </div>
    );
  }

  const currentIndex = STEPS.indexOf(status);

  return (
    <div className="timeline">
      {STEPS.map((step, i) => (
        <div key={step} className={`timeline__step ${i <= currentIndex ? 'is-done' : ''} ${i === currentIndex ? 'is-current' : ''}`}>
          <div className="timeline__node">
            <span className="timeline__dot" />
            {i < STEPS.length - 1 && <span className="timeline__connector" />}
          </div>
          <span className="timeline__label">{step}</span>
        </div>
      ))}
    </div>
  );
}
