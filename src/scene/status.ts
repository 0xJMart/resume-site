// Public, sanitized cluster status served by the rack-display status service at /api/status.
// Field allowlist must match status/server.js publicStatus() in rack-display.

export interface NodeStatus {
  name: string;
  ready: boolean;
  cpu: number; // 0–100
  temp: number | null; // °C
}

export interface PublicStatus {
  updatedAt: string;
  stale: boolean;
  night: boolean;
  emote: string;
  label: string;
  nodes: NodeStatus[];
  podsHealthy: boolean;
  fluxHealthy: boolean;
  sitesUp: string;
}

export type Feed = { mode: 'live' | 'mock' | 'offline'; status: PublicStatus | null };

const MOCK_EMOTES = ['idle', 'backup', 'fluxRec', 'cpu', 'idle', 'tap', 'nodeDown', 'idle', 'crash', 'sleep'];

export function mockStatus(t: number): PublicStatus {
  const emote = MOCK_EMOTES[Math.floor(t / 8) % MOCK_EMOTES.length];
  const names = ['control-node', 'node-1', 'node-2', 'node-3'];
  return {
    updatedAt: new Date().toISOString(),
    stale: false,
    night: emote === 'sleep',
    emote,
    label: emote === 'idle' ? 'all good' : `demo: ${emote}`,
    nodes: names.map((name, i) => ({
      name,
      ready: !(emote === 'nodeDown' && i === 2),
      cpu: Math.round((emote === 'cpu' ? 70 : 6) + 5 * Math.sin(t / 3 + i)),
      temp: Math.round(48 + 4 * Math.sin(t / 7 + i)),
    })),
    podsHealthy: emote !== 'crash',
    fluxHealthy: true,
    sitesUp: '8/8',
  };
}

export async function fetchStatus(signal?: AbortSignal): Promise<PublicStatus> {
  const r = await fetch('/api/status', { signal, headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
