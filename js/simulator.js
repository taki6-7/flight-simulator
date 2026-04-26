'use strict';

class FlightSimulator {
  constructor() {
    this.state = {
      lat: 35.6762, lng: 139.6503,
      alt: 800, speed: 90,
      heading: 0, pitch: 0, bank: 0,
      throttle: 0.65, vs: 0,
      flaps: false, gear: true, stall: false,
    };
    this.input = { pitch: 0, bank: 0 };
    this.map = null;
    this.lastT = null;

    this._buildCompassTape();
    this._initJoystick();
    this._initThrottle();
    this._initButtons();
    this._initMap();
  }

  _initMap() {
    this.map = L.map('map', {
      center: [this.state.lat, this.state.lng],
      zoom: 15,
      zoomControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: '© Esri', maxZoom: 19 }
    ).addTo(this.map);

    L.tileLayer(
      'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { opacity: 0.7, maxZoom: 19 }
    ).addTo(this.map);

    requestAnimationFrame(t => this._loop(t));
  }

  _loop(ts) {
    if (this.lastT === null) this.lastT = ts;
    const dt = Math.min((ts - this.lastT) / 1000, 0.05);
    this.lastT = ts;
    this._update(dt);
    this._render();
    requestAnimationFrame(t => this._loop(t));
  }

  _update(dt) {
    const s = this.state, inp = this.input;

    s.bank  += inp.bank  * 45 * dt;
    s.bank   = Math.max(-50, Math.min(50, s.bank));
    if (inp.bank  === 0) s.bank  *= Math.pow(0.80, dt * 60);

    s.pitch += inp.pitch * 22 * dt;
    s.pitch  = Math.max(-30, Math.min(35, s.pitch));
    if (inp.pitch === 0) s.pitch *= Math.pow(0.88, dt * 60);

    const bankRad = s.bank * Math.PI / 180;
    s.heading = (s.heading + (s.speed / 9.81) * Math.tan(bankRad) * (180 / Math.PI) * dt + 360) % 360;

    s.speed += (s.throttle * 220 + 40 - s.speed) * Math.min(dt * 0.35, 1);

    s.vs  = Math.sin(s.pitch * Math.PI / 180) * s.speed * Math.cos(bankRad);
    s.alt = Math.max(30, Math.min(12000, s.alt + s.vs * dt));

    s.stall = s.speed < 60 && s.alt > 60;
    if (s.stall) s.pitch -= 8 * dt;

    const hRad = s.heading * Math.PI / 180;
    const lRad = s.lat * Math.PI / 180;
    const d    = s.speed * dt;
    s.lat += (d * Math.cos(hRad) / 6371000) * (180 / Math.PI);
    s.lng += (d * Math.sin(hRad) / (6371000 * Math.cos(lRad))) * (180 / Math.PI);
    if (s.lng >  180) s.lng -= 360;
    if (s.lng < -180) s.lng += 360;
    s.lat = Math.max(-85, Math.min(85, s.lat));
  }

  _render() {
    const s = this.state;

    this.map.setView([s.lat, s.lng], this._altToZoom(s.alt), { animate: false });
    document.getElementById('map-wrapper').style.transform =
      `perspective(1200px) rotateX(30deg) rotateZ(${-s.heading}deg)`;

    document.getElementById('aircraft-wrap').style.transform =
      `translate(-50%,-50%) rotate(${s.bank.toFixed(1)}deg)`;

    document.getElementById('pitch-ladder').style.transform =
      `translate(-50%,-50%) rotate(${(-s.bank).toFixed(1)}deg) translateY(${(s.pitch * 3.5).toFixed(1)}px)`;

    document.getElementById('hud-spd').textContent  = (s.speed * 1.944).toFixed(0);
    document.getElementById('hud-mach').textContent = (s.speed / 340).toFixed(2);
    document.getElementById('hud-alt').textContent  = Math.round(s.alt);
    document.getElementById('hud-vs').textContent   = (s.vs >= 0 ? '+' : '') + s.vs.toFixed(0);

    this._updateCompass(Math.round(s.heading));

    const la = Math.abs(s.lat).toFixed(4) + (s.lat >= 0 ? '°N' : '°S');
    const lo = Math.abs(s.lng).toFixed(4) + (s.lng >= 0 ? '°E' : '°W');
    document.getElementById('hud-location').textContent = `${la}  ${lo}`;

    document.getElementById('stall').style.display    = s.stall ? 'block' : 'none';
    document.getElementById('gear-warn').style.display =
      (!s.gear && s.alt < 500 && s.speed < 100) ? 'block' : 'none';

    document.getElementById('throttle-fill').style.height   = `${s.throttle * 100}%`;
    document.getElementById('throttle-handle').style.bottom = `${s.throttle * 120}px`;
    document.getElementById('thr-pct').textContent = `${Math.round(s.throttle * 100)}%`;
  }

