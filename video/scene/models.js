// Procedural aircraft. Every model faces +Z (nose) with +Y up.
import * as THREE from "three";

const lathe = (profile, segs = 40) => {
  // profile: [radius, z] pairs from tail to nose; lathe runs along Y, so turn it onto Z
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), segs);
  g.rotateX(Math.PI / 2);
  return g;
};

// a flat panel from an outline in the XZ plane, thickness along Y
const panel = (pts, thick) => {
  const s = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.35,
                                           bevelSize: thick * 0.35, bevelSegments: 2 });
  g.rotateX(Math.PI / 2);
  g.translate(0, thick / 2, 0);
  return g;
};

// a fin from an outline in the ZY plane, thickness along X
const fin = (pts, thick) => {
  const g = panel(pts, thick);
  g.rotateZ(Math.PI / 2);
  return g;
};

export function softTexture(inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(1, outer);
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const GLOW = softTexture();

// noise-ish deterministic flicker
const flicker = (t, seed = 0) =>
  0.85 + 0.08 * Math.sin(t * 61 + seed) + 0.05 * Math.sin(t * 137 + seed * 3) + 0.04 * Math.sin(t * 23 + seed * 7);

export class Flame {
  // engine exhaust: hot core, outer cone and a big soft glow
  constructor(radius, length, color = 0xff8a3a) {
    this.group = new THREE.Group();
    const coneMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, length, 20, 1, true), coneMat);
    cone.rotation.x = -Math.PI / 2;
    cone.position.z = -length / 2;
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xfff1d6, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.55, length * 0.45, 16, 1, true), coreMat);
    core.rotation.x = -Math.PI / 2;
    core.position.z = -length * 0.22;
    const glowMat = new THREE.SpriteMaterial({ map: GLOW, color, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(radius * 7);
    const glow2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0xffffff, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    glow2.scale.setScalar(radius * 3);
    this.group.add(cone, core, glow, glow2);
    Object.assign(this, { cone, core, glow, glow2, radius, length });
    this.set(0, 0);
  }
  set(power, t, seed = 0) {
    const f = power * flicker(t, seed);
    this.group.visible = power > 0.01;
    this.cone.scale.set(1, Math.max(f, 0.01), 1);
    this.cone.material.opacity = 0.22 * power;
    this.core.material.opacity = 0.55 * power;
    this.glow.material.opacity = 0.85 * power;
    this.glow.scale.setScalar(this.radius * 7 * (0.7 + 0.3 * f));
    this.glow2.material.opacity = power;
  }
}

function decalTexture(lines, w = 1024, h = 160) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  for (const [txt, px, size, color, font] of lines) {
    x.font = `${font || 700} ${size}px "Barlow SC", sans-serif`;
    x.fillStyle = color;
    x.textBaseline = "middle";
    x.fillText(txt, px, h / 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function roundelTexture(color = "rgba(225,225,225,.85)") {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = color;
  x.strokeStyle = color;
  x.fillRect(20, 50, 216, 28);
  x.beginPath();
  x.arc(128, 64, 52, 0, Math.PI * 2);
  x.fill();
  x.globalCompositeOperation = "destination-out";
  x.beginPath();
  x.arc(128, 64, 44, 0, Math.PI * 2);
  x.fill();
  x.fillRect(28, 56, 50, 16);
  x.fillRect(178, 56, 50, 16);
  x.globalCompositeOperation = "source-over";
  // star
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 16 : 40;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    x.lineTo(128 + r * Math.cos(a), 64 + r * Math.sin(a));
  }
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function decal(tex, w, h) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: tex, transparent: true, alphaTest: 0.02, roughness: 0.6, metalness: 0.2, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4 }));
}

// ---------------------------------------------------------------------------

export class Missile {
  // AIM-120 style air-to-air missile, ~3.6 m
  constructor() {
    this.group = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.45, metalness: 0.15 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x55524c, roughness: 0.5, metalness: 0.3 });
    const R = 0.09;
    const body = new THREE.Mesh(lathe([[0.06, 0], [R, 0.05], [R, 3.1], [0.075, 3.35], [0.035, 3.55], [0.0, 3.62]], 24), white);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, 0.05, 24), dark);
    band.rotation.x = Math.PI / 2;
    band.position.z = 2.6;
    const band2 = band.clone();
    band2.position.z = 2.45;
    band2.material = new THREE.MeshStandardMaterial({ color: 0xc9a23a, roughness: 0.5 });
    this.group.add(body, band, band2);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const tail = new THREE.Mesh(panel([[0, 0.05], [0.17, 0.12], [0.17, 0.3], [0, 0.4]], 0.012), white);
      const mid = new THREE.Mesh(panel([[0, 1.55], [0.11, 1.7], [0.11, 1.8], [0, 1.95]], 0.012), white);
      for (const f of [tail, mid]) {
        f.position.x = R * 0.6;
        const g = new THREE.Group();
        g.add(f);
        g.rotation.z = a;
        this.group.add(g);
      }
    }
    this.flame = new Flame(0.07, 1.4, 0xffa04a);
    this.flame.group.position.z = -0.02;
    this.group.add(this.flame.group);
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
}

