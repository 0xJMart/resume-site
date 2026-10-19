import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Edges, Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Face } from './face';
import { NAS, NODES, RACK, RACK_U, type RackItem } from './rack';
import { fetchStatus, mockStatus, type Feed, type NodeStatus, type PublicStatus } from './status';

// Scene units: 1 = 10 cm. A rack unit is 44.45 mm. y = 0 is the middle of the 8U mounting space.
const U = 0.4445;
const WIDTH = 2.54;
const DEPTH = 2.2;
const FRONT = DEPTH / 2;
const TOP = (RACK_U * U) / 2;
const FLOOR = -TOP - 0.32;
const uY = (u: number, h: number) => TOP - (u - 1 + h / 2) * U;

const C = {
  silver: '#d9dde1',
  panel: '#17191c',
  pcb: '#1f6b3a',
  steel: '#b9c0c8',
  unifi: '#eef0f2',
  ok: '#3ee07a',
  bad: '#ff4d6d',
  warn: '#ffb547',
  accent: '#4de1ff',
};

type Selectable = RackItem | typeof NAS;

/* ------------------------------ data feed ------------------------------ */

function useFeed(): Feed {
  const [feed, setFeed] = useState<Feed>({ mode: 'offline', status: null });
  useEffect(() => {
    const mock = new URLSearchParams(location.search).has('mock');
    if (mock) {
      const t0 = performance.now();
      const tick = () => setFeed({ mode: 'mock', status: mockStatus((performance.now() - t0) / 1000) });
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }
    let ctl = new AbortController();
    const load = async () => {
      ctl.abort();
      ctl = new AbortController();
      try {
        setFeed({ mode: 'live', status: await fetchStatus(ctl.signal) });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setFeed({ mode: 'offline', status: null });
      }
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { clearInterval(id); ctl.abort(); };
  }, []);
  return feed;
}

/* ------------------------------ parts ---------------------------------- */

// Parts are made of many meshes, so moving between two of them fires out-then-over. Clearing hover
// after a short grace period (cancelled by the next over) keeps the outline and cursor steady.
const hovered = new Set<string>();
const setCursor = () => { document.body.style.cursor = hovered.size ? 'pointer' : ''; };
const noRaycast = () => null;

function Hoverable({ item, selected, onSelect, children, size, position }: {
  item: Selectable; selected: boolean; onSelect: (i: Selectable) => void;
  children: ReactNode; size: [number, number, number]; position: [number, number, number];
}) {
  const [hover, setHover] = useState(false);
  const leave = useRef<ReturnType<typeof setTimeout>>(undefined);
  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    clearTimeout(leave.current);
    hovered.add(item.id);
    setCursor();
    setHover(true);
  };
  const out = () => {
    clearTimeout(leave.current);
    leave.current = setTimeout(() => {
      hovered.delete(item.id);
      setCursor();
      setHover(false);
    }, 60);
  };
  useEffect(() => () => { clearTimeout(leave.current); hovered.delete(item.id); setCursor(); }, [item.id]);
  return (
    <group position={position} onPointerOver={over} onPointerOut={out}
      onClick={(e) => { e.stopPropagation(); onSelect(item); }}>
      {children}
      {(hover || selected) && (
        <mesh position={[0, 0, 0.15]} raycast={noRaycast}>
          <boxGeometry args={[size[0] + 0.06, size[1] + 0.02, size[2] + 0.3]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Edges color={selected ? '#1F6B3A' : '#545B63'} lineWidth={selected ? 2 : 1} raycast={noRaycast} />
        </mesh>
      )}
    </group>
  );
}

const silver = <meshStandardMaterial color={C.silver} metalness={0.45} roughness={0.38} />;

function Bar({ size, position }: { size: [number, number, number]; position: [number, number, number] }) {
  return (
    <mesh position={position} castShadow receiveShadow>
      <boxGeometry args={size} />
      {silver}
    </mesh>
  );
}

// Alpha map for the top glass: opaque border, hex grid of round vent holes in the middle
function usePerforation(w: number, d: number) {
  return useMemo(() => {
    const px = 120, W = Math.round(w * px), H = Math.round(d * px);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#000';
    const r = 4.5, step = 15, rowH = step * Math.sqrt(3) / 2, margin = 0.22 * px;
    for (let row = 0, y = margin; y <= H - margin; row++, y += rowH) {
      for (let x = margin + (row % 2 ? step / 2 : 0); x <= W - margin; x += step) {
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    }
    return new THREE.CanvasTexture(c);
  }, [w, d]);
}

// DeskPi RackMate-style frame: brushed aluminium posts and rails, carry handles on top, small feet
function Frame() {
  const px = WIDTH / 2 + 0.04, pz = DEPTH / 2 - 0.08;
  const bottom = FLOOR + 0.1, top = TOP + 0.34;
  const handles = useMemo(() => [-1, 1].map((s) => new THREE.CatmullRomCurve3([
    new THREE.Vector3(s * (px - 0.06), top, pz - 0.05),
    new THREE.Vector3(s * (px - 0.06), top + 0.42, pz - 0.35),
    new THREE.Vector3(s * (px - 0.06), top + 0.46, 0),
    new THREE.Vector3(s * (px - 0.06), top + 0.42, -pz + 0.35),
    new THREE.Vector3(s * (px - 0.06), top, -pz + 0.05),
  ], false, 'centripetal')), [px, pz, top]);
  const topW = 2 * px - 0.14, topD = 2 * pz - 0.14;
  const perf = usePerforation(topW, topD);
  return (
    <group>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z], i) => (
        <group key={i}>
          <Bar size={[0.16, top - bottom, 0.16]} position={[x * px, (top + bottom) / 2, z * pz]} />
          <mesh position={[x * px, FLOOR + 0.05, z * pz]}>
            <cylinderGeometry args={[0.07, 0.08, 0.1, 16]} />
            <meshStandardMaterial color="#8d9196" metalness={0.7} roughness={0.4} />
          </mesh>
        </group>
      ))}
      {/* top and bottom rails, front/back and sides */}
      {[[top - 0.16, 0.32], [bottom + 0.1, 0.2]].map(([y, h], i) => (
        <group key={i}>
          {[-1, 1].map((z) => <Bar key={z} size={[2 * px + 0.16, h, 0.14]} position={[0, y, z * pz]} />)}
          {[-1, 1].map((x) => <Bar key={x} size={[0.14, h, 2 * pz]} position={[x * px, y, 0]} />)}
        </group>
      ))}
      {handles.map((c, i) => (
        <mesh key={i} castShadow>
          <tubeGeometry args={[c, 48, 0.065, 12, false]} />
          {silver}
        </mesh>
      ))}
      {/* perforated, black-tinted glass top, set inside the top rails */}
      <mesh position={[0, top - 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast} renderOrder={1}>
        <planeGeometry args={[topW, topD]} />
        <meshPhysicalMaterial color="#05070a" alphaMap={perf} transparent opacity={0.82} roughness={0.08} metalness={0.1} clearcoat={1} clearcoatRoughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* black-tinted glass side panels, set inside the posts and rails */}
      {[-1, 1].map((x) => (
        <mesh key={x} position={[x * px, (top - 0.32 + bottom + 0.2) / 2, 0]} rotation={[0, Math.PI / 2, 0]} raycast={noRaycast} renderOrder={1}>
          <planeGeometry args={[2 * pz - 0.16, top - 0.32 - (bottom + 0.2)]} />
          <meshPhysicalMaterial color="#05070a" transparent opacity={0.72} roughness={0.08} metalness={0.1} clearcoat={1} clearcoatRoughness={0.05} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function Screw({ x, y }: { x: number; y: number }) {
  return (
    <mesh position={[x, y, FRONT + 0.055]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.045, 0.045, 0.02, 16]} />
      <meshStandardMaterial color="#d6d9dc" metalness={0.9} roughness={0.25} />
    </mesh>
  );
}

// A flat black rack panel with a screw in each ear
function Panel({ h, children }: { h: number; children?: ReactNode }) {
  const H = h * U - 0.012;
  return (
    <group>
      <mesh position={[0, 0, FRONT + 0.02]} castShadow>
        <boxGeometry args={[WIDTH, H, 0.05]} />
        <meshStandardMaterial color={C.panel} metalness={0.35} roughness={0.55} />
      </mesh>
      {[-1, 1].map((x) => [-1, 1].map((y) => <Screw key={`${x}${y}`} x={x * (WIDTH / 2 - 0.1)} y={y * (H / 2 - 0.09)} />))}
      {children}
    </group>
  );
}

function Led({ position, color, on = true, size = 0.025 }: { position: [number, number, number]; color: string; on?: boolean; size?: number }) {
  return (
    <mesh position={position}>
      <boxGeometry args={[size * 1.6, size, 0.01]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={on ? 3 : 0.04} toneMapped={false} />
    </mesh>
  );
}

const portX = (port: number) => -0.66 + (port - 1) * 0.215;

// USW Ultra sitting in a 1U black shelf panel, ports facing out
function Switch({ nodes, offline }: { nodes: NodeStatus[] | null; offline: boolean }) {
  const used = new Map(NODES.map((n) => [n.port, n.name]));
  const tick = useRef(0);
  const [, force] = useState(0);
  useFrame((_, dt) => { tick.current += dt; if (tick.current > 0.2) { tick.current = 0; force((v) => v + 1); } });
  const z0 = FRONT + 0.045;
  return (
    <group>
      {/* panel frame around the switch */}
      <mesh position={[0, U / 2 - 0.03, FRONT + 0.02]}><boxGeometry args={[WIDTH, 0.05, 0.05]} /><meshStandardMaterial color={C.panel} metalness={0.35} roughness={0.55} /></mesh>
      <mesh position={[0, -U / 2 + 0.035, FRONT + 0.02]}><boxGeometry args={[WIDTH, 0.06, 0.05]} /><meshStandardMaterial color={C.panel} metalness={0.35} roughness={0.55} /></mesh>
      {[-1, 1].map((x) => (
        <mesh key={x} position={[x * (WIDTH / 2 - 0.09), 0, FRONT + 0.02]}><boxGeometry args={[0.18, U - 0.012, 0.05]} /><meshStandardMaterial color={C.panel} metalness={0.35} roughness={0.55} /></mesh>
      ))}
      {[-1, 1].map((x) => [-1, 1].map((y) => <Screw key={`${x}${y}`} x={x * (WIDTH / 2 - 0.09)} y={y * 0.11} />))}
      <RoundedBox args={[2.1, 0.3, 1.1]} radius={0.04} position={[0, -0.01, z0 - 0.55]} castShadow>
        <meshStandardMaterial color={C.unifi} roughness={0.4} />
      </RoundedBox>
      <Led position={[-0.9, -0.01, z0 + 0.002]} size={0.03} color="#3d8bff" />
      {Array.from({ length: 7 }, (_, i) => {
        const port = i + 1;
        const name = used.get(port);
        const n = nodes?.find((x) => x.name === name);
        const up = !!name && (offline || (n?.ready ?? true));
        const act = up && Math.random() < 0.3 + (n?.cpu ?? 10) / 120;
        return (
          <group key={port} position={[portX(port), -0.02, z0]}>
            <mesh position={[0, 0, -0.03]}>
              <boxGeometry args={[0.16, 0.13, 0.07]} />
              <meshStandardMaterial color="#141618" roughness={0.8} />
            </mesh>
            <Led position={[-0.055, 0.09, 0.004]} size={0.018} color="#ffb000" on={act} />
            <Led position={[0.055, 0.09, 0.004]} size={0.018} color={offline ? C.warn : C.ok} on={up} />
          </group>
        );
      })}
      <mesh position={[0.9, -0.02, z0 + 0.002]}><circleGeometry args={[0.018, 12]} /><meshStandardMaterial color="#333" /></mesh>
    </group>
  );
}

function PortBlock({ y, face, z }: { y: number; face: string; z: number }) {
  return (
    <group position={[0, y, z]}>
      <mesh position={[0, 0, -0.14]}>
        <boxGeometry args={[0.24, 0.17, 0.28]} />
        <meshStandardMaterial color={C.steel} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0, 0.001]}>
        <planeGeometry args={[0.19, 0.1]} />
        <meshStandardMaterial color={face} roughness={0.6} />
      </mesh>
    </group>
  );
}

// One Pi 5 on edge in the panel: Ethernet, USB 3 (blue) and USB 2 (black) stacked, PoE HAT behind
function PiBlade({ x, out, status, offline }: { x: number; out: number; status?: NodeStatus; offline: boolean }) {
  const act = useRef<THREE.MeshStandardMaterial>(null);
  const tRef = useRef(Math.random() * 10);
  useFrame((_, dt) => {
    const cpu = (status?.cpu ?? 8) / 100;
    tRef.current += dt * (2 + cpu * 18);
    if (act.current) act.current.emissiveIntensity = Math.sin(tRef.current) > 0.6 - cpu ? 3 : 0.04;
  });
  const ready = status?.ready ?? true;
  const link = offline ? C.warn : ready ? C.ok : C.bad;
  const z = FRONT - 0.01;
  return (
    <group position={[x, 0, out]}>
      <mesh position={[-0.1, 0, z - 0.55]} castShadow>
        <boxGeometry args={[0.03, 0.56, 0.85]} />
        <meshStandardMaterial color={C.pcb} roughness={0.7} />
      </mesh>
      <mesh position={[0.12, 0, z - 0.6]}>
        <boxGeometry args={[0.05, 0.52, 0.65]} />
        <meshStandardMaterial color="#1b1e22" roughness={0.6} />
      </mesh>
      <PortBlock y={-0.01} face="#1e5fd6" z={z} />
      <PortBlock y={-0.2} face="#111" z={z} />
      <group position={[0, ETH_Y, z]}>
        <mesh position={[0, 0, -0.14]}>
          <boxGeometry args={[0.25, 0.2, 0.28]} />
          <meshStandardMaterial color={C.steel} metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.015, 0.001]}>
          <planeGeometry args={[0.18, 0.13]} />
          <meshStandardMaterial color="#0d0e10" />
        </mesh>
        <Led position={[-0.085, 0.075, 0.004]} size={0.02} color={link} />
        <mesh position={[0.085, 0.075, 0.004]}>
          <boxGeometry args={[0.029, 0.018, 0.01]} />
          <meshStandardMaterial ref={act} color="#ffb000" emissive="#ffb000" emissiveIntensity={0.04} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

const bladeX = (i: number) => -0.84 + i * 0.56;
const ETH_Y = 0.19; // Ethernet jack height within the Pi panel
const WIN = { w: 0.38, h: 0.7 };

// Faint diagonal hatch, like the 3D-printed infill of the real panel
function useHatch() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.fillStyle = '#eceff1'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = 'rgba(120,130,140,.18)'; g.lineWidth = 2;
    for (let i = -64; i < 128; i += 10) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke();
      g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, 64); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(6, 2);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
}

