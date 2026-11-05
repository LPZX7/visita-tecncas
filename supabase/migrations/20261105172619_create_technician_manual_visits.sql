CREATE TABLE IF NOT EXISTS public.manual_visits (
  id TEXT PRIMARY KEY,
  assigned_technician TEXT NOT NULL REFERENCES public.users(id),
  empresa_id TEXT REFERENCES public.empresas(id),
  empresa_nome TEXT NOT NULL,
  endereco TEXT NOT NULL,
  descricao TEXT NOT NULL,
  agendado_para TEXT NOT NULL,
  agendado_ate TEXT,
  status TEXT NOT NULL DEFAULT 'Agendada',
  criado_por TEXT NOT NULL REFERENCES public.users(id),
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL,
  CHECK (agendado_ate IS NULL OR agendado_ate > agendado_para)
);

CREATE INDEX IF NOT EXISTS idx_manual_visits_technician_schedule
  ON public.manual_visits(assigned_technician, agendado_para);

ALTER TABLE public.manual_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.manual_visits FROM PUBLIC, anon, authenticated, service_role;
