'use strict';

const CESIUM_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4MGViMDBiNC0wMzM4LTQ3OGEtOTgzOC05NzVjNWJmYjNkNmEiLCJpZCI6NDIzNjgxLCJpYXQiOjE3NzcxODU4NTl9.IrAO4qaQUBLFli4ennYEX79ONLZVhKDAXUS2w6MhrHg';

const LOCATIONS = [
  { name: '東京',             sub: 'TOKYO, JAPAN',           lat:35.69, lng:139.76, alt:500,  heading:90  },
  { name: '富士山',           sub: 'MT. FUJI, JAPAN',        lat:35.60, lng:138.78, alt:1200, heading:185 },
  { name: '立山連峰',         sub: 'TATEYAMA, JAPAN',         lat:36.55, lng:137.52, alt:3000, heading:110 },
  { name: 'ハワイ',           sub: 'HAWAII, USA',             lat:19.82, lng:-155.47,alt:1500, heading:300 },
  { name: 'グランドキャニオン', sub: 'GRAND CANYON, USA',      lat:36.10, lng:-112.10,alt:2200, heading:175 },
  { name: 'ヒマラヤ',         sub: 'HIMALAYAS',               lat:27.99, lng:86.93,  alt:4500, heading:90  },
  { name: 'アルプス',         sub: 'ALPS, EUROPE',            lat:45.98, lng:7.65,   alt:2500, heading:200 },
  { name: 'パタゴニア',       sub: 'PATAGONIA',               lat:-50.96,lng:-73.15, alt:1500, heading:0   },
];

class FlightSimulator {
  constructor() {
    this.state = {
      lat: 35.69,       // 東京・新宿上空からスタート
      lng: 139.76,
      alt: 500,         // 500m（ビルが見える高度）
      speed: 70,        // m/s
      heading: 90,      // 東向き
      pitch: 0,
      bank: 0,
      throttle: 0.38,
      vs: 0,
      stall: false,
    };
    this.input   = { pitch: 0, bank: 0, altAdj: 0 };
    this.viewer  = null;
    this.lastT   = null;

    this._buildCompassTape();
    this._initJoystick();
    this._initThrottle();
    this._initButtons();
    this._initAltButtons();
    this._initLocModal();
    this._initCesium();
  }

  // ── Cesium 3D Globe ───────────────────────────────────────────────────────
  async _initCesium() {
    Cesium.Ion.defaultAccessToken = CESIUM_TOKEN;

    const loadingMsg = document.getElementById('loading-msg');

    try {
      loadingMsg.textContent = '3D地形データを取得中...';
      const terrainProvider = await Cesium.createWorldTerrainAsync({
        requestWaterMask:    true,
        requestVertexNormals: true,
      });

      loadingMsg.textContent = '衛星画像を読み込み中...';
      this.viewer = new Cesium.Viewer('cesiumContainer', {
        terrainProvider,
        animation:                          false,
        baseLayerPicker:                    false,
        fullscreenButton:                   false,
        geocoder:                           false,
        homeButton:                         false,
        infoBox:                            false,
        sceneModePicker:                    false,
        selectionIndicator:                 false,
        timeline:                           false,
        navigationHelpButton:               false,
        navigationInstructionsInitiallyVisible: false,
        requestRenderMode:                  false,
        shadows:                            false,
      });

      // Disable default camera controller
      const ssc = this.viewer.scene.screenSpaceCameraController;
      ssc.enableRotate    = false;
      ssc.enableTranslate = false;
      ssc.enableZoom      = false;
      ssc.enableTilt      = false;
      ssc.enableLook      = false;

      // 3D Buildings (OpenStreetMap)
      try {
        const buildings = await Cesium.createOsmBuildingsAsync();
        this.viewer.scene.primitives.add(buildings);
      } catch (_) {}

      // Visual settings
      this.viewer.scene.globe.depthTestAgainstTerrain = true;
      this.viewer.scene.globe.enableLighting          = true;
      this.viewer.scene.verticalExaggeration           = 2.5;
      this.viewer.scene.fog.enabled                   = true;
      this.viewer.scene.fog.density                   = 0.00002;
      this.viewer.scene.skyAtmosphere.show            = true;
      this.viewer.scene.sun.show                      = true;
      this.viewer.scene.moon.show                     = true;
      this.viewer.scene.skyBox.show                   = true;

      // FOV (視野角)
      const frustum = this.viewer.camera.frustum;
      if (frustum.fov !== undefined) {
        frustum.fov = Cesium.Math.toRadians(78);
      }

      // Hide loading screen
      document.getElementById('loading').style.display = 'none';

      // Game loop via postRender (syncs with Cesium render cycle)
      this.viewer.scene.postRender.addEventListener(() => {
        const now = performance.now();
        if (this.lastT === null) { this.lastT = now; return; }
        const dt = Math.min((now - this.lastT) / 1000, 0.05);
        this.lastT = now;
        this._update(dt);
        this._render();
      });

    } catch (e) {
      loadingMsg.textContent = 'エラー: ' + e.message;
    }
  }

