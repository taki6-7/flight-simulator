import * as THREE from 'three';

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export class Aircraft {
  constructor(scene) {
    this.scene = scene;

    // State
    this.position = new THREE.Vector3(0, 800, 0);
    this.velocity = new THREE.Vector3(60, 0, 0); // m/s forward
    this.pitch = 0;   // radians, nose up positive
    this.yaw = 0;     // radians
    this.roll = 0;    // radians

    this.throttle = 0.5;
    this.flaps = 0;    // 0..1
    this.gear = true;  // down = true

    // Controls input
    this.input = { pitch: 0, roll: 0, yaw: 0 };

    this._buildMesh();
    this._buildCamera();
  }

  _buildMesh() {
    this.group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xddddee, metalness: 0.5, roughness: 0.4 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xccccdd, metalness: 0.4, roughness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, metalness: 0, roughness: 0, transparent: true, opacity: 0.5 });
    const engineMat = new THREE.MeshStandardMaterial({ color: 0x888899, metalness: 0.8, roughness: 0.3 });

    // Fuselage
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.5, 12, 12), bodyMat);
    body.rotation.z = Math.PI / 2;
    this.group.add(body);

    // Nose cone
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3, 12), bodyMat);
    nose.rotation.z = Math.PI / 2;
    nose.position.x = 7.5;
    this.group.add(nose);

    // Cockpit glass
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
    cockpit.rotation.z = Math.PI / 2;
    cockpit.position.set(3.5, 0.6, 0);
    this.group.add(cockpit);

    // Main wings
    const wingGeo = new THREE.BoxGeometry(1.5, 0.12, 14);
    const lwing = new THREE.Mesh(wingGeo, wingMat);
    lwing.position.set(0, -0.1, 7);
    this.group.add(lwing);
    const rwing = new THREE.Mesh(wingGeo, wingMat);
    rwing.position.set(0, -0.1, -7);
    this.group.add(rwing);

    // Winglets
    const wlGeo = new THREE.BoxGeometry(0.8, 1.2, 0.1);
    const lwl = new THREE.Mesh(wlGeo, wingMat);
    lwl.position.set(0, 0.5, 7.05);
    lwl.rotation.z = 0.2;
    this.group.add(lwl);
    const rwl = new THREE.Mesh(wlGeo, wingMat);
    rwl.position.set(0, 0.5, -7.05);
    rwl.rotation.z = -0.2;
    this.group.add(rwl);

    // Horizontal stabilizer
    const hstab = new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 5), wingMat);
    hstab.position.set(-5.5, 0, 0);
    this.group.add(hstab);

    // Vertical stabilizer
    const vstab = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.1), wingMat);
    vstab.position.set(-5, 1, 0);
    vstab.rotation.z = 0.05;
    this.group.add(vstab);

    // Engines
    for (const side of [-1, 1]) {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 2.5, 12), engineMat);
      eng.rotation.z = Math.PI / 2;
      eng.position.set(1, -0.5, side * 4);
      this.group.add(eng);

      const intake = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 8, 12), engineMat);
      intake.position.set(2.2, -0.5, side * 4);
      intake.rotation.y = Math.PI / 2;
      this.group.add(intake);
    }

    this.group.position.copy(this.position);
    this.scene.add(this.group);
  }

  _buildCamera() {
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 1, 150000);
    // Attach camera to cockpit position
    this.camOffset = new THREE.Vector3(3, 1.2, 0);
  }

  get speed() {
    return this.velocity.length();
  }

  get speedKnots() {
    return this.speed * 1.944;
  }

  get verticalSpeed() {
    return this.velocity.y;
  }

  update(dt, getTerrainHeight) {
    const { pitch, roll, yaw, input, throttle } = this;

    // Control surface rates
    const pitchRate = 0.8 * DEG;
    const rollRate  = 1.5 * DEG;
    const yawRate   = 0.4 * DEG;

    this.pitch += input.pitch * pitchRate * dt * 60;
    this.roll  += input.roll  * rollRate  * dt * 60;
    this.yaw   += (input.yaw - this.roll * 0.05) * yawRate * dt * 60;

    // Clamp pitch
    this.pitch = Math.max(-80 * DEG, Math.min(80 * DEG, this.pitch));
    this.roll  = Math.max(-85 * DEG, Math.min(85 * DEG, this.roll));

    // Build orientation quaternion (yaw → pitch → roll)
    const q = new THREE.Quaternion();
    const qYaw   = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), -this.yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), this.pitch);
    const qRoll  = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), this.roll);
    q.multiplyQuaternions(qYaw, qPitch).multiply(qRoll);

    // Forward direction
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);

    // Aerodynamics
    const rho = 1.225 * Math.exp(-this.position.y / 8500); // air density
    const area = 42 + this.flaps * 8;
    const spd = this.velocity.length();

    // Lift
    const aoa = Math.asin(Math.min(1, Math.max(-1, forward.dot(new THREE.Vector3(0,1,0)))));
    const cl = 0.4 + Math.sin(aoa * 2) * 0.8 + this.flaps * 0.3;
    const lift = 0.5 * rho * spd * spd * area * cl;
    const liftForce = up.clone().multiplyScalar(lift / 5000);

    // Drag
    const cd = 0.02 + Math.abs(Math.sin(aoa)) * 0.1 + this.flaps * 0.04 + (this.gear ? 0.02 : 0);
    const drag = 0.5 * rho * spd * spd * area * cd;
    const dragForce = this.velocity.clone().normalize().multiplyScalar(-drag / 5000);

    // Thrust
    const maxThrust = 120; // kN ish
    const thrustN = throttle * maxThrust;
    const thrustForce = forward.clone().multiplyScalar(thrustN / 80);

    // Gravity
    const gravity = new THREE.Vector3(0, -9.81 * dt, 0);

    this.velocity.add(liftForce.multiplyScalar(dt));
    this.velocity.add(dragForce.multiplyScalar(dt));
    this.velocity.add(thrustForce.multiplyScalar(dt));
    this.velocity.add(gravity);

    // Clamp max speed
    if (this.velocity.length() > 300) {
      this.velocity.setLength(300);
    }

    this.position.addScaledVector(this.velocity, dt);

    // Ground collision
    const groundY = getTerrainHeight(this.position.x, this.position.z);
    const minY = groundY + (this.gear ? 2.5 : 1.5);
    if (this.position.y < minY) {
      this.position.y = minY;
      if (this.velocity.y < 0) {
        // Landing / crash: absorb vertical component
        const landSpeed = Math.abs(this.velocity.y);
        if (landSpeed > 8 && spd > 30) {
          // Hard landing — reset gently
          this.velocity.multiplyScalar(0.1);
        } else {
          this.velocity.y = 0;
          this.velocity.multiplyScalar(0.98); // ground friction
        }
        this.pitch *= 0.9;
        this.roll  *= 0.9;
      }
    }

    // Update mesh
    this.group.position.copy(this.position);
    this.group.setRotationFromQuaternion(q);

    // Update camera (cockpit view)
    const camWorld = this.camOffset.clone().applyQuaternion(q).add(this.position);
    this.camera.position.copy(camWorld);
    this.camera.quaternion.copy(q);
    // Slight camera lag for feel
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  setThrottle(v) {
    this.throttle = Math.max(0, Math.min(1, v));
  }

  toggleFlaps() {
    this.flaps = this.flaps < 0.5 ? 0.5 : (this.flaps < 1 ? 1 : 0);
  }

  toggleGear() {
    this.gear = !this.gear;
  }

  isStalling() {
    return this.speedKnots < 85 && this.position.y > 20;
  }

  headingDeg() {
    const deg = (-this.yaw * RAD) % 360;
    return (deg + 360) % 360;
  }

  pitchDeg() {
    return this.pitch * RAD;
  }

  bankDeg() {
    return this.roll * RAD;
  }

  reset() {
    this.position.set(0, 800, 0);
    this.velocity.set(60, 0, 0);
    this.pitch = 0;
    this.yaw = 0;
    this.roll = 0;
    this.throttle = 0.5;
    this.flaps = 0;
    this.gear = true;
  }
}
