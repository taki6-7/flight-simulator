'use strict';

// ── Flight Simulator (Google Maps + Mobile) ──────────────────────────────────

class FlightSimulator {
  constructor() {
    // Aircraft state
    this.state = {
      lat:      35.6762,   // Tokyo default
      lng:      139.6503,
      alt:      800,       // meters above sea level
      speed:    90,        // m/s true airspeed
      heading:  0,         // degrees (0=North)
      pitch:    0,         // degrees, +up
      bank:     0,         // degrees, +right
      throttle: 0.65,
      vs:       0,         // vertical speed m/s
      flaps:    false,
      gear:     true,
      stall:    false,
    };

    this.input = { pitch: 0, bank: 0 }; // normalised -1..1
    this.map   = null;
    this.lastT = null;

    this._buildCompassTape();
    this._initJoystick();
    this._initThrottle();
    this._initButtons();
  }

  // ── Map init (called after Google Maps API loads) ─────────────────────────
  initMap() {
    this.map = new google.maps.Map(document.getElementById('map'), {
      center:             { lat: this.state.lat, lng: this.state.lng },
      zoom:               this._altToZoom(this.state.alt),
      mapTypeId:          'satellite',
      tilt:               45,
      heading:            this.state.heading,
      disableDefaultUI:   true,
      gestureHandling:    'none',
      keyboardShortcuts:  false,
      backgroundColor:    '#000',
    });

    requestAnimationFrame(t => this._loop(t));
  }

  // ── Main loop ─────────────────────────────────────────────────────────────
  _loop(timestamp) {
    if (this.lastT === null) this.lastT = timestamp;
    const dt = Math.min((timestamp - this.lastT) / 1000, 0.05);
    this.lastT = timestamp;

    this._update(dt);
    this._render();

    requestAnimationFrame(t => this._loop(t));
  }

