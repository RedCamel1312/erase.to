const candidate = import.meta.env.VITE_ONION_URL as string | undefined;
export const onionUrl =
  candidate && /^http:\/\/[a-z2-7]{56}\.onion\/?$/.test(candidate)
    ? new URL(candidate).origin + '/'
    : null;
