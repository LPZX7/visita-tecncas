const FEATURES = [
  { title: 'Milvus conectado', detail: 'Chamados e responsáveis sincronizados' },
  { title: 'Fluxo inteligente', detail: 'Orçamento, aprovação e visita integrados' },
  { title: 'Operação rastreável', detail: 'Histórico técnico centralizado e seguro' }
];

export default function AuthLayout({ children }) {
  return (
    <div className="login-page">
      <aside className="login-visual" aria-hidden>
        <div className="login-visual__grid" />
        <div className="login-visual__orb login-visual__orb--one" />
        <div className="login-visual__orb login-visual__orb--two" />

        <div className="login-visual__brand">
          <div className="login-visual__mark">
            <img src="/mirontec-logo.jpg" alt="" className="login-visual__logo" />
          </div>
          <div>
            <strong>MIRONTEC</strong>
            <span>SERVICE OPERATIONS</span>
          </div>
        </div>

        <div className="login-visual__content">
          <span className="login-visual__eyebrow"><i /> OPERAÇÃO CONECTADA EM TEMPO REAL</span>
          <h2 className="login-visual__heading">Controle técnico com <span>clareza, velocidade e precisão.</span></h2>
          <p className="login-visual__lead">Uma central profissional para transformar chamados em atendimentos bem executados, do Milvus até a conclusão em campo.</p>

          <ul className="login-visual__features">
            {FEATURES.map((feature) => (
              <li key={feature.title}>
                <span className="login-visual__feature-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12.5l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span><strong>{feature.title}</strong><small>{feature.detail}</small></span>
              </li>
            ))}
          </ul>

          <div className="login-visual__signal">
            <span><i /> Plataforma operacional</span>
            <strong>ONLINE</strong>
          </div>
        </div>

        <div className="login-visual__footer">
          <span>© 2026 Mirontec</span>
          <span>Portal seguro de atendimento</span>
        </div>
      </aside>

      <main className="login-card" aria-labelledby="auth-title">
        <div className="login-card__inner">
          <div className="login-card__secure"><span /> AMBIENTE PROTEGIDO</div>
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