// How far the Pis are slid out, eased toward the target. Shared by the Pis and their cables.
function useSlide(explode: boolean) {
  const cur = useRef(0);
  const [o, setO] = useState(0);
  useFrame((_, dt) => {
    const tgt = explode ? 0.9 : 0;
    if (cur.current === tgt) return;
    cur.current = Math.abs(cur.current - tgt) < 0.002 ? tgt : cur.current + (tgt - cur.current) * (1 - Math.exp(-dt * 6));
    setO(cur.current);
  });
  return o;
}

function Pis({ o, nodes, offline }: { o: number; nodes: NodeStatus[] | null; offline: boolean }) {
  const hatch = useHatch();
  const H = 2 * U - 0.012;
  const mat = <meshStandardMaterial map={hatch} color="#f2f4f5" roughness={0.65} transparent opacity={0.9} />;
  // strips between the four windows
  const edges = [-WIDTH / 2, ...NODES.flatMap((_, i) => [bladeX(i) - WIN.w / 2, bladeX(i) + WIN.w / 2]), WIDTH / 2];
  const strips = [];
  for (let i = 0; i < edges.length; i += 2) strips.push([edges[i], edges[i + 1]]);
  const band = (H - WIN.h) / 2;
  return (
    <group>
      {[1, -1].map((s) => (
        <mesh key={s} position={[0, s * (H / 2 - band / 2), FRONT + 0.02]}>
          <boxGeometry args={[WIDTH, band, 0.05]} />
          {mat}
        </mesh>
      ))}
      {strips.map(([a, b]) => (
        <mesh key={a} position={[(a + b) / 2, 0, FRONT + 0.02]}>
          <boxGeometry args={[b - a, WIN.h, 0.05]} />
          {mat}
        </mesh>
      ))}
      {[-1, 1].map((x) => [-1, 1].map((y) => <Screw key={`${x}${y}`} x={x * (WIDTH / 2 - 0.1)} y={y * (H / 2 - 0.08)} />))}
      {NODES.map((n, i) => (
        <PiBlade key={n.name} x={bladeX(i)} out={o} status={nodes?.find((s) => s.name === n.name)} offline={offline} />
      ))}
    </group>
  );
}

