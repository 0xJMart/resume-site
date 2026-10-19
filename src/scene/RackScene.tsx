import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { ContactShadows, Edges, Environment, Lightformer, OrbitControls, RoundedBox } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Face } from './face';
import { NAS, NODES, RACK, RACK_U, type RackItem } from './rack';
import { fetchStatus, mockStatus, type Feed, type NodeStatus } from './status';

// Scene units: 1 = 10 cm. A rack unit is 44.45 mm.
const U = 0.4445;
const WIDTH = 2.54;
const DEPTH = 2.2;
const TOP = (RACK_U * U) / 2 + 0.3;
const uY = (u: number, h: number) => TOP - 0.06 - (u - 1 + h / 2) * U;

const C = {
  frame: '#1d2126',
  panel: '#2a2f36',
  pcb: '#1f6b3a',
  steel: '#b9c0c8',
  unifi: '#e9ebee',
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

function Hoverable({ item, selected, onSelect, children, size, position }: {
  item: Selectable; selected: boolean; onSelect: (i: Selectable) => void;
  children: ReactNode; size: [number, number, number]; position: [number, number, number];
}) {
  const [hover, setHover] = useState(false);
  const over = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; };
  const out = () => { setHover(false); document.body.style.cursor = ''; };
  useEffect(() => () => { document.body.style.cursor = ''; }, []);
  return (
    <group position={position} onPointerOver={over} onPointerOut={out}
      onClick={(e) => { e.stopPropagation(); onSelect(item); }}>
      {children}
      {(hover || selected) && (
        <mesh>
          <boxGeometry args={[size[0] + 0.06, size[1] + 0.06, size[2] + 0.06]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          <Edges color={selected ? C.accent : '#ffffff'} lineWidth={selected ? 2 : 1} />
        </mesh>
      )}
    </group>
  );
}

function Frame() {
  const h = RACK_U * U + 0.24;
  const posts: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  return (
    <group>
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x * (WIDTH / 2 + 0.06), 0, z * (DEPTH / 2)]} castShadow>
          <boxGeometry args={[0.12, h, 0.12]} />
          <meshStandardMaterial color={C.frame} metalness={0.6} roughness={0.45} />
        </mesh>
      ))}
      {[1, -1].map((s) => (
        <RoundedBox key={s} args={[WIDTH + 0.36, 0.1, DEPTH + 0.16]} radius={0.03} position={[0, (s * h) / 2 + s * 0.05, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={C.frame} metalness={0.5} roughness={0.5} />
        </RoundedBox>
      ))}
      {/* front mounting rails */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (WIDTH / 2 - 0.02), 0, DEPTH / 2 - 0.12]}>
          <boxGeometry args={[0.1, h, 0.04]} />
          <meshStandardMaterial color="#14171b" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function Panel({ h, color = C.panel }: { h: number; color?: string }) {
  return (
    <mesh position={[0, 0, DEPTH / 2 - 0.06]} castShadow>
      <boxGeometry args={[WIDTH, h * U - 0.02, 0.05]} />
      <meshStandardMaterial color={color} metalness={0.55} roughness={0.5} />
    </mesh>
  );
}

function Led({ position, color, on = true, size = 0.025 }: { position: [number, number, number]; color: string; on?: boolean; size?: number }) {
  return (
    <mesh position={position}>
      <sphereGeometry args={[size, 12, 8]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={on ? 3 : 0.05} toneMapped={false} />
    </mesh>
  );
}

const portX = (port: number) => -0.62 + (port - 1) * 0.16;

function Switch({ nodes, offline }: { nodes: NodeStatus[] | null; offline: boolean }) {
  const used = new Map(NODES.map((n) => [n.port, n.name]));
  const blink = useRef(0);
  const [, force] = useState(0);
  useFrame((_, dt) => { blink.current += dt; if (blink.current > 0.25) { blink.current = 0; force((v) => v + 1); } });
  return (
    <group>
      {/* shelf */}
      <mesh position={[0, -U / 2 + 0.03, 0.1]} receiveShadow>
        <boxGeometry args={[WIDTH, 0.03, DEPTH - 0.2]} />
        <meshStandardMaterial color={C.frame} metalness={0.6} roughness={0.5} />
      </mesh>
      <RoundedBox args={[1.6, 0.34, 1.3]} radius={0.05} position={[0, -0.03, 0.35]} castShadow>
        <meshStandardMaterial color={C.unifi} roughness={0.35} />
      </RoundedBox>
      {Array.from({ length: 8 }, (_, i) => {
        const port = i + 1;
        const name = used.get(port);
        const n = nodes?.find((x) => x.name === name);
        const up = name ? (offline ? true : (n?.ready ?? true)) : false;
        const act = up && Math.random() < 0.35 + (n?.cpu ?? 10) / 150;
        return (
          <group key={port} position={[portX(port), -0.05, 1.005]}>
            <mesh>
              <boxGeometry args={[0.12, 0.1, 0.02]} />
              <meshStandardMaterial color="#111" />
            </mesh>
            <Led position={[-0.035, 0.075, 0.01]} size={0.012} color={offline ? C.warn : C.ok} on={up} />
            <Led position={[0.035, 0.075, 0.01]} size={0.012} color="#ffd25e" on={act} />
          </group>
        );
      })}
      <Led position={[0.68, 0.05, 1.005]} size={0.015} color="#4da3ff" />
    </group>
  );
}

function PiBlade({ x, out, status, offline }: { x: number; out: number; status?: NodeStatus; offline: boolean }) {
  const act = useRef<THREE.MeshStandardMaterial>(null);
  const tRef = useRef(Math.random() * 10);
  useFrame((_, dt) => {
    const cpu = (status?.cpu ?? 8) / 100;
    tRef.current += dt * (2 + cpu * 18);
    if (act.current) act.current.emissiveIntensity = Math.sin(tRef.current) > 0.6 - cpu ? 3 : 0.05;
  });
  const ready = status?.ready ?? true;
  const pwr = offline ? C.warn : ready ? C.ok : C.bad;
  const front = DEPTH / 2 - 0.1;
  return (
    <group position={[x, 0, out]}>
      {/* Pi 5 stands on edge in the panel mount, USB/Ethernet end facing out */}
      <mesh position={[0, 0, front - 0.45]} castShadow>
        <boxGeometry args={[0.04, 0.56, 0.85]} />
        <meshStandardMaterial color={C.pcb} roughness={0.7} />
      </mesh>
      {/* PoE HAT with its fan */}
      <mesh position={[0.12, 0, front - 0.5]} castShadow>
        <boxGeometry args={[0.05, 0.52, 0.62]} />
        <meshStandardMaterial color="#202833" roughness={0.6} />
      </mesh>
      <mesh position={[0.15, 0.02, front - 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.16, 0.16, 0.02, 24]} />
        <meshStandardMaterial color="#111418" />
      </mesh>
      {/* NVMe base on the other side */}
      <mesh position={[-0.07, 0, front - 0.45]}>
        <boxGeometry args={[0.03, 0.5, 0.7]} />
        <meshStandardMaterial color="#333a44" metalness={0.4} />
      </mesh>
      {/* ethernet + 2 USB stacks */}
      <mesh position={[0.05, 0.16, front]}>
        <boxGeometry args={[0.13, 0.17, 0.1]} />
        <meshStandardMaterial color={C.steel} metalness={0.8} roughness={0.3} />
      </mesh>
      {[-0.03, -0.2].map((y) => (
        <mesh key={y} position={[0.05, y, front]}>
          <boxGeometry args={[0.15, 0.13, 0.1]} />
          <meshStandardMaterial color={C.steel} metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      <Led position={[-0.05, 0.22, front + 0.03]} size={0.018} color={pwr} />
      <mesh position={[-0.05, 0.16, front + 0.03]}>
        <sphereGeometry args={[0.018, 12, 8]} />
        <meshStandardMaterial ref={act} color={C.ok} emissive={C.ok} emissiveIntensity={0.05} toneMapped={false} />
      </mesh>
    </group>
  );
}

const bladeX = (i: number) => -0.78 + i * 0.52;

function Pis({ explode, nodes, offline }: { explode: boolean; nodes: NodeStatus[] | null; offline: boolean }) {
  const out = useRef(0);
  const [o, setO] = useState(0);
  useFrame((_, dt) => {
    const tgt = explode ? 0.9 : 0;
    if (Math.abs(out.current - tgt) > 0.001) { out.current += (tgt - out.current) * (1 - Math.exp(-dt * 6)); setO(out.current); }
  });
  return (
    <group>
      {/* panel frame with four bays */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, s * (U - 0.04), DEPTH / 2 - 0.06]}>
          <boxGeometry args={[WIDTH, 0.06, 0.05]} />
          <meshStandardMaterial color={C.panel} metalness={0.55} roughness={0.5} />
        </mesh>
      ))}
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
    <group>
      <Panel h={2} color="#16191d" />
      <mesh position={[0, 0, DEPTH / 2 - 0.03]}>
        <planeGeometry args={[2.0, 0.625]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Blank({ h }: { h: number }) {
  return (
    <group>
      <Panel h={h} />
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-0.96 + i * 0.24, 0, DEPTH / 2 - 0.03]}>
          <boxGeometry args={[0.05, h * U * 0.55, 0.01]} />
          <meshStandardMaterial color="#15181c" />
        </mesh>
      ))}
    </group>
  );
}

