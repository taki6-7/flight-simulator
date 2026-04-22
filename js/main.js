import * as THREE from 'three';
import { World } from './world.js';
import { Aircraft } from './aircraft.js';
import { HUD } from './hud.js';

// Renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// Fog
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x88aacc, 0.000018);

// World, Aircraft, HUD
const world    = new World(scene);
const aircraft = new Aircraft(scene);
const hud      = new HUD();

// Controls state
const keys = {};
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true;  handleOnce(e); });
window.addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

function handleOnce(e) {
  switch (e.key.toLowerCase()) {
    case 'f': aircraft.toggleFlaps(); break;
    case 'g': aircraft.toggleGear();  break;
    case 'r': aircraft.reset();        break;
  }
}

// Window resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  aircraft.camera.aspect = window.innerWidth / window.innerHeight;
  aircraft.camera.updateProjectionMatrix();
});

// Game loop
let last = performance.now();
let time = 0;

function frame() {
  requestAnimationFrame(frame);

  const now = performance.now();
  const dt  = Math.min((now - last) / 1000, 0.05);
  last = now;
  time += dt;

  // Read controls
  const inp = aircraft.input;
  inp.pitch = (keys['s'] ? 1 : 0) - (keys['w'] ? 1 : 0);
  inp.roll  = (keys['d'] ? 1 : 0) - (keys['a'] ? 1 : 0);
  inp.yaw   = (keys['e'] ? 1 : 0) - (keys['q'] ? 1 : 0);

  if (keys['arrowup'])   aircraft.setThrottle(aircraft.throttle + dt * 0.5);
  if (keys['arrowdown']) aircraft.setThrottle(aircraft.throttle - dt * 0.5);

  // Update
  aircraft.update(dt, (x, z) => world.getTerrainHeight(x, z));
  world.update(aircraft.position.x, aircraft.position.z, time);

  // HUD
  const loc = world.getLocationName(aircraft.position.x, aircraft.position.z);
  hud.update(aircraft, loc);
  if (Math.round(time * 10) % 3 === 0) {
    hud.updateMinimap(aircraft, (x, z) => world.getTerrainHeight(x, z));
  }

  renderer.render(scene, aircraft.camera);
}

frame();