// ---------------------------------------------------------------------------

export class F15 {
  constructor({ color = 0xa3aab2, dark = 0x7a828c, enemy = false } = {}) {
    this.group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, envMapIntensity: 1.3 });
    const skin2 = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.6, metalness: 0.25, envMapIntensity: 1.3 });
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.35, metalness: 0.9 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x1e2a38, roughness: 0.05, metalness: 0.2,
      transparent: true, opacity: 0.55, clearcoat: 1 });
    const g = this.group;

    // fuselage: long and slim, nose at +Z
    const fus = new THREE.Mesh(lathe([
      [0.55, -9.0], [0.95, -8.6], [1.15, -6], [1.25, -2], [1.15, 1], [0.95, 3.5], [0.8, 5.5],
      [0.62, 7.2], [0.42, 8.6], [0.2, 9.6], [0.0, 10.3]]), skin);
    fus.scale.set(1.15, 0.8, 1);
    // flat wide center body between the engines
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 11), skin);
    body.position.set(0, -0.15, -2.4);
    const hump = new THREE.Mesh(lathe([[0, -3.5], [0.7, -2], [0.75, 1.5], [0.4, 3.5], [0, 4.2]]), skin);
    hump.scale.set(1.1, 0.75, 1);
    hump.position.set(0, 0.5, 0.5);
    g.add(fus, body, hump);

    // intakes along the sides
    for (const s of [-1, 1]) {
      const intake = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 6.5), skin2);
      intake.position.set(s * 1.55, -0.15, 0.6);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.45, 0.25), metal);
      lip.position.set(s * 1.55, -0.15, 3.9);
      lip.rotation.x = 0.25;
      g.add(intake, lip);
    }

    // canopy + pilot
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass);
    canopy.scale.set(0.62, 0.62, 2.0);
    canopy.position.set(0, 0.62, 5.0);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.4 }));
    helmet.position.set(0, 0.95, 4.9);
    g.add(canopy, helmet);

    // main wings: big cropped delta, ~45 degree sweep
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(panel([[0, 3.2], [s * 6.6, -2.8], [s * 6.6, -4.4], [0, -5.2]].map(([x, z]) => [x, z]), 0.16), skin);
      w.position.set(s * 1.4, -0.2, 0);
      g.add(w);
      // horizontal stabilizer
      const hs = new THREE.Mesh(panel([[0, -6.6], [s * 3.6, -8.7], [s * 3.6, -9.7], [0, -9.8]], 0.1), skin2);
      hs.position.set(s * 1.3, -0.25, 0);
      g.add(hs);
      // twin vertical tails
      const vt = new THREE.Mesh(fin([[0, -5.6], [3.2, -8.0], [3.2, -9.2], [0, -9.4]], 0.12), skin2);
      vt.position.set(s * 1.55, 0.3, 0);
      vt.rotation.z = -s * 0.1;
      g.add(vt);
      // engine nozzles
      const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 1.3, 24, 1, true), metal);
      noz.rotation.x = Math.PI / 2;
      noz.position.set(s * 0.72, -0.15, -9.3);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.58, 24), new THREE.MeshBasicMaterial({ color: 0x120c08 }));
      inner.rotation.y = Math.PI;
      inner.position.set(s * 0.72, -0.15, -9.2);
      g.add(noz, inner);
      const fl = new Flame(0.48, 3.2);
      fl.group.position.set(s * 0.72, -0.15, -9.85);
      g.add(fl.group);
      (this.flames ||= []).push(fl);
      // wing pylon
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 2.4), skin2);
      pylon.position.set(s * 4.3, -0.5, -1.2);
      g.add(pylon);
    }
    // markings
    if (!enemy) {
      const tex = decalTexture([["BREAKDOWN", 40, 70, "rgba(40,44,50,.75)"]], 512, 128);
      for (const s of [-1, 1]) {
        const d = decal(tex, 2.6, 0.65);
        d.position.set(s * 1.31, 0.05, 6.4);
        d.rotation.y = s * Math.PI / 2;
        g.add(d);
      }
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.pylonPos = new THREE.Vector3(-4.3, -1.25, -1.2);
  }
  burner(power, t) { this.flames.forEach((f, i) => f.set(power, t, i * 3.1)); }
}

// ---------------------------------------------------------------------------