function Cables({ explode }: { explode: boolean }) {
  // PoE patch cables from switch ports down to each Pi's ethernet jack
  const curves = useMemo(() => NODES.map((n) => {
    const i = NODES.indexOf(n);
    const sw = uY(2, 1), pi = uY(3, 2);
    const a = new THREE.Vector3(portX(n.port), sw - 0.05, 1.05);
    const b = new THREE.Vector3(bladeX(i) + 0.05, pi + 0.16, DEPTH / 2 - 0.04 + (explode ? 0.9 : 0));
    const m1 = a.clone().add(new THREE.Vector3(0, -0.05, 0.25 + i * 0.05));
    const m2 = b.clone().add(new THREE.Vector3(0, 0.15, 0.2));
    return new THREE.CatmullRomCurve3([a, m1, m2, b]);
  }), [explode]);
  const pulses = useRef<THREE.Mesh[]>([]);
  useFrame(({ clock }) => {
    pulses.current.forEach((m, i) => {
      if (!m) return;
      m.position.copy(curves[i].getPoint((clock.elapsedTime * 0.35 + i * 0.27) % 1));
    });
  });
  const colors = ['#4de1ff', '#ffd25e', '#b48cff', '#5ef2a0'];
  return (
    <group>
      {curves.map((c, i) => (
        <group key={i}>
          <mesh>
            <tubeGeometry args={[c, 40, 0.018, 8, false]} />
            <meshStandardMaterial color={colors[i]} roughness={0.5} />
          </mesh>
          <mesh ref={(m) => { if (m) pulses.current[i] = m; }}>
            <sphereGeometry args={[0.03, 10, 8]} />
            <meshStandardMaterial color="#fff" emissive={colors[i]} emissiveIntensity={4} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function NasTower({ selected, onSelect }: { selected: boolean; onSelect: (i: Selectable) => void }) {
  const size: [number, number, number] = [1.6, 3.4, 3.0];
  const y = -TOP + size[1] / 2 - 0.1;
  return (
    <Hoverable item={NAS} selected={selected} onSelect={onSelect} size={size} position={[3.0, y, -0.3]}>
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
  );
}

/* ------------------------------ camera --------------------------------- */

function Rig({ focus, controls }: { focus: THREE.Vector3; controls: React.RefObject<OrbitControlsImpl | null> }) {
  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    c.target.lerp(focus, 1 - Math.exp(-dt * 4));
    c.update();
  });
  return null;
}

// Pull the camera back on narrow (portrait) viewports so the rack and NAS both fit
function AutoFrame() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / size.height;
    camera.position.setLength(8.6 * Math.max(1, 1.35 / aspect));
  }, [camera, size.width, size.height]);
  return null;
}

