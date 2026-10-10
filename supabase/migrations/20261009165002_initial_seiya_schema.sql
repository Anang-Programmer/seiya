-- Seiya initial schema
-- Apply this as the first Supabase migration to a fresh project.
-- Critical financial mutations are intentionally not granted to browser users;
-- route handlers/services must authenticate and authorize each action server-side.


-- -----------------------------------------------------------------------------
-- Shared utilities
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

-- Household membership helper functions are created after their table below.

-- -----------------------------------------------------------------------------
-- Identity and onboarding
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  city text,
  country text,
  preferred_language text not null default 'en',
  children_count integer check (children_count is null or children_count >= 0),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.onboarding_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  response_version integer not null default 1 check (response_version > 0),
  answers jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (user_id, response_version),
  check (jsonb_typeof(answers) = 'object')
);

create index onboarding_responses_user_created_idx
  on public.onboarding_responses (user_id, created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    nullif(pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger onboarding_responses_set_updated_at
  before update on public.onboarding_responses
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Household, membership, and partner invitations
-- -----------------------------------------------------------------------------
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our household',
  created_by uuid not null references auth.users(id) on delete restrict,
  country text,
  base_currency text not null default 'IDR'
    check (base_currency ~ '^[A-Z]{3}$'),
  status text not null default 'setup'
    check (status in ('setup', 'active', 'archived')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'partner' check (role in ('owner', 'partner')),
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default pg_catalog.now(),
  unique (household_id, user_id)
);

create unique index household_one_active_owner_idx
  on public.household_members (household_id)
  where role = 'owner' and status = 'active';
create index household_members_user_idx
  on public.household_members (user_id, status);

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = (select auth.uid())
      and hm.status = 'active'
  );
$$;

create or replace function public.is_household_owner(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = (select auth.uid())
      and hm.role = 'owner'
      and hm.status = 'active'
  );
$$;

revoke all on function public.set_updated_at() from public;
grant execute on function public.set_updated_at() to authenticated;
revoke all on function public.is_household_member(uuid) from public;
revoke all on function public.is_household_owner(uuid) from public;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_owner(uuid) to authenticated;


create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete restrict,
  invited_email text not null,
  invited_name text,
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired', 'revoked')),
  expires_at timestamptz not null default (pg_catalog.now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (invited_email = pg_catalog.lower(pg_catalog.btrim(invited_email)))
);

create index household_invitations_household_status_idx
  on public.household_invitations (household_id, status, created_at desc);
create index household_invitations_email_status_idx
  on public.household_invitations (invited_email, status);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();
create trigger household_invitations_set_updated_at
  before update on public.household_invitations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Shared financial agreement (Dual-Key rules)
-- -----------------------------------------------------------------------------
create table public.household_finance_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  version integer not null check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  rules jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'active', 'rejected', 'superseded')),
  created_at timestamptz not null default pg_catalog.now(),
  activated_at timestamptz,
  unique (household_id, version),
  check (jsonb_typeof(rules) = 'object')
);

create unique index household_single_active_rules_idx
  on public.household_finance_rules (household_id)
  where status = 'active';

create table public.household_rule_approvals (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.household_finance_rules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'rejected')),
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default pg_catalog.now(),
  unique (rule_id, user_id)
);

create index household_finance_rules_household_status_idx
  on public.household_finance_rules (household_id, status, version desc);

-- -----------------------------------------------------------------------------
-- Simulated wallets and financial activity
-- -----------------------------------------------------------------------------
create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  wallet_type text not null check (wallet_type in ('shared', 'personal')),
  owner_user_id uuid references auth.users(id) on delete restrict,
  name text not null,
  currency text not null default 'IDR' check (currency ~ '^[A-Z]{3}$'),
  simulated_balance numeric(14,2) not null default 0 check (simulated_balance >= 0),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, household_id),
  check (
    (wallet_type = 'shared' and owner_user_id is null)
    or (wallet_type = 'personal' and owner_user_id is not null)
  )
);

