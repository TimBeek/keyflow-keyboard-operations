-- Bij migratie 0038 kregen negen hangmappen een beginstand, maar geen boeking.
--
-- Daardoor lag er voorraad die door niets werd verklaard: de optelsom van alle
-- boekingen kwam 177 vellen lager uit dan wat er in de kast staat. Dat is
-- precies de controle die moet aanslaan als er een afboeking zoekraakt, en die
-- kon zijn werk niet meer doen zolang er een verschil van 177 in stond.
--
-- Deze beginstanden krijgen alsnog hun boeking, met dezelfde reden als de
-- oorspronkelijke import: het zijn geen leveringen en geen verbruik, maar het
-- vastleggen van wat er al lag.

insert into inventory_transactions (
  sku_id, location_id, type, quantity_delta, reason_code, notes,
  reference_type, idempotency_key, performed_by
)
select
  s.id,
  b.location_id,
  'opening',
  b.on_hand,
  'production_source_bootstrap',
  'Beginstand bij het bruikbaar maken van deze hangmap.',
  'inventory_source',
  'beginstand-0041-' || s.sku,
  '00000000-0000-0000-0000-000000000001'
from inventory_balances b
join sticker_skus s on s.id = b.sku_id
where b.on_hand > 0
  and not exists (
    select 1 from inventory_transactions t where t.sku_id = b.sku_id
  )
on conflict (idempotency_key) do nothing;
