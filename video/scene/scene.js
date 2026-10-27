import * as THREE from "three";
import { F15, LongShot } from "./models.js";
import { World, Trail } from "./world.js";
import { makeShots } from "./shots.js";

const W = 1080, H = 1920;
const params = new URLSearchParams(location.search);
const scale = Number(params.get("scale") || 1);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(scale);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 40000);
const world = new World(scene, renderer);

await document.fonts.load('700 40px "Barlow SC"');
await document.fonts.load('800 40px "Barlow SC"');
const timeline = await (await fetch("/video/build/timeline.json")).json();

const jet = new F15();
const enemy = new F15({ color: 0x6d6a66, dark: 0x4a4744, enemy: true });
const drone = new LongShot({ channel: timeline.channel });
scene.add(jet.group, enemy.group, drone.group);
const trails = Array.from({ length: 4 }, () => new Trail(360));
trails.forEach((t) => scene.add(t.group));

const $ = (id) => document.getElementById(id);
const flashEl = $("flash");
const flash = (v) => (flashEl.style.opacity = v);
$("markText").textContent = timeline.channel;

const shots = makeShots({ world, camera, jet, enemy, drone, trails, flash, scene });

let current = null;
function overlays(shot, t) {
  const ls = t - shot.start;
  // caption: the chunk being spoken, held until the next one starts
  const caps = timeline.shots.flatMap((s) => s.captions);
  let cap = null;
  for (let i = 0; i < caps.length; i++) {
    const next = caps[i + 1];
    const until = next && next.start - caps[i].end < 0.6 ? next.start : caps[i].end + 0.35;
    if (t >= caps[i].start - 0.02 && t < until) cap = caps[i];
  }
  const span = $("caption").firstElementChild;
  span.style.visibility = cap ? "visible" : "hidden";
  if (cap) {
    span.textContent = cap.text;
    const k = Math.min(1, (t - cap.start) / 0.09);
    span.style.transform = `scale(${0.9 + 0.1 * (1 - Math.pow(1 - k, 3))})`;
  }
  const slide = (el, on) => {
    const k = Math.min(1, ls / 0.28);
    el.style.display = on ? "block" : "none";
    el.style.transform = `translateX(${-110 * Math.pow(1 - k, 3)}%)`;
  };
  slide($("card"), !!shot.card);
  if (shot.card) {
    $("card").querySelector("b").textContent = shot.card[0];
    $("card").querySelector("small").textContent = shot.card[1];
  }
  slide($("tag"), !!shot.tag);
  if (shot.tag) $("tag").textContent = shot.tag;
  const end = shot.shot === "endcard";
  $("end").style.opacity = end ? Math.min(1, ls / 0.5) : 0;
  $("end").querySelector(".line").style.width = end ? `${Math.min(1, ls / 0.9) * 420}px` : "0";
  $("mark").style.opacity = end ? 0 : 1;
}

window.renderAt = (t) => {
  const shot = timeline.shots.find((s) => t >= s.start && t < s.end) || timeline.shots.at(-1);
  const def = shots[shot.shot];
  if (current !== shot) {
    current = shot;
    def.enter();
  }
  const s = t - shot.start;
  def.update(s, Math.min(1, s / (shot.end - shot.start)));
  const focus = drone.group.visible && drone.group.parent === scene && drone.group.position.length() < 60
    ? drone.group.position : jet.group.position;
  world.follow(camera, focus);
  overlays(shot, t);
  renderer.render(scene, camera);
  return true;
};
window.duration = timeline.duration;
window.ready = true;
