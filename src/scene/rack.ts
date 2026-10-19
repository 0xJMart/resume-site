// The physical rack, top to bottom. Change hardware here; the scene and the text list both read it.
// u = first rack unit (1 = top), h = height in U. Specs are public-safe: no IPs, hostnames or app inventory.

export type Kind = 'switch' | 'pis' | 'screen' | 'blank' | 'pdu' | 'ups';

export interface RackItem {
  id: string;
  u: number;
  h: number;
  kind: Kind;
  label: string;
  specs: string[];
  runs?: string[];
  future?: boolean;
}

export interface Node {
  name: string;
  role: string;
  port: number; // switch port it's cabled to
}

export const RACK_U = 8;

// Left to right as mounted in the Pi panel; port = switch port it's cabled to
export const NODES: Node[] = [
  { name: 'node-3', role: 'worker · drives the rack screen', port: 1 },
  { name: 'control-node', role: 'k0s controller + worker', port: 2 },
  { name: 'node-1', role: 'worker', port: 5 },
  { name: 'node-2', role: 'worker', port: 7 },
];

export const RACK: RackItem[] = [
  {
    id: 'screen', u: 1, h: 2, kind: 'screen', label: '7.84″ rack display',
    specs: ['1280 × 400 touchscreen, 2U', 'Kiosk pod on node-3: cage + Chromium', 'Face reacts to Prometheus + Alertmanager', 'Swipe for per-node graphs'],
  },
  {
    id: 'switch', u: 3, h: 1, kind: 'switch', label: 'UniFi USW Ultra 210W',
    specs: ['7 × 1 GbE PoE+ out, 1 uplink', '210 W budget; powers all four Pis', 'Uplink to the UniFi gateway', 'Per-port PoE watts scraped by unpoller'],
  },
  {
    id: 'pis', u: 4, h: 2, kind: 'pis', label: '4 × Raspberry Pi 5 (k0s cluster)',
    specs: ['Cortex-A76, 4 cores, 8 GB each', 'NVMe boot via M.2, PoE HATs', 'Debian 13, k0s v1.34', 'Flux GitOps from a single repo'],
    runs: ['Traefik + MetalLB ingress', 'Keycloak SSO, oauth2-proxy', 'CloudNativePG Postgres', 'kube-prometheus-stack + exporters', 'Sealed Secrets, cert-manager', 'Media, file sync, password manager', 'This website'],
  },
  { id: 'blank', u: 6, h: 3, kind: 'blank', label: '3 × 1U blank panels', specs: ['Room for a PDU and whatever comes next'] },
];

export const NAS = {
  id: 'nas',
  label: 'Unraid NAS',
  specs: ['Dual parity, XFS array + cache', 'NFS + SMB for cluster volumes', 'node-exporter + Unraid textfile metrics', 'Backup target for databases'],
};
