export class HUD {
  constructor() {
    this.alt    = document.getElementById('alt');
    this.spd    = document.getElementById('spd');
    this.vspd   = document.getElementById('vspd');
    this.hdg    = document.getElementById('hdg');
    this.pitch  = document.getElementById('pitch');
    this.bank   = document.getElementById('bank');
    this.loc    = document.getElementById('location');
    this.stall  = document.getElementById('stall-warning');
    this.thr    = document.getElementById('throttle-fill');
    this.tape   = document.getElementById('compass-tape');

    this.mmCtx  = document.getElementById('minimap-canvas').getContext('2d');

    // Compass marks: 0..359 mapped to tape positions
    this.compassMarks = [
      [0,'N'],[45,'NE'],[90,'E'],[135,'SE'],
      [180,'S'],[225,'SW'],[270,'W'],[315,'NW'],[360,'N'],
    ];
  }

  update(aircraft, locationName) {
    const alt  = aircraft.position.y;
    const spd  = aircraft.speedKnots;
    const vs   = aircraft.verticalSpeed;
    const hdg  = aircraft.headingDeg();
    const p    = aircraft.pitchDeg();
    const b    = aircraft.bankDeg();

    this.alt.textContent  = `${Math.round(alt)} m`;
    this.spd.textContent  = `${Math.round(spd)} kts`;
    this.vspd.textContent = `${vs >= 0 ? '+' : ''}${vs.toFixed(1)} m/s`;
    this.hdg.textContent  = `${String(Math.round(hdg)).padStart(3,'0')}°`;
    this.pitch.textContent = `${p.toFixed(1)}°`;
    this.bank.textContent  = `${b.toFixed(1)}°`;
    this.loc.textContent   = locationName;

    // Stall
    this.stall.style.display = aircraft.isStalling() ? 'block' : 'none';

    // Throttle bar
    this.thr.style.height = `${aircraft.throttle * 100}%`;

    // Compass tape: shift by heading
    // Full tape = 360 deg, element is 200px, so 200px = 180 deg visible
    // tape total width ~ 800px for 360 deg
    const pxPerDeg = 800 / 360;
    const shift = -(hdg * pxPerDeg) + 0; // center at heading
    this.tape.style.transform = `translateX(${shift}px)`;
  }

  updateMinimap(aircraft, getTerrainHeight) {
    const ctx = this.mmCtx;
    const W = 140, H = 140;
    const scale = 8000; // world units in minimap radius
    ctx.clearRect(0, 0, W, H);

    // Draw terrain pixels
    const imgd = ctx.createImageData(W, H);
    const px = aircraft.position.x;
    const pz = aircraft.position.z;
    for (let py = 0; py < H; py++) {
      for (let ppx = 0; ppx < W; ppx++) {
        const wx = px + (ppx - W/2) / W * scale;
        const wz = pz + (py - H/2) / H * scale;
        const h  = getTerrainHeight(wx, wz);
        const i  = (py * W + ppx) * 4;
        const dx = ppx - W/2, dy = py - H/2;
        if (dx*dx + dy*dy > (W/2)*(W/2)) { imgd.data[i+3] = 0; continue; }
        if (h < 5) { imgd.data[i]=30; imgd.data[i+1]=80; imgd.data[i+2]=160; }
        else if (h < 200) { imgd.data[i]=60; imgd.data[i+1]=130; imgd.data[i+2]=50; }
        else if (h < 800) { imgd.data[i]=50; imgd.data[i+1]=100; imgd.data[i+2]=40; }
        else { imgd.data[i]=150; imgd.data[i+1]=150; imgd.data[i+2]=140; }
        imgd.data[i+3] = 220;
      }
    }
    ctx.putImageData(imgd, 0, 0);

    // Aircraft marker
    ctx.save();
    ctx.translate(W/2, H/2);
    ctx.rotate(-aircraft.yaw);
    ctx.fillStyle = '#00ff88';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(4, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
