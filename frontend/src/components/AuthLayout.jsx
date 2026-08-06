const FEATURES = [
  'Solicitação simples e rápida',
  'Acompanhamento de cada etapa',
  'Histórico completo de atendimentos'
];

export default function AuthLayout({ children }) {
  return (
    <div className="login-page">
      <aside className="login-visual" aria-hidden>
        <div className="login-visual__mark">
        <img src="/mirontec-logo.jpg" alt="Mirontec" className="login-visual__logo" />
        </div>

        <div className="login-visual__content">
          <h2 className="login-visual__heading">Atendimentos técnicos organizados do início ao fim</h2>
          <p className="login-visual__lead">Solicite visitas, acompanhe cada etapa e mantenha todo o histórico de serviços em um único lugar.</p>

          <ul className="login-visual__features">
            {FEATURES.map((feature) => (
              <li key={feature}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" />
                  <path d="M8 12.5l2.5 2.5L16 9.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <p className="login-visual__footer">Mirontec Service · Portal seguro de atendimento</p>
      </aside>

      <main className="login-card" aria-labelledby="auth-title">
        <div className="login-card__inner">
          <div className="login-card__brand">
            <img src="/mirontec-logo.jpg" alt="Mirontec" className="brand-logo" onError={(e) => { e.target.src = '/mirontec-logo.svg'; }} />
            <div>
              <strong>Mirontec Service</strong>
              <span>Portal seguro de atendimento</span>
            </div>
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}
