-- Een slot op de deur, met een naam eraan.
--
-- De werkvloer moet zonder drempel naar binnen kunnen: die staat aan een tafel
-- met een laptop in de hand. Management en Noviply niet — daar zitten beleid,
-- inkoop en een externe partij achter.
--
-- Een gedeelde code per rol zou werken, maar dan staat er in het logboek alleen
-- "management". Met een eigen pincode per persoon staat er wie het deed. Vier
-- cijfers zijn zo geraden, dus gaat de deur na een paar misslagen op slot —
-- dat is wat een pincode veilig maakt, niet de lengte.
--
-- De pincode zelf staat er niet in, alleen een scrypt-afdruk met eigen zout.

create table pilot_credentials (
  user_id uuid primary key references users(id),
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  constraint pilot_credentials_hash_not_blank check (length(pin_hash) >= 32),
  constraint pilot_credentials_attempts_sane check (failed_attempts between 0 and 100)
);

-- Wie er mag aanmelden, is af te lezen aan wie een pincode heeft.
create index pilot_credentials_locked_idx on pilot_credentials (locked_until)
  where locked_until is not null;
