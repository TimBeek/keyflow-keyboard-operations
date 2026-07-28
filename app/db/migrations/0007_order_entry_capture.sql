alter table conversion_jobs
  add column if not exists sale_value_band text,
  add column if not exists model_lookup_query text;

alter table conversion_jobs
  drop constraint if exists conversion_jobs_sale_value_band_check;

alter table conversion_jobs
  add constraint conversion_jobs_sale_value_band_check
  check (
    sale_value_band is null
    or sale_value_band in (
      'under_100',
      '100_199',
      '200_299',
      '300_399',
      '400_499',
      '500_plus'
    )
  );

comment on column conversion_jobs.sale_value_band is
  'Door werknemer gekozen verkoopwaardeklasse; exact bedrag kan later uit het ordersysteem komen.';

comment on column conversion_jobs.model_lookup_query is
  'Oorspronkelijke korte modelinvoer, bijvoorbeeld 5420, vóór resolutie naar laptop_model_id.';
