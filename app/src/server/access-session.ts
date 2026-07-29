import "server-only";
import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import type { UserRole } from "@/domain/access-control";
import {
  afterFailedAttempt,
  afterSuccess,
  isLockedOut,
  lockoutMessage,
  type LockoutState,
} from "@/domain/pin-lockout";
import { pilotActorFor } from "@/domain/pilot-actors";
import { requirePermission } from "./authorization-service";
import { database } from "./database";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

export const ACCESS_COOKIE = "keyflow_access";

/** Een werkdag lang; daarna opnieuw aanmelden. */
const sessionSeconds = 24 * 60 * 60;

/** De werkvloer heeft geen slot; die staat aan een tafel met een laptop. */
export const openRole: UserRole = "employee";
export const lockedRoles: UserRole[] = ["management", "noviply"];

export class AccessCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccessCodeError";
  }
}

function sessionSecret() {
  const secret = process.env.KEYFLOW_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new AccessCodeError(
      "KEYFLOW_SESSION_SECRET ontbreekt of is te kort; een aanmelding kan niet veilig worden vastgehouden.",
    );
  }
  return secret;
}

/* ---------- de pincode ---------- */

export async function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(pin, salt, 32);
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function pinMatches(pin: string, stored: string) {
  const [scheme, salt, expected] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const derived = await scryptAsync(pin, salt, 32);
  const expectedBuffer = Buffer.from(expected, "hex");
  // Vergelijken in vaste tijd: de duur mag niet verraden hoeveel cijfers kloppen.
  return derived.length === expectedBuffer.length
    && timingSafeEqual(derived, expectedBuffer);
}

/** Wie er kan aanmelden. Alleen namen en rollen — nooit iets geheims. */
export async function listPilotAccounts() {
  const sql = database();
  const rows = await sql<{ id: string; display_name: string; role_code: UserRole }[]>`
    select u.id, u.display_name, ur.role_code
    from pilot_credentials c
    join users u on u.id = c.user_id
    join user_roles ur on ur.user_id = u.id
    where u.active
    order by ur.role_code, u.display_name
  `;
  return rows.map((row) => ({
    id: row.id,
    name: row.display_name,
    role: row.role_code,
  }));
}

/** Vier cijfers, en niet allemaal dezelfde of een rijtje op. */
export function validatePin(pin: string) {
  const value = pin.trim();
  if (!/^\d{4}$/.test(value)) {
    throw new AccessCodeError("Een pincode bestaat uit vier cijfers.");
  }
  if (new Set(value).size === 1) {
    throw new AccessCodeError("Kies geen pincode van vier dezelfde cijfers.");
  }
  if ("0123456789".includes(value) || "9876543210".includes(value)) {
    throw new AccessCodeError("Kies geen pincode die oploopt of aflopend telt.");
  }
  return value;
}

export async function setPin(userId: string, pin: string, temporary = true) {
  const value = temporary ? pin.trim() : validatePin(pin);
  if (!/^\d{4}$/.test(value)) {
    throw new AccessCodeError("Een pincode bestaat uit vier cijfers.");
  }
  const sql = database();
  await sql`
    insert into pilot_credentials (user_id, pin_hash, must_change_pin)
    values (${userId}, ${await hashPin(value)}, ${temporary})
    on conflict (user_id) do update
    set pin_hash = excluded.pin_hash,
        must_change_pin = excluded.must_change_pin,
        failed_attempts = 0,
        locked_until = null,
        updated_at = now()
  `;
}

/**
 * De gebruiker kiest zelf een nieuwe pincode. De oude moet erbij: anders kan
 * iemand die even achter een open scherm zit het slot omzetten.
 */
export async function changeOwnPin(userId: string, currentPin: string, newPin: string) {
  const value = validatePin(newPin);
  const sql = database();
  const [row] = await sql<{ pin_hash: string }[]>`
    select pin_hash from pilot_credentials where user_id = ${userId}
  `;
  if (!row || !(await pinMatches(currentPin.trim(), row.pin_hash))) {
    throw new AccessCodeError("De huidige pincode klopt niet.");
  }
  if (await pinMatches(value, row.pin_hash)) {
    throw new AccessCodeError("Kies een andere pincode dan de vorige.");
  }
  await setPin(userId, value, false);
}

export type SignInResult =
  | { ok: true; userId: string; role: UserRole; name: string; mustChangePin: boolean }
  | { ok: false; message: string };

export async function signInWithPin(userId: string, pin: string): Promise<SignInResult> {
  const sql = database();
  const [row] = await sql<{
    pin_hash: string;
    failed_attempts: number;
    locked_until: Date | null;
    must_change_pin: boolean;
    display_name: string;
    role_code: UserRole;
  }[]>`
    select c.pin_hash, c.failed_attempts, c.locked_until, c.must_change_pin,
           u.display_name, ur.role_code
    from pilot_credentials c
    join users u on u.id = c.user_id
    join user_roles ur on ur.user_id = u.id
    where c.user_id = ${userId} and u.active
    limit 1
  `;
  // Onbekende gebruiker en verkeerde pincode geven dezelfde melding: het
  // verschil zou verraden welke accounts bestaan.
  if (!row) return { ok: false, message: "Die pincode klopt niet." };

  const now = new Date();
  const state: LockoutState = {
    failedAttempts: row.failed_attempts,
    lockedUntil: row.locked_until,
  };
  if (isLockedOut(state, now)) {
    return { ok: false, message: lockoutMessage(state, now) };
  }

  if (!(await pinMatches(pin.trim(), row.pin_hash))) {
    const next = afterFailedAttempt(state, now);
    await sql`
      update pilot_credentials
      set failed_attempts = ${next.failedAttempts}, locked_until = ${next.lockedUntil}
      where user_id = ${userId}
    `;
    return { ok: false, message: lockoutMessage(next, now) };
  }

  const cleared = afterSuccess();
  await sql`
    update pilot_credentials
    set failed_attempts = ${cleared.failedAttempts}, locked_until = ${cleared.lockedUntil}
    where user_id = ${userId}
  `;
  return {
    ok: true,
    userId,
    role: row.role_code,
    name: row.display_name,
    mustChangePin: row.must_change_pin,
  };
}