create index wallets_household_status_idx on public.wallets (household_id, status);
create index wallets_owner_idx on public.wallets (owner_user_id) where owner_user_id is not null;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  wallet_id uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  transaction_type text not null check (transaction_type in ('income', 'expense', 'transfer')),
  category text,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'IDR' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'on_hold', 'approved', 'executed', 'rejected', 'cancelled', 'failed')),
  source text not null default 'user' check (source in ('user', 'agent', 'system')),
  requires_approval boolean not null default false,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default pg_catalog.now(),
  executed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (wallet_id, household_id)
    references public.wallets(id, household_id) on delete restrict,
  check (jsonb_typeof(metadata) = 'object')
);

create unique index transactions_idempotency_idx
  on public.transactions (created_by, idempotency_key)
  where idempotency_key is not null;
create index transactions_household_occurred_idx
  on public.transactions (household_id, occurred_at desc);
create index transactions_wallet_status_idx
  on public.transactions (wallet_id, status, created_at desc);

create table public.transaction_approvals (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  approver_user_id uuid not null references auth.users(id) on delete restrict,
  decision text not null default 'pending'
    check (decision in ('pending', 'approved', 'rejected', 'expired')),
  note text,
  requested_at timestamptz not null default pg_catalog.now(),
  decided_at timestamptz,
  unique (transaction_id, approver_user_id)
);

create index transaction_approvals_approver_idx
  on public.transaction_approvals (approver_user_id, decision, requested_at desc);

create table public.bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  title text not null,
  payee text,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'IDR' check (currency ~ '^[A-Z]{3}$'),
  due_date date not null,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'weekly', 'monthly', 'yearly')),
  status text not null default 'upcoming'
    check (status in ('upcoming', 'pending_approval', 'paid', 'overdue', 'cancelled')),
  paid_transaction_id uuid references public.transactions(id) on delete set null,
  notes text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index bills_household_due_date_idx on public.bills (household_id, due_date, status);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  category text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'IDR' check (currency ~ '^[A-Z]{3}$'),
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (period_end >= period_start),
  unique (household_id, category, period_start, period_end)
);

create index budgets_household_period_idx on public.budgets (household_id, period_start, period_end);

create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();
create trigger bills_set_updated_at
  before update on public.bills
  for each row execute function public.set_updated_at();
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- AI conversations and audit trail
-- -----------------------------------------------------------------------------
create table public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  title text,
  visibility text not null default 'private' check (visibility in ('private', 'shared')),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (visibility <> 'shared' or household_id is not null)
);

create index agent_conversations_user_updated_idx
  on public.agent_conversations (user_id, updated_at desc);
create index agent_conversations_household_idx
  on public.agent_conversations (household_id, updated_at desc)
  where visibility = 'shared';

create table public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index agent_messages_conversation_created_idx
  on public.agent_messages (conversation_id, created_at);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references public.households(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  outcome text not null check (outcome in ('success', 'denied', 'failed', 'pending')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  check (jsonb_typeof(details) = 'object')
);

create index audit_events_household_created_idx
  on public.audit_events (household_id, created_at desc);
create index audit_events_actor_created_idx
  on public.audit_events (actor_user_id, created_at desc);

create trigger agent_conversations_set_updated_at
  before update on public.agent_conversations
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.onboarding_responses enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invitations enable row level security;
alter table public.household_finance_rules enable row level security;
alter table public.household_rule_approvals enable row level security;
alter table public.wallets enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_approvals enable row level security;
alter table public.bills enable row level security;
alter table public.budgets enable row level security;
alter table public.agent_conversations enable row level security;
alter table public.agent_messages enable row level security;
alter table public.audit_events enable row level security;

-- Profiles and personal onboarding answers are private to the user.
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy onboarding_responses_select_own on public.onboarding_responses
  for select to authenticated using (user_id = (select auth.uid()));
create policy onboarding_responses_insert_own on public.onboarding_responses
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy onboarding_responses_update_own on public.onboarding_responses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy onboarding_responses_delete_own on public.onboarding_responses
  for delete to authenticated using (user_id = (select auth.uid()));

-- A creator can see their new household before joining it as its owner.
create policy households_select_member_or_creator on public.households
  for select to authenticated
  using (created_by = (select auth.uid()) or public.is_household_member(id));
create policy households_insert_creator on public.households
  for insert to authenticated
  with check (created_by = (select auth.uid()));
-- Household status and settings are changed through validated server-side handlers.

create policy household_members_select_self_or_member on public.household_members
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_household_member(household_id));
create policy household_members_insert_owner_self on public.household_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and role = 'owner'
    and status = 'active'
    and exists (
      select 1 from public.households h
      where h.id = household_id and h.created_by = (select auth.uid())
    )
  );

