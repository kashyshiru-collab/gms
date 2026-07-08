create or replace function public.apply_transaction(
  _transaction_id uuid,
  _status public.transaction_status,
  _meta jsonb default '{}'::jsonb
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  _tx public.transactions;
  _should_credit boolean;
begin
  if auth.uid() is null and current_setting('role', true) <> 'service_role' then
    raise exception 'Unauthorized';
  end if;

  select * into _tx
  from public.transactions
  where id = _transaction_id
  for update;

  if _tx.id is null then
    raise exception 'Transaction not found';
  end if;

  _should_credit := _status = 'completed'
    and _tx.kind = 'deposit'
    and (
      _tx.status <> 'completed'
      or coalesce(_tx.meta->>'credited_at', '') = ''
    );

  if _should_credit then
    if _tx.account_type = 'real' then
      update public.profiles
      set balance_usd = coalesce(balance_usd, 0) + coalesce(_tx.amount_usd, 0),
          balance_ksh = coalesce(balance_ksh, 0) + case when _tx.currency = 'KSH' then coalesce(_tx.amount, 0) else 0 end
      where id = _tx.user_id;
    else
      update public.profiles
      set demo_balance_usd = coalesce(demo_balance_usd, 0) + coalesce(_tx.amount_usd, 0),
          balance_ksh = coalesce(balance_ksh, 0) + case when _tx.currency = 'KSH' then coalesce(_tx.amount, 0) else 0 end
      where id = _tx.user_id;
    end if;
  end if;

  if _tx.kind = 'withdraw'
     and _tx.status not in ('failed', 'cancelled')
     and _status in ('failed', 'cancelled') then
    if _tx.account_type = 'real' then
      update public.profiles
      set balance_usd = coalesce(balance_usd, 0) + coalesce(_tx.amount_usd, 0)
      where id = _tx.user_id;
    else
      update public.profiles
      set demo_balance_usd = coalesce(demo_balance_usd, 0) + coalesce(_tx.amount_usd, 0)
      where id = _tx.user_id;
    end if;
  end if;

  if _tx.kind = 'withdraw'
     and _tx.status in ('failed', 'cancelled')
     and _status = 'completed' then
    if _tx.account_type = 'real' then
      update public.profiles
      set balance_usd = greatest(coalesce(balance_usd, 0) - coalesce(_tx.amount_usd, 0), 0)
      where id = _tx.user_id;
    else
      update public.profiles
      set demo_balance_usd = greatest(coalesce(demo_balance_usd, 0) - coalesce(_tx.amount_usd, 0), 0)
      where id = _tx.user_id;
    end if;
  end if;

  update public.transactions
  set status = _status,
      meta = coalesce(meta, '{}'::jsonb)
        || coalesce(_meta, '{}'::jsonb)
        || case
             when _should_credit then jsonb_build_object(
               'credited_at', now(),
               'credited_by', 'apply_transaction'
             )
             else '{}'::jsonb
           end
  where id = _transaction_id
  returning * into _tx;

  update public.transactions
  set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('credited_at', now(), 'credited_by', 'backfill')
  where kind = 'deposit'
    and status = 'completed'
    and coalesce(meta->>'credited_at', '') = ''
    and id = _transaction_id;

  return _tx;
end;
$$;

with completed_uncredited_deposits as (
  select id, user_id, account_type, amount_usd, currency, amount
  from public.transactions
  where kind = 'deposit'
    and status = 'completed'
    and coalesce(meta->>'credited_at', '') = ''
)
update public.profiles p
set balance_usd = coalesce(p.balance_usd, 0) + coalesce(d.amount_usd, 0),
    balance_ksh = coalesce(p.balance_ksh, 0) + case when d.currency = 'KSH' then coalesce(d.amount, 0) else 0 end
from completed_uncredited_deposits d
where p.id = d.user_id
  and d.account_type = 'real';

with completed_uncredited_deposits as (
  select id, user_id, account_type, amount_usd, currency, amount
  from public.transactions
  where kind = 'deposit'
    and status = 'completed'
    and coalesce(meta->>'credited_at', '') = ''
)
update public.profiles p
set demo_balance_usd = coalesce(p.demo_balance_usd, 0) + coalesce(d.amount_usd, 0),
    balance_ksh = coalesce(p.balance_ksh, 0) + case when d.currency = 'KSH' then coalesce(d.amount, 0) else 0 end
from completed_uncredited_deposits d
where p.id = d.user_id
  and d.account_type = 'demo';

update public.transactions
set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('credited_at', now(), 'credited_by', 'backfill')
where kind = 'deposit'
  and status = 'completed'
  and coalesce(meta->>'credited_at', '') = '';

grant execute on function public.apply_transaction(uuid, public.transaction_status, jsonb)
  to service_role;

notify pgrst, 'reload schema';
