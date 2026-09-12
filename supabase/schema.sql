-- Barbearia Leandro David - schema inicial
-- Executar no Supabase novo exclusivo da Barbearia.

create extension if not exists pgcrypto;

create table if not exists public.servicos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  duracao_minutos integer not null check (duracao_minutos between 10 and 240),
  valor numeric(10,2) not null check (valor >= 0),
  ativo boolean not null default true,
  ordem integer not null default 100,
  created_at timestamptz not null default now()
);

create table if not exists public.barbeiros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clientes (
  telefone text primary key,
  nome text not null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  cliente_telefone text not null references public.clientes(telefone) on update cascade,
  barbeiro_id uuid not null references public.barbeiros(id),
  servico_id uuid not null references public.servicos(id),
  data date not null,
  hora time not null,
  valor numeric(10,2) not null default 0,
  observacao text,
  status text not null default 'pendente' check (status in ('pendente','confirmado','em_atendimento','finalizado','cancelado','recusado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agendamento_horario_ativo_unique
on public.agendamentos(barbeiro_id,data,hora)
where status in ('pendente','confirmado','em_atendimento');

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  perfil text not null check (perfil in ('admin','barbeiro')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.configuracoes (
  id integer primary key default 1 check (id = 1),
  nome text not null default 'Barbearia Leandro David',
  whatsapp text,
  endereco text,
  instagram text,
  inicio time not null default '08:30',
  fim time not null default '20:00',
  intervalo_minutos integer not null default 30 check (intervalo_minutos between 10 and 120),
  updated_at timestamptz not null default now()
);

alter table public.servicos enable row level security;
alter table public.barbeiros enable row level security;
alter table public.clientes enable row level security;
alter table public.agendamentos enable row level security;
alter table public.perfis enable row level security;
alter table public.configuracoes enable row level security;

-- catálogo público
create policy "catalogo_servicos_publico" on public.servicos for select to anon, authenticated using (ativo = true);
create policy "catalogo_barbeiros_publico" on public.barbeiros for select to anon, authenticated using (ativo = true);
create policy "config_publica" on public.configuracoes for select to anon, authenticated using (true);

-- cadastro mínimo do cliente; leitura pública permanece bloqueada
create policy "cliente_insere" on public.clientes for insert to anon, authenticated with check (char_length(telefone) between 10 and 13 and char_length(nome) between 2 and 120);

-- solicitação pública; sem leitura pública da agenda
create policy "agendamento_publico_insere" on public.agendamentos for insert to anon, authenticated
with check (status = 'pendente' and data >= current_date);

-- cada usuário autenticado vê o próprio perfil
create policy "perfil_proprio" on public.perfis for select to authenticated using (id = (select auth.uid()));

-- gestão autenticada
create policy "gestao_servicos" on public.servicos for all to authenticated
using (exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.ativo and p.perfil in ('admin','barbeiro')))
with check (exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.ativo and p.perfil in ('admin','barbeiro')));

create policy "gestao_barbeiros" on public.barbeiros for all to authenticated
using (exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.ativo and p.perfil in ('admin','barbeiro')))
with check (exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.ativo and p.perfil in ('admin','barbeiro')));

create policy "gestao_clientes" on public.clientes for select to authenticated
using (exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.ativo and p.perfil in ('admin','barbeiro')));

create policy "gestao_agendamentos_select" on public.agendamentos for select to authenticated
using (exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.ativo and p.perfil in ('admin','barbeiro')));

create policy "gestao_agendamentos_update" on public.agendamentos for update to authenticated
using (exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.ativo and p.perfil in ('admin','barbeiro')))
with check (exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.ativo and p.perfil in ('admin','barbeiro')));

create policy "gestao_config" on public.configuracoes for update to authenticated
using (exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.ativo and p.perfil='admin'))
with check (exists(select 1 from public.perfis p where p.id=(select auth.uid()) and p.ativo and p.perfil='admin'));

revoke all on public.clientes, public.agendamentos, public.perfis from anon;
grant select on public.servicos, public.barbeiros, public.configuracoes to anon;
grant insert on public.clientes, public.agendamentos to anon;
grant select,insert,update,delete on public.servicos, public.barbeiros to authenticated;
grant select,insert,update on public.clientes, public.agendamentos, public.configuracoes to authenticated;
grant select on public.perfis to authenticated;

insert into public.configuracoes(id,nome,whatsapp,endereco,inicio,fim,intervalo_minutos)
values(1,'Barbearia Leandro David','5548996684751','Rua Coronel Fernandes Martins, 251, em frente à UDESC, Laguna - SC','08:30','20:00',30)
on conflict (id) do nothing;

insert into public.servicos(nome,duracao_minutos,valor,ordem)
select * from (values
 ('Corte masculino',30,40.00,10),
 ('Barba',30,30.00,20),
 ('Corte + barba',60,60.00,30)
) as v(nome,duracao_minutos,valor,ordem)
where not exists(select 1 from public.servicos);

insert into public.barbeiros(nome,telefone)
select 'Leandro David','5548996684751'
where not exists(select 1 from public.barbeiros);

-- Após criar o usuário do proprietário em Authentication > Users,
-- vincule-o ao painel substituindo SEU_USER_UUID:
-- insert into public.perfis(id,nome,perfil,ativo) values ('SEU_USER_UUID','Leandro David','admin',true);