function Screen({ feed }: { feed: Feed }) {
  const face = useMemo(() => new Face(0.5), []);
  const tex = useMemo(() => {
    const t = new THREE.CanvasTexture(face.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [face]);
  useEffect(() => () => tex.dispose(), [tex]);
  useFrame((_, dt) => {
    const s = feed.status;
    face.emote = feed.mode === 'offline' || !s ? 'stale' : s.stale ? 'stale' : s.emote;
    const cpu = s ? s.nodes.reduce((a, n) => a + n.cpu, 0) / Math.max(1, s.nodes.length) / 100 : 0.1;
    face.step(Math.min(dt, 0.1), cpu);
    tex.needsUpdate = true;
  });
  return (
    <Panel h={2}>
      <mesh position={[0, 0.0, FRONT + 0.047]}>
        <planeGeometry args={[2.08, 0.65]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
      {/* glass */}
      <mesh position={[0, 0, FRONT + 0.05]}>
        <planeGeometry args={[2.1, 0.67]} />
        <meshPhysicalMaterial color="#000" transparent opacity={0.12} roughness={0.05} metalness={0} clearcoat={1} />
      </mesh>
    </Panel>
  );
}

function Blank({ h }: { h: number }) {
  return (
    <group>
      {Array.from({ length: h }, (_, i) => (
        <group key={i} position={[0, ((h - 1) / 2 - i) * U, 0]}>
          <Panel h={1} />
        </group>
      ))}
    </group>
  );
}

// Short black patch cables with clear boots, from the front of each switch port down into the
// Ethernet jack on top of each Pi's port stack. Rebuilt as the Pis slide so the plugs stay seated.
function Cables({ o }: { o: number }) {
  const sw = uY(3, 1) - 0.02, eth = uY(4, 2) + ETH_Y;
  const swZ = FRONT + 0.045, piZ = FRONT - 0.01 + o;
  const lines = useMemo(() => {
    const patch = NODES.map((n, i) => {
      const sx = portX(n.port), bx = bladeX(i);
      return new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx, sw, swZ + 0.16),
        new THREE.Vector3(sx, sw - 0.06, swZ + 0.3),
        new THREE.Vector3((sx + bx) / 2, (sw + eth) / 2 - 0.04, Math.max(swZ, piZ) + 0.38),
        new THREE.Vector3(bx, eth + 0.05, piZ + 0.3),
        new THREE.Vector3(bx, eth, piZ + 0.16),
      ], false, 'centripetal');
    });
    const ends = NODES.map((n, i) => ({
      s: [portX(n.port), sw, swZ + 0.08] as THREE.Vector3Tuple,
      b: [bladeX(i), eth, piZ + 0.08] as THREE.Vector3Tuple,
    }));
    return { patch, ends };
  }, [sw, eth, swZ, piZ]);
  const pulses = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    pulses.current.forEach((m, i) => {
      if (m) m.position.copy(lines.patch[i].getPoint((clock.elapsedTime * 0.3 + i * 0.27) % 1));
    });
  });
  const boot = <meshPhysicalMaterial color="#f4f8ff" transparent opacity={0.45} roughness={0.1} clearcoat={1} />;
  return (
    <group>
      {lines.patch.map((c, i) => (
        <group key={i}>
          <mesh castShadow>
            <tubeGeometry args={[c, 48, 0.022, 8, false]} />
            <meshStandardMaterial color="#121315" roughness={0.55} />
          </mesh>
          <mesh ref={(m) => { if (m) pulses.current[i] = m; }}>
            <sphereGeometry args={[0.022, 10, 8]} />
            <meshStandardMaterial color="#fff" emissive={C.accent} emissiveIntensity={3} toneMapped={false} />
          </mesh>
          <mesh position={lines.ends[i].s}><boxGeometry args={[0.12, 0.11, 0.16]} />{boot}</mesh>
          <mesh position={lines.ends[i].b}><boxGeometry args={[0.12, 0.11, 0.16]} />{boot}</mesh>
        </group>
      ))}
    </group>
  );
}