  // ── Physics ───────────────────────────────────────────────────────────────
  _update(dt) {
    const s = this.state, inp = this.input;

    // Bank
    s.bank += inp.bank * 45 * dt;
    s.bank  = Math.max(-55, Math.min(55, s.bank));
    if (inp.bank === 0) s.bank *= Math.pow(0.94, dt * 60);

    // Pitch
    s.pitch += inp.pitch * 22 * dt;
    s.pitch  = Math.max(-35, Math.min(40, s.pitch));
    if (inp.pitch === 0) s.pitch *= Math.pow(0.96, dt * 60);

    // Coordinated turn
    const bankRad = s.bank * Math.PI / 180;
    s.heading = (s.heading + (s.speed / 9.81) * Math.tan(bankRad) * (180 / Math.PI) * dt + 360) % 360;

    // Speed from throttle (40〜260 m/s)
    s.speed += (s.throttle * 220 + 40 - s.speed) * Math.min(dt * 0.3, 1);

    // Stall
    s.stall = s.speed < 60 && s.alt > 100;
    if (s.stall) s.pitch -= 10 * dt;

    // Vertical speed & altitude
    s.vs  = Math.sin(s.pitch * Math.PI / 180) * s.speed * Math.cos(bankRad);
    s.alt = Math.max(50, Math.min(13000, s.alt + s.vs * dt));

    // Direct altitude adjustment (Q/E keys or alt buttons)
    if (this.input.altAdj !== 0) {
      s.alt = Math.max(50, Math.min(13000, s.alt + this.input.altAdj * 120 * dt));
    }

    // Terrain proximity warning (below 300m and descending)
    const terrainWarn = s.alt < 300 && s.vs < -5;
    document.getElementById('terrain-warn').style.display = terrainWarn ? 'block' : 'none';

    // Move position
    const hRad = s.heading * Math.PI / 180;
    const lRad = s.lat     * Math.PI / 180;
    const d    = s.speed * dt;
    s.lat += (d * Math.cos(hRad) / 6371000) * (180 / Math.PI);
    s.lng += (d * Math.sin(hRad) / (6371000 * Math.cos(lRad))) * (180 / Math.PI);
    if (s.lng >  180) s.lng -= 360;
    if (s.lng < -180) s.lng += 360;
    s.lat = Math.max(-85, Math.min(85, s.lat));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  _render() {
    const s = this.state;
    if (!this.viewer) return;

    // ── Cesium camera = cockpit view ──────────────────────────────────────
    this.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(s.lng, s.lat, s.alt + 3),
      orientation: {
        heading: Cesium.Math.toRadians(s.heading),
        pitch:   Cesium.Math.toRadians(s.pitch),
        roll:    Cesium.Math.toRadians(s.bank),
      },
    });

    // ── Pitch ladder (rolls counter to bank, shifts with pitch) ──────────
    document.getElementById('pitch-ladder').style.transform =
      `translate(-50%,-50%) rotate(${(-s.bank).toFixed(2)}deg) translateY(${(s.pitch * 3.8).toFixed(1)}px)`;

    // ── HUD values ────────────────────────────────────────────────────────
    document.getElementById('hud-spd').textContent  = (s.speed * 1.944).toFixed(0);
    document.getElementById('hud-mach').textContent = (s.speed / 340).toFixed(2);
    document.getElementById('hud-alt').textContent  = Math.round(s.alt);
    document.getElementById('hud-vs').textContent   = (s.vs >= 0 ? '+' : '') + s.vs.toFixed(0);

