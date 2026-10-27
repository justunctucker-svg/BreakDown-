// One entry per script "shot". enter() sets the stage, update(s, p) poses everything
// for s seconds into the shot (p = 0..1 progress through it).
import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
const lerpV = (a, b, t) => a.clone().lerp(b, t);

export function makeShots(ctx) {
  const { world, camera, jet, enemy, drone, trails, flash } = ctx;
  const all = [jet.group, enemy.group, drone.group];
  const show = (...objs) => all.forEach((o) => (o.visible = objs.includes(o)));
  const look = (pos, target, roll = 0) => {
    camera.position.copy(pos);
    camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    camera.lookAt(target);
  };
  // small handheld-ish drift so nothing feels locked off
  const shake = (s, amt = 0.05) => V(Math.sin(s * 1.7) * amt, Math.sin(s * 2.3 + 1) * amt, 0);
  const reset = () => {
    for (const o of all) { o.position.set(0, 0, 0); o.rotation.set(0, 0, 0); o.scale.setScalar(1); }
    trails.forEach((t) => t.hide());
    drone.setWings(0); drone.setDoors(0); drone.setXray(0); drone.flame.set(0, 0);
    drone.missiles.forEach((m) => { m.group.position.copy(m.home); m.group.rotation.set(0, 0, 0); m.flame.set(0, 0); });
    jet.burner(0, 0); enemy.burner(0, 0);
    if (drone.group.parent !== ctx.scene) ctx.scene.add(drone.group);
    camera.fov = 38;
    camera.updateProjectionMatrix();
    flash(0);
  };
  const attachToJet = () => {
    jet.group.add(drone.group);
    drone.group.position.copy(jet.pylonPos);
    drone.group.rotation.set(0, 0, 0);
  };

  return {
    chase: {
      enter() { reset(); world.set("desert", { kind: "desert", altitude: 900 }); show(jet.group, enemy.group); },
      update(s) {
        world.scroll(0, 260 * s);
        jet.group.rotation.z = 0.12 * Math.sin(s * 0.9);
        jet.group.position.y = 0.3 * Math.sin(s * 1.3);
        jet.burner(0.55, s);
        enemy.group.position.set(70 - s * 10, 28 + s * 2, 820);
        enemy.group.rotation.set(0, Math.PI, -0.2);
        enemy.group.scale.setScalar(1.6);
        // a missile climbing toward us from the haze
        const path = (te) => {
          const k = clamp01((te + 0.4) / 3.6);
          return V(-90 + 60 * k, -520 + 560 * Math.pow(k, 0.8), 640 - 330 * k);
        };
        trails[0].update(path, s, -0.4, { spacing: 0.0045, air: V(0, 0, -260), width: 3, grow: 9, life: 1.6, opacity: 0.6 });
        look(V(2.5, 5.2, -27 + s * 0.5).add(shake(s, 0.06)), V(0, -0.5, 14));
      },
    },

    carry: {
      enter() { reset(); world.set("day", { altitude: 2200, coverage: 0.48 }); show(jet.group, drone.group); attachToJet(); },
      update(s, p) {
        world.scroll(0, 230 * s);
        jet.group.rotation.z = 0.06 * Math.sin(s * 0.8);
        look(lerpV(V(-12, -3.6, 8), V(-10.5, -3.0, 3.5), p).add(shake(s)), V(-3.6, -1.3, -1.2));
      },
    },

    reveal: {
      enter() { reset(); world.set("sunset", { altitude: 1100 }); show(drone.group); drone.setWings(1); },
      update(s, p) {
        world.scroll(0, 200 * s);
        drone.flame.set(1, s);
        drone.group.rotation.z = 0.05 * Math.sin(s);
        const e = easeOut(p * 1.1);
        const a = THREE.MathUtils.lerp(0.25, 1.95, e);
        const r = THREE.MathUtils.lerp(2.3, 11, e);
        look(V(Math.cos(a) * r, THREE.MathUtils.lerp(0.15, 2.4, e), Math.sin(a) * r * 0.8 + 0.5).add(shake(s, 0.02)),
             V(0, 0, THREE.MathUtils.lerp(0.6, -0.5, e)));
      },
    },

    carry2: {
      enter() { reset(); world.set("day", { altitude: 2200, coverage: 0.52 }); show(jet.group, drone.group); attachToJet(); },
      update(s, p) {
        world.scroll(0, 230 * s);
        jet.group.rotation.z = -0.32 + 0.05 * Math.sin(s);
        jet.group.rotation.x = 0.03;
        look(lerpV(V(-17, 10, 17), V(-14, 8.5, 12), p).add(shake(s)), V(-1.5, -1, -1.5));
      },
    },

    drop: {
      enter() { reset(); world.set("day", { altitude: 2200, coverage: 0.44 }); show(jet.group, drone.group); },
      update(s, p) {
        world.scroll(0, 230 * s);
        const rel = 0.75;
        const dt = Math.max(0, s - rel);
        // the jet climbs and rolls away once the drone is off the rail
        jet.group.position.set(0, 2.2 * dt * dt, 0.6 * dt * dt);
        jet.group.rotation.set(-0.05 * dt, 0, 0.25 * dt);
        jet.burner(0.3, s);
        const dp = jet.pylonPos.clone().add(jet.group.position);
        drone.group.position.set(dp.x - 0.3 * dt * dt, dp.y - 3.6 * dt * dt, dp.z - 1.6 * dt * dt);
        drone.group.rotation.set(0.07 * dt, 0, -0.04 * dt);
        if (dt > 0) drone.group.rotation.z = jet.group.rotation.z * Math.max(0, 1 - dt * 3);
        const focus = drone.group.position.clone().add(V(0, 0, 0.5));
        look(focus.clone().add(V(-21, 3 - p * 3, -6 + p * 4)).add(shake(s, 0.04)), focus.clone().add(V(2.5, 1.2 - p, 0.5)));
      },
    },

    deploy: {
      enter() { reset(); world.set("day", { altitude: 2200, coverage: 0.42 }); show(drone.group); },
      update(s, p) {
        world.scroll(0, 210 * s);
        drone.setWings(smooth(0.08, 0.45, p));
        const ign = smooth(0.55, 0.62, p);
        drone.flame.set(ign * (1 + 0.6 * Math.max(0, 1 - (p - 0.55) * 8)), s);
        flash(0.25 * Math.max(0, 1 - Math.abs(p - 0.57) * 20));
        drone.group.rotation.x = THREE.MathUtils.lerp(0.12, -0.02, p);
        const a = THREE.MathUtils.lerp(-2.2, -1.2, p);
        look(V(Math.cos(a) * 9, 5.2 - p * 1.5, Math.sin(a) * 9 + 1).add(shake(s, 0.03)), V(0, 0, 0.2));
      },
    },

    cruise: {
      enter() { reset(); world.set("sunset", { altitude: 1100 }); show(drone.group); drone.setWings(1); },
      update(s) {
        world.scroll(0, 200 * s);
        drone.flame.set(1, s);
        drone.group.position.set(Math.sin(s * 0.6) * 1.5, 0.3 * s, 10 + 9 * s * s);
        drone.group.rotation.z = 0.08 * Math.sin(s * 0.7);
        trails[1].update((te) => V(Math.sin(te * 0.6) * 1.5, 0.3 * te, 10 + 9 * te * te - 4.3),
          s, 0, { spacing: 0.02, air: V(0, 0, -14), width: 0.25, grow: 1.1, life: 1.8, opacity: 0.35 });
        look(V(1.2, 1.6, -6).add(shake(s, 0.04)), drone.group.position.clone().multiplyScalar(0.6).add(V(0, 0.2, 6)));
      },
    },

    belly: {
      enter() { reset(); world.set("dusk", { altitude: 1500 }); show(drone.group); drone.setWings(1); },
      update(s, p) {
        world.scroll(0, 200 * s);
        drone.flame.set(1, s);
        drone.setXray(smooth(0.3, 0.6, p));
        drone.group.rotation.z = 0.06 * Math.sin(s * 0.8);
        look(lerpV(V(-5, -11, -6), V(-4.2, -9.5, 0.5), p).add(shake(s, 0.03)), V(0, -0.3, 0.3));
      },
    },

    release: {
      enter() { reset(); world.set("dusk", { altitude: 1500 }); show(drone.group); drone.setWings(1); },
      update(s, p) {
        world.scroll(0, 200 * s);
        drone.flame.set(1, s);
        drone.setDoors(smooth(0.0, 0.12, p));
        drone.missiles.forEach((m, i) => {
          const pos = (te) => {
            const d = Math.max(0, te - (0.55 + i * 0.4));
            const burn = Math.max(0, d - 0.45);
            return m.home.clone().add(V(0, -2.4 * d * d - 0.3 * Math.min(d, 1), 70 * burn * burn - 0.4 * d));
          };
          m.group.position.copy(pos(s));
          const d = s - (0.55 + i * 0.4);
          const lit = smooth(0.45, 0.52, d);
          m.flame.set(lit, s, i * 5);
          m.group.rotation.x = d > 0 ? Math.min(0.12, d * 0.2) * (1 - lit) : 0;
          if (lit > 0) {
            trails[2 + i].update((te) => drone.group.localToWorld(pos(te).add(V(0, 0, -0.1))),
              s, 0.55 + i * 0.4 + 0.47, { spacing: 0.0036, air: V(0, 0, -30), width: 0.35, grow: 3.2, life: 1.3, opacity: 0.55 });
          }
          if (Math.abs(d - 0.47) < 0.08) flash(0.18 * (1 - Math.abs(d - 0.47) / 0.08));
        });
        look(lerpV(V(-8, -4.5, -10), V(-9, -5, -7), p).add(shake(s, 0.04)), V(0, -1.8, 5));
      },
    },

    escape: {
      enter() { reset(); world.set("sunset", { altitude: 1100 }); show(jet.group, drone.group); drone.setWings(1); },
      update(s, p) {
        world.scroll(-70 * s * s, 250 * s);
        jet.burner(1, s);
        const k = easeOut(p * 1.6);
        jet.group.rotation.set(-0.18 * k, 0.25 * k, -1.15 * k, "YXZ");
        jet.group.position.set(-3 * k, 1.5 * k, 0);
        // the drone keeps going toward the fight, a speck far ahead
        drone.flame.set(1, s);
        drone.group.position.set(40, 8, 900 + 40 * s);
        look(V(0.8, 5.5, -36).add(shake(s, 0.05)), V(-1.5, 0.5, 6), -0.28 * k);
      },
    },

    outro: {
      enter() { reset(); world.set("sunset", { altitude: 1100 }); show(drone.group); drone.setWings(1); },
      update(s, p) {
        world.scroll(0, 200 * s);
        drone.flame.set(1, s);
        drone.group.rotation.z = 0.04 * Math.sin(s * 0.6);
        look(lerpV(V(-7.5, 1.2, -13), V(-5, 0.9, -9.5), p).add(shake(s, 0.03)), V(0, 0.4, 5));
      },
    },

    endcard: {
      enter() { reset(); world.set("night", { altitude: 1300 }); show(drone.group); drone.setWings(1); },
      update(s, p) {
        world.scroll(0, 120 * s);
        drone.flame.set(1, s);
        drone.group.rotation.y = -0.9 + s * 0.22;
        look(V(0, 3.2, 14.5), V(0, -4.2, 0));
      },
    },
  };
}