  _buildCompassTape() {
    const marks = [
      [0,'N'],[45,'NE'],[90,'E'],[135,'SE'],
      [180,'S'],[225,'SW'],[270,'W'],[315,'NW'],[360,'N'],
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
      `translateX(${100 - hdg * this._pxDeg}px)`;
    const cards = ['N','NNE','NE','ENE','E','ESE','SE','SSE',
                   'S','SSW','SW','WSW','W','WNW','NW','NNW'];
    document.getElementById('compass-hdg').textContent =
      `${String(hdg).padStart(3,'0')}° ${cards[Math.round(hdg / 22.5) % 16]}`;
  }

  _altToZoom(alt) {
    if (alt <  300) return 17;
    if (alt <  600) return 16;
    if (alt < 1200) return 15;
    if (alt < 2500) return 14;
    if (alt < 5000) return 13;
    if (alt < 8000) return 12;
    return 11;
  }

  _initJoystick() {
    const base = document.getElementById('joystick-base');
    const knob = document.getElementById('joystick-knob');
    const maxR = 45;
    let aid = null, cx = 0, cy = 0;

    const start = (e) => {
      e.preventDefault();
      const t = e.touches ? e.touches[0] : e;
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      aid = e.touches ? t.identifier : 'mouse';
    };
    const move = (e) => {
      e.preventDefault();
      if (aid === null) return;
      let t = e.touches ? [...e.touches].find(x => x.identifier === aid) : e;
      if (!t) return;
      const dx = t.clientX - cx, dy = t.clientY - cy;
      const d = Math.min(Math.sqrt(dx*dx+dy*dy), maxR);
      const a = Math.atan2(dy, dx);
      const ox = Math.cos(a)*d, oy = Math.sin(a)*d;
      knob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
      this.input.bank  =  ox / maxR;
      this.input.pitch = -oy / maxR;
    };
    const end = (e) => {
      e.preventDefault(); aid = null;
      knob.style.transform = 'translate(-50%,-50%)';
      this.input.bank = this.input.pitch = 0;
    };

    base.addEventListener('touchstart',  start, { passive:false });
    base.addEventListener('touchmove',   move,  { passive:false });
    base.addEventListener('touchend',    end,   { passive:false });
    base.addEventListener('touchcancel', end,   { passive:false });
    base.addEventListener('mousedown',   start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup',   end);
  }

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
    track.addEventListener('touchstart',  start, { passive:false });
    track.addEventListener('touchmove',   move,  { passive:false });
    track.addEventListener('touchend',    end,   { passive:false });
    track.addEventListener('mousedown',   start);
    window.addEventListener('mousemove',  move);
    window.addEventListener('mouseup',    end);
  }

  _initButtons() {
    const g = document.getElementById('btn-gear');
    const f = document.getElementById('btn-flaps');
    g.addEventListener('click', () => {
      this.state.gear = !this.state.gear;
      g.textContent = this.state.gear ? 'GEAR↓' : 'GEAR↑';
      g.classList.toggle('on', !this.state.gear);
    });
    f.addEventListener('click', () => {
      this.state.flaps = !this.state.flaps;
      f.textContent = this.state.flaps ? 'FLAP 1' : 'FLAPS';
      f.classList.toggle('on', this.state.flaps);
    });
    document.getElementById('btn-reset').addEventListener('click', () => {
      Object.assign(this.state, {
        lat:35.6762, lng:139.6503, alt:800, speed:90,
        heading:0, pitch:0, bank:0, throttle:0.65, vs:0, stall:false,
      });
      g.textContent='GEAR↓'; g.classList.remove('on');
      f.textContent='FLAPS'; f.classList.remove('on');
    });
  }
}

function setupKeyboard(sim) {
  const h = {};
  window.addEventListener('keydown', e => { h[e.key] = true; });
  window.addEventListener('keyup',   e => { h[e.key] = false; });
  setInterval(() => {
    sim.input.pitch = (h['s']||h['ArrowDown'] ?1:0) - (h['w']||h['ArrowUp']   ?1:0);
    sim.input.bank  = (h['d']||h['ArrowRight']?1:0) - (h['a']||h['ArrowLeft'] ?1:0);
    if (h['+'] || h['=']) sim.state.throttle = Math.min(1, sim.state.throttle + 0.005);
    if (h['-'] || h['_']) sim.state.throttle = Math.max(0, sim.state.throttle - 0.005);
    if (h['r']) { sim.state.lat=35.6762; sim.state.lng=139.6503; sim.state.alt=800;
                  sim.state.speed=90; sim.state.heading=0; delete h['r']; }
  }, 16);
}

const sim = new FlightSimulator();
setupKeyboard(sim);
