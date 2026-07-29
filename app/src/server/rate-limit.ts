import "server-only";

/**
 * Een rem op schrijfacties.
 *
 * De werkvloer komt zonder login binnen — dat is bewust, want die staat met een
 * laptop in zijn hand. Maar het betekent ook dat iedereen die het adres kent kan
 * schrijven. Eén iemand die zich vergist houden we hier niet tegen; een script
 * dat honderden afboekingen doet wel, en dat is het verschil tussen een foutje
 * en een onbruikbare voorraad.
 *
 * Bewust in het geheugen en niet in de database: dit hoeft niet exact te zijn,
 * en een teller die zelf de database belast helpt niet tegen overbelasting.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Hooguit dit aantal schrijfacties per minuut vanaf één plek. */
export const writeLimitPerMinute = 60;

const windowMs = 60_000;

export class RateLimitError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Te veel verzoeken achter elkaar. Wacht even en probeer het opnieuw.");
    this.name = "RateLimitError";
  }
}

/**
 * De sleutel is het IP-adres uit de proxyheader. Ontbreekt die, dan vallen alle
 * verzoeken in één emmer — strenger, en dat is de veilige kant.
 */
export function clientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "onbekend";
}

export function checkWriteLimit(request: Request, now = Date.now()) {
  const key = clientKey(request);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    // Oude emmers opruimen zodat de kaart niet blijft groeien.
    if (buckets.size > 5000) {
      for (const [otherKey, other] of buckets) {
        if (other.resetAt <= now) buckets.delete(otherKey);
      }
    }
    return;
  }

  bucket.count += 1;
  if (bucket.count > writeLimitPerMinute) {
    throw new RateLimitError(Math.ceil((bucket.resetAt - now) / 1000));
  }
}
