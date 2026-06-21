ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (type IN (
  'deposit','withdraw','trade_open','trade_close',
  'binary_open','binary_close',
  'withdraw_hold','withdraw_refund','withdraw_paid','admin_withdraw','admin_credit','admin_debit',
  'referral_commission','bonus','fee','reconcile'
));