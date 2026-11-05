// Age against server time plus elapsed client time, rather than a possibly wrong device clock.
export function trackingState(data, elapsed = 0) {
  if (!data || data.state === 'off') return 'off';
  const now = Date.parse(data.server_time || new Date().toISOString()) + Math.max(0,elapsed);
  const last = Math.min(Date.parse(data.updated_at), Date.parse(data.position?.observed_at));
  if (now >= Date.parse(data.expires_at) || (data.updated_at && now-Date.parse(data.updated_at)>=300000)) return 'ended';
  if (!data.position) return 'waiting';
  return data.state === 'stale' || now-last>60000 ? 'stale' : 'live';
}

export function motion(from, to, progress) {
  // Only interpolate between received fixes; never predict motion after the latest fix.
  const t = Math.max(0,Math.min(1,progress));
  const delta = ((to[1]-from[1]+540)%360)-180;
  return [from[0]+(to[0]-from[0])*t, ((from[1]+delta*t+540)%360)-180];
}
