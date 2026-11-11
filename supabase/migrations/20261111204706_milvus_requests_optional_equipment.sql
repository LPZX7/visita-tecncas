ALTER TABLE public.requests
  ALTER COLUMN equipamento_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS unidade_id TEXT REFERENCES public.unidades(id);

ALTER TABLE public.equipamentos
  ADD COLUMN IF NOT EXISTS real BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.equipamentos
SET real = FALSE
WHERE lower(trim(numero_serie)) IN ('a definir', 'definir', 'n/a', 'na', 'sem serie', 'não informado', 'nao informado');

CREATE TABLE IF NOT EXISTS public.equipamento_modelos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_equipamento_modelos_nome
  ON public.equipamento_modelos(lower(nome));

ALTER TABLE public.equipamento_modelos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.equipamento_modelos FROM PUBLIC, anon, authenticated, service_role;
