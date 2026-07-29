/**
 * Zet of wijzigt de pincode van een aanmeldbaar account. De pincode zelf wordt
 * niet bewaard, alleen een scrypt-afdruk — kwijt is dus echt kwijt.
 *
 * Gebruik: node scripts/set-pin.mjs "<naam>" <4 cijfers> [rol]
 * Bestaat de naam nog niet, dan wordt het account aangemaakt met die rol.
 */
import { randomBytes, scrypt } from "node:crypto";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import postgres from "postgres";

const scryptAsync = promisify(scrypt);
const [name, pin, role = "management"] = process.argv.slice(2);

if (!name || !/^\d{4}$/.test(pin ?? "") || !["management", "noviply"].includes(role)) {
  console.error('Gebruik: node scripts/set-pin.mjs "<naam>" <4 cijfers> [management|noviply]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL ontbreekt.");
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = `scrypt$${salt}$${(await scryptAsync(pin, salt, 32)).toString("hex")}`;
const sql = postgres(process.env.DATABASE_URL, { max: 1, ssl: "require" });

try {
  await sql.begin(async (tx) => {
    const [existing] = await tx`select id from users where display_name = ${name} limit 1`;
    const userId = existing?.id ?? randomUUID();
    if (!existing) {
      await tx`
        insert into users (id, external_id, display_name, email)
        values (${userId}, ${`keyflow-${userId}`}, ${name},
                ${`${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@local.invalid`})
      `;
    }
    await tx`
      insert into user_roles (user_id, role_code, assigned_by)
      values (${userId}, ${role}, '00000000-0000-0000-0000-000000000001')
      on conflict (user_id, role_code) do nothing
    `;
    // Een code die iemand anders zet is per definitie tijdelijk: hij staat in
    // een chatvenster of op een briefje. Bij de eerste aanmelding kiest de
    // gebruiker zelf een eigen — en die blijft daarna staan.
    await tx`
      insert into pilot_credentials (user_id, pin_hash, must_change_pin)
      values (${userId}, ${hash}, true)
      on conflict (user_id) do update
      set pin_hash = excluded.pin_hash, must_change_pin = true, failed_attempts = 0,
          locked_until = null, updated_at = now()
    `;
    console.log(`Pincode gezet voor ${name} (${role}).`);
  });
} finally {
  await sql.end();
}
