export default function Home() {
  return (
    <section className="home-hero">
      <div className="home-hero__header">
        <span className="home-eyebrow">MIRONTEC · OPERAÇÕES DE CAMPO</span>
        <div className="home-hero__hero">
          <h2 className="page-title">Do chamado à catraca liberada.</h2>
          <p className="section-text">
            Abra o chamado, acompanhe o técnico chegar, aprove o orçamento e veja a catraca voltar a funcionar — tudo em um lugar só.
          </p>
        </div>
      </div>

      <div className="home-status-grid">
        <article className="status-panel status-panel--open">
          <span className="status-panel__label">Chamados abertos</span>
          <strong>12</strong>
          <p>Catraca com defeito aguardando técnico.</p>
        </article>

        <article className="status-panel status-panel--in-progress">
          <span className="status-panel__label">Técnicos em campo</span>
          <strong>4</strong>
          <p>Atendendo ordens de serviço e vistoriando catracas.</p>
        </article>

        <article className="status-panel status-panel--pending">
          <span className="status-panel__label">Orçamentos pendentes</span>
          <strong>3</strong>
          <p>Rascunhos aguardando aprovação do cliente.</p>
        </article>
      </div>
    </section>
  );
}
