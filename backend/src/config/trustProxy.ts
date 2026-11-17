/**
 * Express "trust proxy" from the TRUST_PROXY environment variable (finding
 * S-22).
 *
 * The setting decides which hops may report the client address through
 * X-Forwarded-For, and so what `req.ip` is for rate limiting, the access log
 * and the IP columns of refresh_token / password_reset_otp. Getting it wrong
 * either merges every user behind the proxy's address (one shared rate-limit
 * budget) or lets a client spoof its address with a forged header.
 *
 * Accepted values:
 *   unset        1 hop (the previous fixed setting)
 *   "0".."10"    trust that many hops in front of Node
 *   "false"      trust no proxy: req.ip is the TCP peer
 *   list         comma-separated addresses, CIDR subnets or the keywords
 *                loopback / linklocal / uniquelocal, e.g. "loopback" when
 *                Nginx runs on the same server. Preferred: a client that
 *                connects to Node directly cannot spoof its address.
 * "true" (trust every hop) is refused: it lets any client choose its IP.
 */
export type TrustProxySetting = number | false | string;

export const DEFAULT_TRUST_PROXY: TrustProxySetting = 1;

export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  if (raw === undefined) return DEFAULT_TRUST_PROXY;
  const value = raw.trim();
  if (value === '') return DEFAULT_TRUST_PROXY;
  if (/^\d+$/.test(value)) {
    const hops = Number(value);
    if (hops > 10) throw new Error(`TRUST_PROXY hop count ${hops} is not plausible (max 10)`);
    return hops === 0 ? false : hops;
  }
  if (value.toLowerCase() === 'false') return false;
  if (value.toLowerCase() === 'true') {
    throw new Error(
      'TRUST_PROXY=true would trust X-Forwarded-For from any client. Use the hop count or the proxy address(es) instead.',
    );
  }
  const entries = value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (entries.length === 0) return DEFAULT_TRUST_PROXY;
  return entries.join(', ');
}