// The NAS is only discussed in the last section, so it waits off to the side and slides in there
function NasTower({ show, onSelect }: { show: boolean; onSelect: (i: Selectable) => void }) {
  const size: [number, number, number] = [1.6, 3.2, 2.8];
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const x = show ? 3.1 : 9;
    g.position.x += (x - g.position.x) * (1 - Math.exp(-dt * 4));
    g.visible = g.position.x < 8.5;
  });
  return (
    <group ref={ref} position={[9, 0, 0]}>
    <Hoverable item={NAS} selected={false} onSelect={onSelect} size={size} position={[0, FLOOR + size[1] / 2, -0.6]}>
      <RoundedBox args={size} radius={0.06} castShadow receiveShadow>
        <meshStandardMaterial color="#202429" metalness={0.3} roughness={0.55} />
      </RoundedBox>
      {Array.from({ length: 5 }, (_, i) => (
        <group key={i} position={[0, 0.9 - i * 0.32, size[2] / 2 + 0.005]}>
          <mesh>
            <boxGeometry args={[1.3, 0.24, 0.02]} />
            <meshStandardMaterial color="#2c3138" metalness={0.4} />
          </mesh>
          <Led position={[0.55, 0, 0.02]} size={0.02} color={i === 0 ? '#4da3ff' : C.ok} />
        </group>
      ))}
    </Hoverable>
    </group>
  );
}

