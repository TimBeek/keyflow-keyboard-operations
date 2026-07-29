-- Een pincode die iemand anders heeft bedacht en die blijft staan, is geen
-- pincode: hij staat in een chatvenster, op een briefje, in een mailtje. Een
-- door management gezette code is daarom tijdelijk — bij de eerste aanmelding
-- kiest de gebruiker zelf.

alter table pilot_credentials
  add column if not exists must_change_pin boolean not null default true;

-- De bestaande codes zijn door mij gezet en dus per definitie tijdelijk.
update pilot_credentials set must_change_pin = true;