    this._updateCompass(Math.round(s.heading));

    const la = Math.abs(s.lat).toFixed(4) + (s.lat >= 0 ? '°N' : '°S');
    const lo = Math.abs(s.lng).toFixed(4) + (s.lng >= 0 ? '°E' : '°W');
    document.getElementById('hud-location').textContent = `${la}  ${lo}`;

    document.getElementById('stall').style.display = s.stall ? 'block' : 'none';

    document.getElementById('throttle-fill').style.height   = `${s.throttle * 100}%`;
    document.getElementById('throttle-handle').style.bottom = `${s.throttle * 120}px`;
    document.getElementById('thr-pct').textContent          = `${Math.round(s.throttle * 100)}%`;
  }

  // ── Compass ───────────────────────────────────────────────────────────────
  _buildCompassTape() {
    const marks = [
      [0,'N'],[30,'30'],[45,'NE'],[60,'60'],[90,'E'],
      [120,'120'],[135,'SE'],[150,'150'],[180,'S'],
      [210,'210'],[225,'SW'],[240,'240'],[270,'W'],
      [300,'300'],[315,'NW'],[330,'330'],[360,'N'],
    ];
    this._pxDeg = 2.5;
    const tape = document.getElementById('compass-tape');
    tape.style.width = `${360 * this._pxDeg * 2}px`;
    for (let r = 0; r < 2; r++) {
      for (const [deg, lbl] of marks) {
        const sp = document.createElement('span');
        sp.textContent = lbl;
        sp.style.left  = `${(deg + r * 360) * this._pxDeg}px`;
        tape.appendChild(sp);
      }
    }
  }

  _updateCompass(hdg) {
    document.getElementById('compass-tape').style.transform =
      `translateX(${105 - hdg * this._pxDeg}px)`;
    const cards = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                   'S','SSW','SW','WSW','W','WNW','NW','NNW'];
    document.getElementById('compass-hdg').textContent =
      `${String(hdg).padStart(3,'0')}°  ${cards[Math.round(hdg / 22.5) % 16]}`;
  }

  // ── Joystick ──────────────────────────────────────────────────────────────
  _initJoystick() {
    const zone = document.getElementById('joystick-zone');
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    const maxR = 55;
    let aid = null, cx = 0, cy = 0;

    const resetBase = () => {
      const zr = zone.getBoundingClientRect();
      base.style.left    = '16px';
      base.style.top     = (zr.height - 146) + 'px';
      base.style.opacity = '0.5';
      knob.style.transform = 'translate(-50%,-50%)';
    };
    resetBase();
    window.addEventListener('resize', resetBase);

    const start = (e) => {
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      cx = t.clientX; cy = t.clientY;
      const zr = zone.getBoundingClientRect();
      base.style.left    = (cx - zr.left - 65) + 'px';
      base.style.top     = (cy - zr.top  - 65) + 'px';
      base.style.opacity = '0.85';
      aid = e.touches ? t.identifier : 'mouse';
    };

    const move = (e) => {
      e.preventDefault();
      if (aid === null) return;
      const t = e.touches ? [...e.touches].find(x => x.identifier === aid) : e;
      if (!t) return;
      const dx = t.clientX - cx, dy = t.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const d  = Math.min(dist, maxR);
      const ox = dist > 0 ? (dx / dist) * d : 0;
      const oy = dist > 0 ? (dy / dist) * d : 0;
      knob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
      this.input.bank  =  ox / maxR;
      this.input.pitch = -oy / maxR;
    };

    const end = (e) => {
      if (aid === null) return;
      if (e.changedTouches) {
        const match = [...e.changedTouches].some(t => t.identifier === aid);
        if (!match) return;
      }
      aid = null;
      this.input.bank = this.input.pitch = 0;
      resetBase();
    };

    zone.addEventListener('touchstart',    start, { passive: false });
    window.addEventListener('touchmove',   move,  { passive: false });
    window.addEventListener('touchend',    end,   { passive: false });
    window.addEventListener('touchcancel', end,   { passive: false });
    zone.addEventListener('mousedown',     start);
    window.addEventListener('mousemove',   move);
    window.addEventListener('mouseup',     end);
  }

  // ── Throttle ──────────────────────────────────────────────────────────────
  _initThrottle() {
    const track = document.getElementById('throttle-track');
    let drag = false;
    const set = (y) => {
      const r = track.getBoundingClientRect();
      this.state.throttle = 1 - Math.max(0, Math.min(1, (y - r.top) / r.height));
    };
    const start = (e) => { e.preventDefault(); drag = true; set(e.touches ? e.touches[0].clientY : e.clientY); };
    const move  = (e) => { if (!drag) return; e.preventDefault(); set(e.touches ? e.touches[0].clientY : e.clientY); };
    const end   = ()  => { drag = false; };
    track.addEventListener('touchstart',  start, { passive: false });
    track.addEventListener('touchmove',   move,  { passive: false });
    track.addEventListener('touchend',    end,   { passive: false });
    track.addEventListener('mousedown',   start);
    window.addEventListener('mousemove',  move);
    window.addEventListener('mouseup',    end);
  }

  // ── Altitude Buttons ──────────────────────────────────────────────────────
  _initAltButtons() {
    const up = document.getElementById('btn-alt-up');
    const dn = document.getElementById('btn-alt-dn');
    const set = (v) => { this.input.altAdj = v; };
    const stop = () => { this.input.altAdj = 0; };
    for (const [btn, val] of [[up, 1], [dn, -1]]) {
      btn.addEventListener('touchstart',  (e) => { e.preventDefault(); set(val); }, { passive: false });
      btn.addEventListener('touchend',    (e) => { e.preventDefault(); stop(); },   { passive: false });
      btn.addEventListener('touchcancel', (e) => { e.preventDefault(); stop(); },   { passive: false });
      btn.addEventListener('mousedown',   () => set(val));
      btn.addEventListener('mouseup',     stop);
      btn.addEventListener('mouseleave',  stop);
    }
  }

  // ── Location Modal ────────────────────────────────────────────────────────
  _initLocModal() {
    const modal = document.getElementById('loc-modal');

    // Build location buttons
    for (const loc of LOCATIONS) {
      const btn = document.createElement('button');
      btn.className = 'loc-btn';
      btn.innerHTML = `${loc.name}<span class="loc-sub">${loc.sub}</span>`;
      btn.addEventListener('click', () => {
        this._teleport(loc);
        modal.classList.remove('show');
      });
      modal.appendChild(btn);
    }

    // Cancel button
    const cancel = document.createElement('button');
    cancel.id = 'loc-cancel';
    cancel.textContent = '[ CANCEL ]';
    cancel.addEventListener('click', () => modal.classList.remove('show'));
    modal.appendChild(cancel);
  }

  _teleport(loc) {
    Object.assign(this.state, {
      lat: loc.lat, lng: loc.lng, alt: loc.alt,
      heading: loc.heading, pitch: 0, bank: 0,
      speed: 70, throttle: 0.38, vs: 0, stall: false,
    });
  }

  // ── Buttons ───────────────────────────────────────────────────────────────
  _initButtons() {
    document.getElementById('btn-reset').addEventListener('click', () => {
      this._teleport(LOCATIONS[0]);
    });
    document.getElementById('btn-loc').addEventListener('click', () => {
      document.getElementById('loc-modal').classList.add('show');
    });
  }
}

// ── Keyboard (PC) ─────────────────────────────────────────────────────────────
function setupKeyboard(sim) {
  const h = {};
  window.addEventListener('keydown', e => { h[e.key] = true; });
  window.addEventListener('keyup',   e => { h[e.key] = false; });
  setInterval(() => {
    sim.input.pitch  = (h['s'] || h['ArrowDown']  ? 1 : 0) - (h['w'] || h['ArrowUp']    ? 1 : 0);
    sim.input.bank   = (h['d'] || h['ArrowRight'] ? 1 : 0) - (h['a'] || h['ArrowLeft']  ? 1 : 0);
    sim.input.altAdj = (h['q'] ? 1 : 0) - (h['e'] ? 1 : 0);
    if (h['+'] || h['=']) sim.state.throttle = Math.min(1, sim.state.throttle + 0.006);
    if (h['-'] || h['_']) sim.state.throttle = Math.max(0, sim.state.throttle - 0.006);
    if (h['r']) { sim._teleport(LOCATIONS[0]); delete h['r']; }
  }, 16);
}

const sim = new FlightSimulator();
setupKeyboard(sim);