/* ------------------------------ camera --------------------------------- */

// One framing per page section. The page marks sections with data-rack="<id>"; whichever crosses
// the middle of the viewport is active, and the camera eases to its shot.
type ShotId = 'screen' | 'switch' | 'pis' | 'blank';
const SHOTS: Record<ShotId, { target: THREE.Vector3Tuple; offset: THREE.Vector3Tuple }> = {
  screen: { target: [0.1, -0.2, 0.3], offset: [2.4, 1.3, 9.6] },
  switch: { target: [0, uY(3, 1) - 0.35, 0.5], offset: [1.8, 1.5, 6.4] },
  pis: { target: [0, uY(4, 2) - 0.1, 0.9], offset: [-2.0, 0.9, 6.2] },
  blank: { target: [1.55, -0.5, 0], offset: [3.0, 2.4, 12] },
};
const isShot = (id: string | null): id is ShotId => !!id && id in SHOTS;

function Rig({ shot, controls, reduced }: { shot: ShotId; controls: React.RefObject<OrbitControlsImpl | null>; reduced: boolean }) {
  const { camera, size } = useThree();
  const driving = useRef(true);
  useEffect(() => { driving.current = true; }, [shot, size.width, size.height]);
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const stop = () => { driving.current = false; };
    c.addEventListener('start', stop);
    return () => c.removeEventListener('start', stop);
  }, [controls]);
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c || !driving.current) return;
    // pull back on tall or narrow stages so the framed part still fits
    const k = Math.min(1.6, Math.max(1, 0.9 / (size.width / size.height)));
    const s = SHOTS[shot];
    const target = new THREE.Vector3(...s.target);
    const pos = target.clone().add(new THREE.Vector3(...s.offset).multiplyScalar(k));
    const t = reduced ? 1 : 1 - Math.exp(-dt * 3);
    c.target.lerp(target, t);
    camera.position.lerp(pos, t);
    c.update();
    if (camera.position.distanceTo(pos) < 0.01) driving.current = false;
  });
  return null;
}

