/**
 * Routetests roepen de handlers rechtstreeks aan, buiten een verzoek, en dan
 * bestaat `cookies()` niet. Een lege koekjestrommel is precies de juiste
 * stand-in: de server valt dan terug op de werkvloer, en dat is ook in
 * productie de veilige uitgangspositie.
 */
export async function cookies() {
  return {
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  };
}

export async function headers() {
  return new Headers();
}