/* ------------------------------ scene ---------------------------------- */

function Rack({ feed, explode, selected, onSelect }: {
  feed: Feed; explode: boolean; selected: Selectable | null; onSelect: (i: Selectable) => void;
}) {
  const nodes = feed.status?.nodes ?? null;
  const offline = feed.mode === 'offline' || !!feed.status?.stale;
  const items = RACK.filter((r) => !r.future);
  return (
    <group position={[-0.8, 0, 0]}>
      <Frame />
      {items.map((it) => {
        const y = uY(it.u, it.h);
        const size: [number, number, number] = [WIDTH, it.h * U, DEPTH];
        return (
          <Hoverable key={it.id} item={it} selected={selected?.id === it.id} onSelect={onSelect} size={size} position={[0, y, 0]}>
            {it.kind === 'switch' && <Switch nodes={nodes} offline={offline} />}
            {it.kind === 'pis' && <Pis explode={explode} nodes={nodes} offline={offline} />}
            {it.kind === 'screen' && <Screen feed={feed} />}
            {it.kind === 'blank' && <Blank h={it.h} />}
          </Hoverable>
        );
      })}
      <Cables explode={explode} />
      <NasTower selected={selected?.id === NAS.id} onSelect={onSelect} />
    </group>
  );
}

function focusFor(item: Selectable | null): THREE.Vector3 {
  if (!item) return new THREE.Vector3(0.4, 0, 0);
  if (item.id === NAS.id) return new THREE.Vector3(2.2, -0.4, 0);
  const r = item as RackItem;
  return new THREE.Vector3(-0.8, uY(r.u, r.h), 0.6);
}

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export default function RackScene() {
  const feed = useFeed();
  const [selected, setSelected] = useState<Selectable | null>(null);
  const [explode, setExplode] = useState(false);
  const [visible, setVisible] = useState(true);
  const [gl, setGl] = useState<boolean | null>(null);
  const [reduced, setReduced] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const controls = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    setGl(webglOk());
    setReduced(matchMedia('(prefers-reduced-motion: reduce)').matches);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting));
    if (wrap.current) io.observe(wrap.current);
    return () => io.disconnect();
  }, []);

  const focus = useMemo(() => focusFor(selected), [selected]);
  const all: Selectable[] = [...RACK.filter((r) => !r.future), NAS];
  const s = feed.status;
  const up = s ? s.nodes.filter((n) => n.ready).length : 0;

  const strip = feed.mode === 'offline'
    ? 'live data unavailable · showing the model'
    : s?.stale
      ? 'rack is not reporting · last state shown'
      : `${feed.mode === 'mock' ? 'demo data · ' : ''}${up}/${s?.nodes.length ?? 0} nodes up · ${s?.label ?? ''}`;

  return (
    <div className="rack" ref={wrap}>
      <div className="rack-stage">
        <p className={`rack-strip ${feed.mode}`} aria-live="polite">
          <span className="dot" aria-hidden="true" />
          {strip}
        </p>
        {gl === false ? (
          <img className="rack-fallback" src="/rack-poster.png" alt="3D render of the homelab rack: a 10-inch rack with a UniFi switch, four Raspberry Pi 5 nodes and a status screen, next to an Unraid NAS" />
        ) : gl ? (
          <Canvas
            shadows
            dpr={[1, 1.5]}
            frameloop={visible ? 'always' : 'never'}
            camera={{ position: [4.2, 2.4, 7.2], fov: 38 }}
            onPointerMissed={() => setSelected(null)}
            aria-label="Interactive 3D model of the homelab rack"
          >
            <color attach="background" args={['#0d1014']} />
            <ambientLight intensity={0.35} />
            <directionalLight position={[4, 6, 5]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
            <Environment resolution={64}>
              <Lightformer intensity={2} position={[0, 4, 4]} scale={[8, 2, 1]} />
              <Lightformer intensity={1} position={[-5, 1, 0]} rotation-y={Math.PI / 2} scale={[6, 4, 1]} color="#8fb8ff" />
              <Lightformer intensity={0.8} position={[5, 1, -2]} rotation-y={-Math.PI / 2} scale={[6, 4, 1]} color="#ffd9b0" />
            </Environment>
            <Rack feed={feed} explode={explode} selected={selected} onSelect={setSelected} />
            <ContactShadows position={[0, -TOP - 0.12, 0]} opacity={0.6} scale={12} blur={2.4} far={4} />
            <OrbitControls
              ref={controls}
              enablePan={false}
              minDistance={4}
              maxDistance={16}
              minPolarAngle={Math.PI * 0.2}
              maxPolarAngle={Math.PI * 0.55}
              minAzimuthAngle={-Math.PI * 0.45}
              maxAzimuthAngle={Math.PI * 0.6}
              autoRotate={!reduced && !selected}
              autoRotateSpeed={0.4}
              enableDamping
            />
            <Rig focus={focus} controls={controls} />
            <AutoFrame />
          </Canvas>
        ) : null}
        <div className="rack-tools">
          <button type="button" onClick={() => setExplode((v) => !v)} aria-pressed={explode}>
            {explode ? 'Slide Pis in' : 'Slide Pis out'}
          </button>
          {selected && <button type="button" onClick={() => setSelected(null)}>Reset view</button>}
        </div>
      </div>

      <aside className="rack-panel">
        <ul className="rack-list" aria-label="Rack components">
          {all.map((it) => (
            <li key={it.id}>
              <button type="button" aria-pressed={selected?.id === it.id} onClick={() => setSelected(selected?.id === it.id ? null : it)}>
                {it.label}
              </button>
            </li>
          ))}
        </ul>
        {selected ? (
          <div className="rack-detail">
            <h3>{selected.label}</h3>
            <ul>{selected.specs.map((x) => <li key={x}>{x}</li>)}</ul>
            {'runs' in selected && selected.runs && (
              <>
                <h4>Runs</h4>
                <ul>{selected.runs.map((x) => <li key={x}>{x}</li>)}</ul>
              </>
            )}
            {selected.id === 'pis' && s && (
              <>
                <h4>Right now</h4>
                <table className="rack-nodes">
                  <tbody>
                    {s.nodes.map((n) => (
                      <tr key={n.name}>
                        <td><span className={`dot ${n.ready ? 'ok' : 'bad'}`} aria-hidden="true" />{n.name}</td>
                        <td>{n.ready ? `${n.cpu}% CPU` : 'down'}</td>
                        <td>{n.temp != null ? `${n.temp}°C` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        ) : (
          <p className="rack-hint">Drag to orbit. Click a part, or pick one from the list, to see what it does.</p>
        )}
      </aside>
    </div>
  );
}
