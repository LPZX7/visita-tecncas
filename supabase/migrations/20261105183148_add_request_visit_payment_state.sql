ALTER TABLE public.requests
  ADD COLUMN IF NOT EXISTS pagamento_status TEXT NOT NULL DEFAULT 'Pendente',
  ADD COLUMN IF NOT EXISTS pagamento_liquidado_em TEXT,
  ADD COLUMN IF NOT EXISTS pagamento_liquidado_por TEXT;