/* ------------------------------ scene ---------------------------------- */

function Rack({ feed, explode, active, onSelect }: {
  feed: Feed; explode: boolean; active: string | null; onSelect: (i: Selectable) => void;
}) {
  const nodes = feed.status?.nodes ?? null;
  const offline = feed.mode === 'offline' || !!feed.status?.stale;
  const items = RACK.filter((r) => !r.future);
  const o = useSlide(explode);
  return (
    <group>
      <Frame />
      {items.map((it) => {
        const y = uY(it.u, it.h);
        const size: [number, number, number] = [WIDTH, it.h * U, DEPTH];
        return (
          <Hoverable key={it.id} item={it} selected={active === it.id} onSelect={onSelect} size={size} position={[0, y, 0]}>
            {it.kind === 'switch' && <Switch nodes={nodes} offline={offline} />}
            {it.kind === 'pis' && <Pis o={o} nodes={nodes} offline={offline} />}
            {it.kind === 'screen' && <Screen feed={feed} />}
            {it.kind === 'blank' && <Blank h={it.h} />}
          </Hoverable>
        );
      })}
      <Cables o={o} />
      <NasTower show={active === 'blank'} onSelect={onSelect} />
    </group>
  );
}

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

function readout(feed: Feed): string {
  const s = feed.status;
  if (feed.mode === 'offline' || !s) return 'Live data is unavailable right now, so this is the model on its own.';
  if (s.stale) return "The rack isn't reporting. Showing the last state it sent.";
  const up = s.nodes.filter((n) => n.ready).length;
  const state = s.label === 'all good' ? 'All good.' : `${s.label[0].toUpperCase()}${s.label.slice(1)}.`;
  return `${feed.mode === 'mock' ? 'Demo data. ' : ''}${up} of ${s.nodes.length} nodes up. ${state}`;
}

