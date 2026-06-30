-- Binary wins should return roughly 20% profit: $1 stake -> $1.20 payout.

create or replace function public.settle_trade(
  _trade_id uuid,
  _won boolean,
  _exit_price numeric default null,
  _multiplier numeric default 1.20
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  _trade public.trades;
  _payout numeric;
begin
  if auth.uid() is null then
    raise exception 'Unauthorized';
  end if;

  select * into _trade
  from public.trades
  where id = _trade_id and user_id = auth.uid()
  for update;

  if _trade.id is null then
    raise exception 'Trade not found';
  end if;
  if _trade.status <> 'open' then
    return jsonb_build_object('ok', true, 'payout', _trade.payout);
  end if;

  _payout := case when _won then round((_trade.stake * _multiplier)::numeric, 2) else 0 end;

  update public.trades
  set status = case when _won then 'won'::public.trade_status else 'lost'::public.trade_status end,
      exit_price = _exit_price,
      payout = _payout,
      closed_at = now()
  where id = _trade_id;

  if _payout > 0 then
    if _trade.account_type = 'real' then
      update public.profiles set balance_usd = balance_usd + _payout where id = auth.uid();
    else
      update public.profiles set demo_balance_usd = demo_balance_usd + _payout where id = auth.uid();
    end if;

    insert into public.transactions (user_id, kind, method, account_type, amount, currency, amount_usd, status, is_virtual, meta)
    values (auth.uid(), 'trade_payout', 'system', _trade.account_type, _payout, 'USD', _payout, 'completed', _trade.account_type = 'demo', jsonb_build_object('trade_id', _trade.id));
  end if;

  return jsonb_build_object('ok', true, 'payout', _payout);
end;
$$;

grant execute on function public.settle_trade(uuid, boolean, numeric, numeric) to authenticated;

notify pgrst, 'reload schema';
