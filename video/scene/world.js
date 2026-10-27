// Sky, cloud sea, cumulus puffs, desert terrain and smoke trails.
import * as THREE from "three";
import { softTexture } from "./models.js";

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PALETTES = {
  sunset: { zenith: "#2c2c5c", mid: "#8a6596", horizon: "#f5a862", sunColor: "#ffc89a", sunDir: [0.75, 0.1, 0.65],
            sun: 3.0, hemiSky: "#c9a8d8", hemiGround: "#6a5a86", hemi: 1.6,
            lit: "#ffd9bf", shade: "#6d6a9e", gap: "#5c4f7a", fog: "#c99aa0", fogDensity: 0.00011,
            puffTint: "#ffe6dc", exposure: 1.0 },
  day:    { zenith: "#1747a6", mid: "#4f86cf", horizon: "#c4d8ea", sunColor: "#fff6ea", sunDir: [-0.4, 0.75, 0.3],
            sun: 3.0, hemiSky: "#bcd4ff", hemiGround: "#7a808c", hemi: 1.5,
            lit: "#ffffff", shade: "#9aa6ba", gap: "#5f5a52", fog: "#c0d2e4", fogDensity: 0.00009,
            puffTint: "#ffffff", exposure: 1.0 },
  desert: { zenith: "#9c8a96", mid: "#c9a39a", horizon: "#e5bfa6", sunColor: "#ffd6b0", sunDir: [-0.5, 0.35, 0.6],
            sun: 2.8, hemiSky: "#e8cab8", hemiGround: "#9a6450", hemi: 1.6,
            lit: "#d9a080", shade: "#8a5040", gap: "#7a4a38", fog: "#d4ab98", fogDensity: 0.00022,
            puffTint: "#ffffff", exposure: 1.0 },
  dusk:   { zenith: "#16295e", mid: "#3d63b0", horizon: "#a9b6d8", sunColor: "#ffd2a8", sunDir: [-0.5, 0.25, -0.4],
            sun: 3.2, hemiSky: "#9fb2e8", hemiGround: "#4a4c5e", hemi: 1.6,
            lit: "#d8dcef", shade: "#5b6688", gap: "#3a3f55", fog: "#8a98bf", fogDensity: 0.0001,
            puffTint: "#e8ecff", exposure: 1.0 },
  night:  { zenith: "#05070f", mid: "#141c36", horizon: "#3a3550", sunColor: "#ffc89a", sunDir: [0.7, 0.15, 0.3],
            sun: 2.6, hemiSky: "#5a6898", hemiGround: "#252535", hemi: 0.9,
            lit: "#8890b0", shade: "#2a2f45", gap: "#141625", fog: "#2a2d45", fogDensity: 0.00012,
            puffTint: "#9aa2c8", exposure: 1.0 },
};

// --- tileable noise texture, generated once ----------------------------------
function noiseTexture(size = 512, seed = 7) {
  const r = rng(seed);
  const data = new Uint8Array(size * size * 4);
  const acc = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let cells = 4; cells <= 128; cells *= 2) {
    const grid = Array.from({ length: cells * cells }, r);
    const at = (x, y) => grid[((y % cells) * cells) + (x % cells)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells, fy = (y / size) * cells;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const v = (at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) +
                  (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty;
        acc[y * size + x] += v * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((acc[i] / total) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}

// --- sky dome ------------------------------------------------------------------
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new THREE.Color() }, mid: { value: new THREE.Color() },
      horizon: { value: new THREE.Color() }, sunColor: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 0.2, 1) }, below: { value: new THREE.Color() },
    },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 zenith, mid, horizon, sunColor, sunDir, below; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        c = mix(c, zenith, smoothstep(0.15, 0.75, h));
        c = mix(c, below, smoothstep(0.0, -0.08, h));
        float s = max(dot(d, normalize(sunDir)), 0.0);
        c += sunColor * (pow(s, 600.0) * 1.6 + pow(s, 24.0) * 0.28 + pow(s, 4.0) * 0.1);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// --- cloud sea: a huge plane shaded from the noise texture --------------------