function uptimeLine(u: NonNullable<PublicStatus['uptime']>): string {
  const pct = u.pct === 100 ? '100' : u.pct.toFixed(2).replace(/0$/, '');
  if (u.hours >= u.windowDays * 24 - 1) return `This site: ${pct}% uptime over the last ${u.windowDays} days.`;
  const age = u.hours < 1 ? `${Math.max(1, Math.round(u.hours * 60))} minutes`
    : u.hours < 48 ? `${Math.round(u.hours)} hour${Math.round(u.hours) === 1 ? '' : 's'}`
    : `${Math.round(u.hours / 24)} days`;
  return `This site: ${pct}% uptime since it went live ${age} ago.`;
}

export default function RackScene() {
  const feed = useFeed();
  const [active, setActive] = useState<string | null>('screen');
  const [gl, setGl] = useState<boolean | null>(null);
  const [reduced, setReduced] = useState(false);
  const controls = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    setGl(webglOk());
    setReduced(matchMedia('(prefers-reduced-motion: reduce)').matches);
    // the section crossing the middle of the viewport picks the shot
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive((e.target as HTMLElement).dataset.rack ?? null);
    }, { rootMargin: '-45% 0px -45% 0px' });
    document.querySelectorAll<HTMLElement>('[data-rack]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // clicking a part scrolls to the section about it (the NAS is covered with the blanks)
  const goTo = (item: Selectable) => {
    const id = item.id === NAS.id ? 'blank' : item.id;
    document.querySelector(`[data-rack="${id}"]`)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  const shot: ShotId = isShot(active) ? active : 'screen';
  const s = feed.status;
  const live = feed.mode === 'live' && s && !s.stale;

  return (
    <div className="stage">
      {gl === false ? (
        <img className="stage-fallback" src="/rack-poster.png" alt="The homelab rack: a 10-inch aluminium rack with a status screen, a UniFi switch, four Raspberry Pi 5 nodes and blank panels" />
      ) : gl ? (
        <Canvas
          shadows
          dpr={[1, 1.5]}
          camera={{ position: [2.2, 1.4, 7.4], fov: 36 }}
          aria-label="Interactive 3D model of the homelab rack. Drag to turn it; click a part to read about it."
        >
          <Environment resolution={64}>
            <Lightformer intensity={3} position={[0, 4, 4]} scale={[8, 2, 1]} />
            <Lightformer intensity={1} position={[-5, 1, 0]} rotation-y={Math.PI / 2} scale={[6, 4, 1]} color="#dfe8f2" />
            <Lightformer intensity={0.8} position={[5, 1, -2]} rotation-y={-Math.PI / 2} scale={[6, 4, 1]} color="#f2ece2" />
          </Environment>
          <ambientLight intensity={0.5} />
          <directionalLight position={[4, 6, 5]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} />
          <Rack feed={feed} explode={shot === 'pis'} active={active} onSelect={goTo} />
          <ContactShadows position={[0, FLOOR, 0]} opacity={0.35} scale={14} blur={2.6} far={4} color="#2a3036" />
          <OrbitControls
            ref={controls}
            enablePan={false}
            enableZoom={false}
            minPolarAngle={Math.PI * 0.2}
            maxPolarAngle={Math.PI * 0.55}
            minAzimuthAngle={-Math.PI * 0.5}
            maxAzimuthAngle={Math.PI * 0.6}
            enableDamping
          />
          <Rig shot={shot} controls={controls} reduced={reduced} />
        </Canvas>
      ) : null}

      <div className="readout" aria-live="polite">
        <p><span className={`led ${live ? 'on' : 'off'}`} aria-hidden="true" />{readout(feed)}</p>
        {s?.uptime && <p className="uptime">{uptimeLine(s.uptime)}</p>}
        {shot === 'pis' && s && (
          <table>
            <caption className="sr-only">Live node stats</caption>
            <tbody>
              {NODES.map((n) => {
                const ns = s.nodes.find((x) => x.name === n.name);
                return (
                  <tr key={n.name}>
                    <th scope="row"><span className={`led ${ns?.ready ? 'on' : 'down'}`} aria-hidden="true" />{n.name}</th>
                    <td>{ns?.ready ? `${ns.cpu}% CPU` : 'down'}</td>
                    <td>{ns?.temp != null ? `${ns.temp} °C` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