-- Invitations (including token hashes) are accessed only through authenticated server routes.

-- Shared rules and approval decisions are readable by household members.
-- Mutations go through server-side handlers so the pair-approval rule cannot be bypassed.
create policy household_finance_rules_select_members on public.household_finance_rules
  for select to authenticated using (public.is_household_member(household_id));
create policy household_rule_approvals_select_members on public.household_rule_approvals
  for select to authenticated
  using (
    exists (
      select 1 from public.household_finance_rules r
      where r.id = rule_id and public.is_household_member(r.household_id)
    )
  );

-- Wallet list: household wallets are shared; personal wallets are visible only to their owner.
create policy wallets_select_allowed on public.wallets
  for select to authenticated
  using (
    (wallet_type = 'personal' and owner_user_id = (select auth.uid()))
    or (wallet_type = 'shared' and public.is_household_member(household_id))
  );

-- Transaction rows inherit visibility from their wallet.
create policy transactions_select_allowed on public.transactions
  for select to authenticated
  using (
    exists (
      select 1 from public.wallets w
      where w.id = wallet_id
        and w.household_id = transactions.household_id
        and (
          (w.wallet_type = 'personal' and w.owner_user_id = (select auth.uid()))
          or (w.wallet_type = 'shared' and public.is_household_member(w.household_id))
        )
    )
  );

create policy transaction_approvals_select_members on public.transaction_approvals
  for select to authenticated
  using (
    approver_user_id = (select auth.uid())
    or exists (
      select 1 from public.transactions t
      where t.id = transaction_id and public.is_household_member(t.household_id)
    )
  );

create policy bills_select_members on public.bills
  for select to authenticated using (public.is_household_member(household_id));
create policy budgets_select_members on public.budgets
  for select to authenticated using (public.is_household_member(household_id));

create policy agent_conversations_select_allowed on public.agent_conversations
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (visibility = 'shared' and public.is_household_member(household_id))
  );
create policy agent_messages_select_allowed on public.agent_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.agent_conversations c
      where c.id = conversation_id
        and (
          c.user_id = (select auth.uid())
          or (c.visibility = 'shared' and public.is_household_member(c.household_id))
        )
    )
  );

create policy audit_events_select_members on public.audit_events
  for select to authenticated
  using (household_id is not null and public.is_household_member(household_id));

-- -----------------------------------------------------------------------------
-- Explicit API permissions. RLS remains the row-level guardrail.
-- Critical financial writes intentionally have no authenticated write grants/policies;
-- the application will add narrow, authenticated server-side operations next.
-- -----------------------------------------------------------------------------
revoke all on table
  public.profiles,
  public.onboarding_responses,
  public.households,
  public.household_members,
  public.household_invitations,
  public.household_finance_rules,
  public.household_rule_approvals,
  public.wallets,
  public.transactions,
  public.transaction_approvals,
  public.bills,
  public.budgets,
  public.agent_conversations,
  public.agent_messages,
  public.audit_events
from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, insert on public.households to authenticated;
grant select, insert on public.household_members to authenticated;
-- No direct browser grant on household_invitations; token hashes stay server-only.
grant select, insert, update, delete on public.onboarding_responses to authenticated;
grant select on public.household_finance_rules to authenticated;
grant select on public.household_rule_approvals to authenticated;
grant select on public.wallets to authenticated;
grant select on public.transactions to authenticated;
grant select on public.transaction_approvals to authenticated;
grant select on public.bills to authenticated;
grant select on public.budgets to authenticated;
grant select on public.agent_conversations to authenticated;
grant select on public.agent_messages to authenticated;
grant select on public.audit_events to authenticated;