  // ── Physics ───────────────────────────────────────────────────────────────
  _update(dt) {
    const s   = this.state;
    const inp = this.input;

    // Bank control (roll rate ≈ 40°/s max)
    const bankRate = 45;
    s.bank += inp.bank * bankRate * dt;
    s.bank  = Math.max(-50, Math.min(50, s.bank));
    if (inp.bank === 0) s.bank *= Math.pow(0.80, dt * 60); // self-centre

    // Pitch control (pitch rate ≈ 20°/s max)
    const pitchRate = 22;
    s.pitch += inp.pitch * pitchRate * dt;
    s.pitch  = Math.max(-30, Math.min(35, s.pitch));
    if (inp.pitch === 0) s.pitch *= Math.pow(0.88, dt * 60);

    // Coordinated turn: bank → heading rate
    // At bank 45° and 90 kts cruise ≈ 3°/s standard rate
    const bankRad = s.bank * Math.PI / 180;
    const turnRate = (s.speed / 9.81) * Math.tan(bankRad) * (180 / Math.PI);
    s.heading = (s.heading + turnRate * dt + 360) % 360;

    // Throttle → target speed (40 – 260 m/s, ~78 – 505 kts)
    const targetSpeed = s.throttle * 220 + 40;
    s.speed += (targetSpeed - s.speed) * Math.min(dt * 0.35, 1);

    // Lift reduction in steep bank
    const liftFactor = Math.cos(bankRad);

    // Vertical speed from pitch + gravity compensation
    s.vs = Math.sin(s.pitch * Math.PI / 180) * s.speed * liftFactor;

    // Altitude
    s.alt += s.vs * dt;
    s.alt  = Math.max(30, Math.min(12000, s.alt));

    // Stall: below ~60 m/s (~117 kts) while airborne
    s.stall = (s.speed < 60 && s.alt > 60);

    // Stall effect: nose drops, speed builds
    if (s.stall) {
      s.pitch -= 8 * dt;
    }

    // Move position (great-circle approximation)
    const headRad = s.heading * Math.PI / 180;
    const latRad  = s.lat    * Math.PI / 180;
    const R       = 6371000;
    const dist    = s.speed * dt;

    s.lat += (dist * Math.cos(headRad) / R) * (180 / Math.PI);
    s.lng += (dist * Math.sin(headRad) / (R * Math.cos(latRad))) * (180 / Math.PI);

    // Wrap longitude
    if (s.lng >  180) s.lng -= 360;
    if (s.lng < -180) s.lng += 360;
    // Clamp latitude
    s.lat = Math.max(-85, Math.min(85, s.lat));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  _render() {
    const s = this.state;

    // Update Google Map
    if (this.map) {
      this.map.setCenter({ lat: s.lat, lng: s.lng });
      this.map.setHeading(s.heading);
      this.map.setZoom(this._altToZoom(s.alt));
      // Tilt: reduce at extreme altitude
      const tilt = s.alt < 8000 ? 45 : 30;
      this.map.setTilt(tilt);
    }

    // Aircraft bank visual
    const wrap = document.getElementById('aircraft-wrap');
    wrap.style.transform = `translate(-50%,-50%) rotate(${s.bank.toFixed(1)}deg)`;

    // Pitch ladder shift (4px per degree)
    const ladder = document.getElementById('pitch-ladder');
    ladder.style.transform =
      `translate(-50%,-50%) rotate(${(-s.bank).toFixed(1)}deg) translateY(${(s.pitch * 3.5).toFixed(1)}px)`;

    // Speed
    const kts = (s.speed * 1.944).toFixed(0);
    document.getElementById('hud-spd').textContent  = kts;
    document.getElementById('hud-gspd').textContent = kts; // ground speed ≈ TAS (simplified)

    // Altitude & VS
    document.getElementById('hud-alt').textContent = Math.round(s.alt);
    document.getElementById('hud-vs').textContent  = (s.vs >= 0 ? '+' : '') + s.vs.toFixed(0);

    // Compass
    const hdg = Math.round(s.heading);
    this._updateCompass(hdg);

    // Location
    const latStr = Math.abs(s.lat).toFixed(3) + (s.lat >= 0 ? '°N' : '°S');
    const lngStr = Math.abs(s.lng).toFixed(3) + (s.lng >= 0 ? '°E' : '°W');
    document.getElementById('hud-location').textContent = `${latStr}  ${lngStr}`;

    // Stall warning
    document.getElementById('stall').style.display = s.stall ? 'block' : 'none';

    // Gear warning (on approach: below 500 m, gear retracted, speed < 100 m/s)
    const gearWarn = !s.gear && s.alt < 500 && s.speed < 100;
    const gw = document.getElementById('gear-warn');
    gw.style.display = gearWarn ? 'block' : 'none';

    // Throttle bar
    document.getElementById('throttle-fill').style.height   = `${s.throttle * 100}%`;
    document.getElementById('throttle-handle').style.bottom = `${s.throttle * 120}px`;
    document.getElementById('thr-pct').textContent = `${Math.round(s.throttle * 100)}%`;
  }

  // ── Compass tape ──────────────────────────────────────────────────────────
  _buildCompassTape() {
    const marks = [
      [0,'N'],[30,'30'],[45,'NE'],[60,'60'],[90,'E'],
      [120,'120'],[135,'SE'],[150,'150'],[180,'S'],
      [210,'210'],[225,'SW'],[240,'240'],[270,'W'],
      [300,'300'],[315,'NW'],[330,'330'],[360,'N'],
    ];
    // Build a wide tape: 3px per degree
    this._compassPxPerDeg = 2.5;
    const tape = document.getElementById('compass-tape');
    tape.innerHTML = '';
    tape.style.width = `${360 * this._compassPxPerDeg * 2}px`; // double for looping
    for (let rep = 0; rep < 2; rep++) {
      for (const [deg, label] of marks) {
        const span = document.createElement('span');
        span.textContent = label;
        span.style.position = 'absolute';
        span.style.left = `${(deg + rep * 360) * this._compassPxPerDeg}px`;
        span.style.top = '50%';
        span.style.transform = 'translateY(-50%)';
        tape.appendChild(span);
      }
    }
  }

  _updateCompass(hdg) {
    const containerW = 200;
    const pxPerDeg   = this._compassPxPerDeg;
    const shift      = containerW / 2 - hdg * pxPerDeg;
    document.getElementById('compass-tape').style.transform = `translateX(${shift}px)`;

    const cardinals = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                       'S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const card = cardinals[Math.round(hdg / 22.5) % 16];
    document.getElementById('compass-hdg').textContent =
      `${String(hdg).padStart(3,'0')}° ${card}`;
  }

  // ── Altitude → zoom ───────────────────────────────────────────────────────
  _altToZoom(alt) {
    if (alt <  200) return 17;
    if (alt <  400) return 16;
    if (alt <  800) return 15;
    if (alt < 1500) return 14;
    if (alt < 3000) return 13;
    if (alt < 6000) return 12;
    if (alt < 9000) return 11;
    return 10;
  }

  // ── Joystick ──────────────────────────────────────────────────────────────
  _initJoystick() {
    const base  = document.getElementById('joystick-base');
    const knob  = document.getElementById('joystick-knob');
    const maxR  = 45;
    let activeId = null;
    let cx = 0, cy = 0;

    const onStart = (e) => {
      e.preventDefault();
      const pt = e.touches ? e.touches[0] : e;
      const r  = base.getBoundingClientRect();
      cx = r.left + r.width  / 2;
      cy = r.top  + r.height / 2;
      activeId = e.touches ? e.touches[0].identifier : 'mouse';
    };

    const onMove = (e) => {
      e.preventDefault();
      if (activeId === null) return;
      let pt;
      if (e.touches) {
        for (const t of e.touches) {
          if (t.identifier === activeId) { pt = t; break; }
        }
        if (!pt) return;
      } else { pt = e; }

      const dx   = pt.clientX - cx;
      const dy   = pt.clientY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamp = Math.min(dist, maxR);
      const angle = Math.atan2(dy, dx);
      const ox = Math.cos(angle) * clamp;
      const oy = Math.sin(angle) * clamp;

      knob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
      this.input.bank  =  ox / maxR;  // right = positive bank
      this.input.pitch = -oy / maxR;  // up    = positive pitch (pull back = nose up)
    };

    const onEnd = (e) => {
      e.preventDefault();
      activeId = null;
      knob.style.transform = 'translate(-50%,-50%)';
      this.input.bank  = 0;
      this.input.pitch = 0;
    };

    base.addEventListener('touchstart',  onStart, { passive: false });
    base.addEventListener('touchmove',   onMove,  { passive: false });
    base.addEventListener('touchend',    onEnd,   { passive: false });
    base.addEventListener('touchcancel', onEnd,   { passive: false });
    base.addEventListener('mousedown',   onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onEnd);
  }

  // ── Throttle slider ───────────────────────────────────────────────────────
  _initThrottle() {
    const track  = document.getElementById('throttle-track');
    const handle = document.getElementById('throttle-handle');
    let dragging = false;

    const setFromY = (clientY) => {
      const r   = track.getBoundingClientRect();
      const pct = 1 - Math.max(0, Math.min(1, (clientY - r.top) / r.height));
      this.state.throttle = pct;
    };

    const onStart = (e) => { e.preventDefault(); dragging = true; setFromY(e.touches ? e.touches[0].clientY : e.clientY); };
    const onMove  = (e) => { if (!dragging) return; e.preventDefault(); setFromY(e.touches ? e.touches[0].clientY : e.clientY); };
    const onEnd   = ()  => { dragging = false; };

    track.addEventListener('touchstart',  onStart, { passive: false });
    track.addEventListener('touchmove',   onMove,  { passive: false });
    track.addEventListener('touchend',    onEnd,   { passive: false });
    track.addEventListener('mousedown',   onStart);
    window.addEventListener('mousemove',  onMove);
    window.addEventListener('mouseup',    onEnd);
  }

  // ── Buttons ───────────────────────────────────────────────────────────────
  _initButtons() {
    const gearBtn  = document.getElementById('btn-gear');
    const flapsBtn = document.getElementById('btn-flaps');
    const resetBtn = document.getElementById('btn-reset');

    gearBtn.addEventListener('click', () => {
      this.state.gear = !this.state.gear;
      gearBtn.textContent = this.state.gear ? 'GEAR↓' : 'GEAR↑';
      gearBtn.classList.toggle('on', !this.state.gear);
    });

    flapsBtn.addEventListener('click', () => {
      this.state.flaps = !this.state.flaps;
      flapsBtn.textContent = this.state.flaps ? 'FLAP 1' : 'FLAPS';
      flapsBtn.classList.toggle('on', this.state.flaps);
      // Flaps: extra drag + slow down target speed
    });

    resetBtn.addEventListener('click', () => {
      Object.assign(this.state, {
        lat: 35.6762, lng: 139.6503, alt: 800,
        speed: 90, heading: 0, pitch: 0, bank: 0,
        throttle: 0.65, vs: 0, stall: false,
      });
      gearBtn.textContent = 'GEAR↓';
      gearBtn.classList.remove('on');
      flapsBtn.textContent = 'FLAPS';
      flapsBtn.classList.remove('on');
    });
  }
}

// ── Keyboard controls (desktop) ──────────────────────────────────────────────
function setupKeyboard(sim) {
  const held = {};
  window.addEventListener('keydown', e => { held[e.key] = true; });
  window.addEventListener('keyup',   e => { held[e.key] = false; });

  setInterval(() => {
    if (!sim) return;
    sim.input.pitch = (held['s'] || held['ArrowDown'] ? 1 : 0) - (held['w'] || held['ArrowUp']   ? 1 : 0);
    sim.input.bank  = (held['d'] || held['ArrowRight']? 1 : 0) - (held['a'] || held['ArrowLeft'] ? 1 : 0);
    if (held['='] || held['+']) sim.state.throttle = Math.min(1,   sim.state.throttle + 0.005);
    if (held['-'] || held['_']) sim.state.throttle = Math.max(0,   sim.state.throttle - 0.005);
    if (held['g']) { sim.state.gear = !sim.state.gear; delete held['g']; }
    if (held['f']) { sim.state.flaps = !sim.state.flaps; delete held['f']; }
    if (held['r']) { sim.state.lat = 35.6762; sim.state.lng = 139.6503; sim.state.alt = 800;
                     sim.state.speed = 90; sim.state.heading = 0; delete held['r']; }
  }, 16);
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
const sim = new FlightSimulator();

function loadGoogleMaps(apiKey) {
  window._gmapsCallback = () => {
    document.getElementById('api-screen').style.display = 'none';
    sim.initMap();
    setupKeyboard(sim);
  };
  const s = document.createElement('script');
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&callback=_gmapsCallback`;
  s.onerror = () => {
    document.getElementById('api-error').style.display = 'block';
    document.getElementById('api-screen').style.display = 'flex';
  };
  document.head.appendChild(s);
}

function getStoredKey() {
  try {
    const p = new URLSearchParams(location.search);
    return p.get('key') || localStorage.getItem('gmaps_key') || '';
  } catch { return ''; }
}

const storedKey = getStoredKey();
if (storedKey) {
  loadGoogleMaps(storedKey);
} else {
  document.getElementById('api-screen').style.display = 'flex';
}

document.getElementById('start-btn').addEventListener('click', () => {
  const key = document.getElementById('api-key-input').value.trim();
  if (!key) return;
  try { localStorage.setItem('gmaps_key', key); } catch {}
  document.getElementById('api-error').style.display = 'none';
  loadGoogleMaps(key);
});