function makeCloudSea(noise) {
  const mat = new THREE.ShaderMaterial({
    transparent: false, fog: false,
    uniforms: {
      noise: { value: noise }, offset: { value: new THREE.Vector2() },
      lit: { value: new THREE.Color() }, shade: { value: new THREE.Color() }, gap: { value: new THREE.Color() },
      fogColor: { value: new THREE.Color() }, fogDensity: { value: 0.0001 }, coverage: { value: 0.5 },
      sunDir: { value: new THREE.Vector3() },
    },
    vertexShader: `varying vec3 vWorld;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D noise; uniform vec2 offset; uniform vec3 lit, shade, gap, fogColor, sunDir;
      uniform float fogDensity, coverage; varying vec3 vWorld;
      float n(vec2 p) {
        return texture2D(noise, p / 5200.0).r * 0.55 + texture2D(noise, p / 1300.0 + 0.3).r * 0.3 +
               texture2D(noise, p / 330.0 + 0.7).r * 0.15;
      }
      void main() {
        vec2 p = vWorld.xz + offset;
        float v = n(p);
        vec2 sd = normalize(sunDir.xz + 1e-4) * 60.0;
        float v2 = n(p + sd);
        float dens = smoothstep(coverage - 0.12, coverage + 0.1, v);
        float light = clamp(0.55 + (v - v2) * 7.0, 0.0, 1.0);
        vec3 cloud = mix(shade, lit, light);
        vec3 c = mix(gap, cloud, dens);
        float d = length(vWorld - cameraPosition);
        float f = 1.0 - exp(-pow(d * fogDensity, 1.35));
        c = mix(c, fogColor, clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000), mat);
  m.rotation.x = -Math.PI / 2;
  return m;
}

// --- cumulus puffs: clustered billboards -----------------------------------------
function puffTextures(seed) {
  const r = rng(seed);
  const out = [];
  for (let v = 0; v < 5; v++) {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d");
    const blobs = [];
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI;
      const rad = r();
      blobs.push([128 + Math.cos(a) * rad * 92, 168 - Math.sin(a) * rad * 78 - r() * 10, 16 + r() * 34 * (1 - rad * 0.6)]);
    }
    for (const [bx, by, br] of blobs) {
      const gr = x.createRadialGradient(bx - br * 0.25, by - br * 0.35, br * 0.1, bx, by, br);
      gr.addColorStop(0, "rgba(255,255,255,1)");
      gr.addColorStop(0.65, "rgba(238,240,248,.95)");
      gr.addColorStop(1, "rgba(220,224,240,0)");
      x.fillStyle = gr;
      x.beginPath();
      x.arc(bx, by, br, 0, Math.PI * 2);
      x.fill();
    }
    // shadowed underside
    x.globalCompositeOperation = "source-atop";
    const sh = x.createLinearGradient(0, 70, 0, 200);
    sh.addColorStop(0, "rgba(255,255,255,0)");
    sh.addColorStop(0.55, "rgba(120,130,170,.35)");
    sh.addColorStop(1, "rgba(80,90,140,.7)");
    x.fillStyle = sh;
    x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    out.push(t);
  }
  return out;
}

class Puffs {
  constructor(seed, count = 150) {
    this.group = new THREE.Group();
    const r = rng(seed);
    const tex = puffTextures(seed + 1);
    this.mats = tex.map((map) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: true }));
    this.items = [];
    this.span = 16000;
    for (let i = 0; i < count; i++) {
      const cx = (r() - 0.5) * this.span, cz = (r() - 0.5) * this.span;
      const size = 260 + r() * 520;
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const s = new THREE.Sprite(this.mats[Math.floor(r() * this.mats.length)]);
        const sz = size * (0.6 + r() * 0.6);
        s.scale.set(sz * 1.3, sz, 1);
        s.center.set(0.5, 0.25);
        const base = new THREE.Vector3(cx + (r() - 0.5) * size * 1.4, r() * size * 0.25, cz + (r() - 0.5) * size);
        this.group.add(s);
        this.items.push({ s, base });
      }
    }
  }
  scroll(offset) {
    // wrap the field so it never runs out while the world streams past
    const half = this.span / 2;
    for (const { s, base } of this.items) {
      let z = base.z - offset.y;
      let x = base.x - offset.x;
      z = ((z + half) % this.span + this.span) % this.span - half;
      x = ((x + half) % this.span + this.span) % this.span - half;
      s.position.set(x, base.y, z);
    }
  }
  tint(color) { this.mats.forEach((m) => m.color.set(color)); }
}

// --- desert mountains ---------------------------------------------------------------
function makeDesert(seed) {
  const r = rng(seed);
  const size = 30000, segs = 220;
  const g = new THREE.PlaneGeometry(size, size, segs, segs);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const colors = [];
  const waves = Array.from({ length: 14 }, (_, i) => ({
    fx: (r() - 0.5) * 0.0012 * (1 + i * 0.5), fz: (r() - 0.5) * 0.0012 * (1 + i * 0.5),
    ph: r() * 6.28, amp: 900 / (1 + i * 0.9) }));
  const ca = new THREE.Color("#c0704f"), cb = new THREE.Color("#7a3f30"), cc = new THREE.Color("#e3a27a");
  const hs = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    let h = 0;
    for (const w of waves) h += Math.abs(Math.sin(x * w.fx + z * w.fz + w.ph)) * w.amp;
    hs[i] = h;
  }
  // normalise to 0..1, then sharpen so valleys stay wide and peaks stand out
  let lo = Infinity, hi = -Infinity;
  for (const h of hs) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
  for (let i = 0; i < pos.count; i++) {
    const n = (hs[i] - lo) / (hi - lo);
    const h = Math.pow(n, 2.2) * 700;
    pos.setY(i, h);
    const c = cb.clone().lerp(ca, Math.min(h / 350, 1)).lerp(cc, Math.max(0, (h - 350) / 350) * 0.6);
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: false }));
  m.receiveShadow = true;
  return m;
}

// --- smoke trail: a chain of soft billboards, fully deterministic -----------------
const SMOKE = softTexture("rgba(255,255,255,.9)", "rgba(255,255,255,0)");
export class Trail {
  constructor(n = 90, color = "#f2efe8") {
    this.group = new THREE.Group();
    this.sprites = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: SMOKE, color, transparent: true, depthWrite: false, fog: true }));
      this.group.add(s);
      this.sprites.push(s);
    }
    this.group.frustumCulled = false;
  }
  // path(time) -> Vector3 emitter position; air: drift velocity of old smoke (world units/s)
  update(path, t, t0, { spacing = 0.03, air = new THREE.Vector3(), width = 1.2, grow = 6, life = 2.6, opacity = 0.85 } = {}) {
    const n = this.sprites.length;
    for (let i = 0; i < n; i++) {
      const s = this.sprites[i];
      const age = i * spacing + (t % spacing);
      const te = t - age;
      if (te < t0 || age > life) { s.visible = false; continue; }
      s.visible = true;
      const p = path(te).clone().addScaledVector(air, age);
      s.position.copy(p);
      const sz = width + age * grow;
      s.scale.set(sz, sz, 1);
      s.material.opacity = opacity * Math.min(1, age * 12) * (1 - age / life);
    }
  }
  hide() { this.sprites.forEach((s) => (s.visible = false)); }
}

// --- the whole environment ----------------------------------------------------------
export class World {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.noise = noiseTexture();
    this.sky = makeSky();
    this.sea = makeCloudSea(this.noise);
    this.puffs = new Puffs(11);
    this.puffsLow = new Puffs(23, 80);
    this.desert = makeDesert(5);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -14;
    sc.right = sc.top = 14;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.fill = new THREE.DirectionalLight(0xffffff, 0.9);
    scene.add(this.fill, this.fill.target);
    scene.add(this.sky, this.sea, this.puffs.group, this.puffsLow.group, this.desert, this.sun, this.sun.target, this.hemi);
    scene.fog = new THREE.FogExp2(0xffffff, 0.0001);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    this.envSky = makeSky();
    this.envScene.add(this.envSky);
    this.envCache = {};
  }

  // kind: "clouds" | "desert"; altitude: height of the aircraft above the cloud/ground layer
  set(paletteName, { kind = "clouds", altitude = 900, coverage = 0.5, puffs = true } = {}) {
    const P = PALETTES[paletteName];
    this.palette = P;
    const sunDir = new THREE.Vector3(...P.sunDir).normalize();
    for (const sky of [this.sky, this.envSky]) {
      const u = sky.material.uniforms;
      u.zenith.value.set(P.zenith); u.mid.value.set(P.mid); u.horizon.value.set(P.horizon);
      u.sunColor.value.set(P.sunColor); u.sunDir.value.copy(sunDir);
      u.below.value.set(kind === "desert" ? P.fog : P.shade);
    }
    const su = this.sea.material.uniforms;
    su.lit.value.set(P.lit); su.shade.value.set(P.shade); su.gap.value.set(P.gap);
    su.fogColor.value.set(P.horizon).lerp(new THREE.Color(P.fog), 0.5);
    su.fogDensity.value = P.fogDensity * 0.8;
    su.coverage.value = coverage;
    su.sunDir.value.copy(sunDir);
    this.sea.position.y = -altitude;
    this.puffs.group.position.y = -altitude + 40;
    this.puffsLow.group.position.y = -altitude + 5;
    this.puffs.tint(P.puffTint);
    this.puffsLow.tint(P.puffTint);
    this.sea.visible = kind === "clouds";
    this.puffs.group.visible = kind === "clouds" && puffs;
    this.puffsLow.group.visible = kind === "clouds" && puffs;
    this.desert.visible = kind === "desert";
    this.desert.position.y = -altitude;
    this.kind = kind;
    this.scene.fog.color.set(P.fog);
    this.scene.fog.density = P.fogDensity;
    this.sun.color.set(P.sunColor);
    this.sun.intensity = P.sun;
    this.sunDir = sunDir;
    this.hemi.color.set(P.hemiSky);
    this.hemi.groundColor.set(P.hemiGround);
    this.hemi.intensity = P.hemi;
    if (!this.envCache[paletteName]) this.envCache[paletteName] = this.pmrem.fromScene(this.envScene, 0.02).texture;
    this.scene.environment = this.envCache[paletteName];
  }

  // offset: how far the world has streamed past, in (x, z) metres
  scroll(x, z) {
    this.sea.material.uniforms.offset.value.set(x, z);
    this.puffs.scroll(new THREE.Vector2(x, z));
    this.puffsLow.scroll(new THREE.Vector2(x * 1.0, z * 1.0));
    this.desert.position.x = -x;
    this.desert.position.z = -(((z + 6000) % 12000) - 6000);
  }

  // keep the sky dome centred on the camera and the sun shadow on the subject
  follow(camera, focus) {
    this.sky.position.copy(camera.position);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 60);
    this.sun.target.position.copy(focus);
    this.fill.position.copy(camera.position).add(new THREE.Vector3(0, 6, 0));
    this.fill.target.position.copy(focus);
    this.fill.color.copy(this.hemi.color);
  }
}