/* ---------- het bewijs dat je binnen bent ---------- */

function sign(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

/**
 * Een tijdelijke pincode geeft een halve sessie: `provisional` staat mee in
 * het bewijs, en zolang die aan staat mag je niets anders dan je eigen code
 * kiezen. Zonder dat zou de code die per mail of appje is rondgestuurd blijven
 * werken voor wie het aanmeldscherm overslaat — en die code staat dan al in
 * iemands berichtgeschiedenis.
 */
export function createAccessToken(
  userId: string,
  role: UserRole,
  nowSeconds: number,
  provisional = false,
) {
  const payload = `${userId}.${role}.${nowSeconds + sessionSeconds}.${provisional ? "t" : "f"}`;
  return `${payload}.${sign(payload)}`;
}

export type AccessClaim = { userId: string; role: UserRole; provisional: boolean };

export function readAccessToken(
  token: string | undefined,
  nowSeconds: number,
): AccessClaim | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [userId, role, expiry, provisional, signature] = parts;
  const expected = sign(`${userId}.${role}.${expiry}.${provisional}`);
  // Ongeldige handtekening betekent geknoei, verlopen betekent opnieuw
  // aanmelden. Allebei: geen toegang.
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  if (Number(expiry) <= nowSeconds) return null;
  if (!lockedRoles.includes(role as UserRole)) return null;
  if (provisional !== "t" && provisional !== "f") return null;
  return { userId, role: role as UserRole, provisional: provisional === "t" };
}

/**
 * Wie de server aan dit verzoek toekent. Niet wat de browser beweert: zonder
 * geldig bewijs is iedereen werkvloer, en die mag niets van management.
 *
 * Wie nog op een tijdelijke code zit, telt hier ook als werkvloer. Alleen de
 * route die de pincode wijzigt vraagt naar het echte account.
 */
export async function resolvePilotClaim(): Promise<AccessClaim> {
  const claim = await resolveSignedClaim();
  return claim.provisional ? { userId: pilotActorFor(openRole), role: openRole, provisional: true } : claim;
}

/** Het account achter het bewijs, ook als de pincode nog tijdelijk is. */
export async function resolveSignedClaim(): Promise<AccessClaim> {
  const jar = await cookies();
  return readAccessToken(jar.get(ACCESS_COOKIE)?.value, Math.floor(Date.now() / 1000))
    ?? { userId: pilotActorFor(openRole), role: openRole, provisional: false };
}

export async function resolvePilotActorId() {
  return (await resolvePilotClaim()).userId;
}

/* ---------- accountbeheer door management ---------- */

/** Een tijdelijke pincode om mee te beginnen; de gebruiker kiest zelf een eigen. */
export function generateTemporaryPin() {
  // Uit de veilige generator, en nooit een code die validatePin zou afwijzen.
  for (;;) {
    const pin = String(randomBytes(2).readUInt16BE(0) % 10_000).padStart(4, "0");
    try {
      return validatePin(pin);
    } catch {
      // opnieuw proberen
    }
  }
}

export async function createPilotAccount(name: string, role: UserRole, actorId: string) {
  await requirePermission(actorId, "users.manage");
  const displayName = name.trim();
  if (displayName.length < 2) {
    throw new AccessCodeError("Vul een naam in.");
  }
  if (!lockedRoles.includes(role)) {
    throw new AccessCodeError("De werkvloer heeft geen account nodig — die komt zonder pincode binnen.");
  }

  const sql = database();
  const temporaryPin = generateTemporaryPin();
  const userId = randomUUID();

  await sql.begin(async (transaction) => {
    const [existing] = await transaction<{ id: string }[]>`
      select id from users where display_name = ${displayName} limit 1
    `;
    if (existing) {
      throw new AccessCodeError("Er bestaat al iemand met deze naam.");
    }
    await transaction`
      insert into users (id, external_id, display_name, email)
      values (${userId}, ${`keyflow-${userId}`}, ${displayName},
              ${`${displayName.toLowerCase().replace(/[^a-z0-9]+/g, ".")}@local.invalid`})
    `;
    await transaction`
      insert into user_roles (user_id, role_code, assigned_by)
      values (${userId}, ${role}, ${actorId})
    `;
    await transaction`
      insert into pilot_credentials (user_id, pin_hash, must_change_pin)
      values (${userId}, ${await hashPin(temporaryPin)}, true)
    `;
  });

  // De tijdelijke code komt hier één keer terug en wordt nergens bewaard.
  return { id: userId, name: displayName, role, temporaryPin };
}

export async function resetAccountPin(userId: string, actorId: string) {
  await requirePermission(actorId, "users.manage");
  const temporaryPin = generateTemporaryPin();
  await setPin(userId, temporaryPin, true);
  return { temporaryPin };
}

export async function deactivateAccount(userId: string, actorId: string) {
  await requirePermission(actorId, "users.manage");
  if (userId === actorId) {
    throw new AccessCodeError("Je kunt je eigen toegang niet intrekken.");
  }
  const sql = database();
  // De persoon blijft in de historie staan; alleen aanmelden kan niet meer.
  await sql`delete from pilot_credentials where user_id = ${userId}`;
}