export class LongShot {
  // ~8 m air-launched drone. Wings stow along the spine; two AMRAAMs ride in the belly bay.
  constructor({ channel = "BreakDown" } = {}) {
    this.group = new THREE.Group();
    const g = this.group;
    this.skin = new THREE.MeshStandardMaterial({ color: 0x7a7d82, roughness: 0.4, metalness: 0.45, envMapIntensity: 1.4 });
    const skin = this.skin;
    const dark = new THREE.MeshStandardMaterial({ color: 0x45474b, roughness: 0.5, metalness: 0.5, envMapIntensity: 1.3 });
    this.doorMat = new THREE.MeshStandardMaterial({ color: 0x55585d, roughness: 0.45, metalness: 0.45 });
    this.xrayMats = [skin];

    const R = 0.46;
    const body = new THREE.Mesh(lathe([
      [0.3, -4.0], [0.38, -3.9], [0.44, -3.4], [R, -2.6], [R, 2.0], [0.44, 2.6], [0.39, 3.1],
      [0.3, 3.55], [0.17, 3.9], [0.0, 4.1]], 48), skin);
    body.scale.y = 0.92;
    g.add(body);
    // panel line rings
    for (const z of [-2.5, -1.25, 0.2, 1.6, 2.6]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.995 * (z > 2.4 ? 0.96 : 1), 0.006, 6, 48), dark);
      ring.position.z = z;
      ring.scale.y = 0.92;
      g.add(ring);
    }
    // dorsal intake hump
    const hump = new THREE.Mesh(lathe([[0.0, -3.6], [0.2, -3.2], [0.26, -2.0], [0.26, 0.2], [0.2, 0.8], [0.0, 1.0]], 24), skin);
    hump.position.y = 0.36;
    hump.scale.x = 1.15;
    g.add(hump);
    // nozzle
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.4, 24, 1, true), dark);
    noz.rotation.x = Math.PI / 2;
    noz.position.z = -4.05;
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: 0x0c0806 }));
    inner.rotation.y = Math.PI;
    inner.position.z = -3.95;
    g.add(noz, inner);
    this.flame = new Flame(0.2, 2.6);
    this.flame.group.position.z = -4.3;
    g.add(this.flame.group);

    // tail fins in an X
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(panel([[0, -2.7], [0.75, -3.35], [0.75, -3.75], [0, -3.85]], 0.04), dark);
      f.position.x = R * 0.7;
      const holder = new THREE.Group();
      holder.add(f);
      holder.rotation.z = Math.PI / 4 + (i * Math.PI) / 2;
      g.add(holder);
    }
    // canards near the nose
    for (const s of [-1, 1]) {
      const c = new THREE.Mesh(panel([[0, 2.5], [s * 0.45, 2.25], [s * 0.45, 2.1], [0, 2.0]], 0.03), dark);
      c.position.set(s * R * 0.85, 0.05, 0);
      g.add(c);
    }

    // swing wings: pivot on the spine, stowed pointing aft
    this.wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(0, 0.62 + (s > 0 ? 0.035 : 0), 0.55);
      const w = new THREE.Mesh(panel([[0, 0.22], [s * 3.3, 0.12], [s * 3.3, -0.12], [0, -0.22]], 0.035), skin);
      pivot.add(w);
      g.add(pivot);
      this.wings.push({ pivot, s });
    }
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 20), dark);
    pin.position.set(0, 0.58, 0.55);
    g.add(pin);

    // belly bay doors (hinged on the outer edges)
    this.doors = [];
    for (const s of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(s * 0.3, -0.36, 0.2);
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.025, 3.7), this.doorMat);
      d.position.x = -s * 0.15;
      hinge.add(d);
      g.add(hinge);
      this.doors.push({ hinge, s });
    }

    // missiles inside the bay
    this.missiles = [];
    for (const s of [-1, 1]) {
      const m = new Missile();
      m.home = new THREE.Vector3(s * 0.14, -0.1, -1.6);
      m.group.position.copy(m.home);
      g.add(m.group);
      this.missiles.push(m);
    }

    // markings
    const tex = decalTexture([
      ["◆ " + channel, 30, 64, "rgba(232,228,220,.92)", 700],
      ["X-68A", 470, 92, "rgba(232,228,220,.55)", 800],
    ], 1024, 160);
    const rTex = roundelTexture();
    for (const s of [-1, 1]) {
      const d = decal(tex, 3.0, 0.47);
      d.position.set(s * R * 0.965, 0.03, 0.6);
      d.rotation.y = s * Math.PI / 2;
      g.add(d);
      const r = decal(rTex, 0.75, 0.375);
      r.position.set(s * R * 0.965, 0.0, -1.55);
      r.rotation.y = s * Math.PI / 2;
      g.add(r);
      this.xrayMats.push(d.material, r.material);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.setWings(0);
    this.setDoors(0);
    this.setXray(0);
  }

  setWings(p) {
    // p=0 stowed along the spine, p=1 deployed with a slight sweep
    const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
    for (const { pivot, s } of this.wings) pivot.rotation.y = s * ((1 - e) * (Math.PI / 2) + 0.12 * e);
  }

  setDoors(p) {
    for (const { hinge, s } of this.doors) hinge.rotation.z = s * p * 1.6;
  }

  setXray(p) {
    // only the hull goes see-through; decals never write depth or they punch holes in it
    for (const m of [this.skin, this.doorMat]) {
      m.transparent = p > 0.001;
      m.depthWrite = p < 0.05;
      m.opacity = 1 - 0.75 * p;
    }
    for (const m of this.xrayMats) m.opacity = 1 - 0.75 * p;
  }
}
