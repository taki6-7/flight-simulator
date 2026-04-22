import * as THREE from 'three';

const CHUNK_SIZE = 4000;
const CHUNKS_VISIBLE = 3;

function noise(x, z) {
  const s = Math.sin(x * 0.0003 + z * 0.0002) * 0.5 +
            Math.sin(x * 0.0007 - z * 0.0005) * 0.3 +
            Math.sin(x * 0.0017 + z * 0.0013) * 0.15 +
            Math.sin(x * 0.0041 - z * 0.0037) * 0.05;
  return s;
}

function terrainHeight(x, z) {
  const base = noise(x, z);
  const ridge = Math.abs(Math.sin(x * 0.00015 + z * 0.0001)) * 0.4;
  return (base + ridge) * 1800;
}

function isOcean(x, z) {
  const v = Math.sin(x * 0.00005) * Math.cos(z * 0.00004) +
            Math.sin(x * 0.00009 + 0.5) * Math.cos(z * 0.00008 + 1.0);
  return v > 0.3;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.chunks = new Map();
    this.currentChunkX = null;
    this.currentChunkZ = null;

    this._buildSky();
    this._buildOcean();
    this._buildClouds();
    this._buildSun();
  }

  _buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(80000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { time: { value: 0 } },
        vertexShader: `
          varying vec3 vPos;
          void main() { vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: `
          varying vec3 vPos;
          void main() {
            float t = clamp(normalize(vPos).y, 0.0, 1.0);
            vec3 zenith = vec3(0.05, 0.12, 0.35);
            vec3 horizon = vec3(0.55, 0.72, 0.92);
            vec3 low = vec3(0.7, 0.6, 0.5);
            vec3 col = t > 0.15 ? mix(horizon, zenith, (t - 0.15) / 0.85) : mix(low, horizon, t / 0.15);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    this.scene.add(sky);
    this.skyMaterial = sky.material;
  }

  _buildOcean() {
    this.ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(200000, 200000, 1, 1),
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 } },
        vertexShader: `
          varying vec2 vUv;
          uniform float time;
          void main() {
            vUv = uv;
            vec3 p = position;
            p.z += sin(p.x * 0.002 + time) * 8.0 + sin(p.y * 0.003 + time * 1.3) * 5.0;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float time;
          void main() {
            float wave = sin(vUv.x * 60.0 + time * 2.0) * sin(vUv.y * 40.0 + time * 1.5) * 0.5 + 0.5;
            vec3 deep = vec3(0.02, 0.08, 0.25);
            vec3 shallow = vec3(0.05, 0.22, 0.45);
            vec3 col = mix(deep, shallow, wave * 0.3);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    this.ocean.rotation.x = -Math.PI / 2;
    this.ocean.position.y = -2;
    this.scene.add(this.ocean);
  }

  _buildSun() {
    const sun = new THREE.Mesh(
      new THREE.SphereGeometry(600, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xffffcc })
    );
    sun.position.set(30000, 25000, -50000);
    this.scene.add(sun);

    const light = new THREE.DirectionalLight(0xfff5e0, 1.2);
    light.position.copy(sun.position);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x88aabb, 0.5));
  }

  _buildClouds() {
    this.cloudGroup = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, transparent: true, opacity: 0.82, roughness: 1,
    });
    for (let i = 0; i < 120; i++) {
      const g = new THREE.Group();
      const n = 3 + Math.floor(Math.random() * 4);
      for (let j = 0; j < n; j++) {
        const r = 200 + Math.random() * 400;
        const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), mat);
        blob.position.set(
          (Math.random() - 0.5) * r * 1.5,
          (Math.random() - 0.5) * r * 0.4,
          (Math.random() - 0.5) * r * 1.5
        );
        g.add(blob);
      }
      g.position.set(
        (Math.random() - 0.5) * 60000,
        2000 + Math.random() * 4000,
        (Math.random() - 0.5) * 60000
      );
      this.cloudGroup.add(g);
    }
    this.scene.add(this.cloudGroup);
  }

  _chunkKey(cx, cz) { return `${cx},${cz}`; }

  _buildChunk(cx, cz) {
    const key = this._chunkKey(cx, cz);
    if (this.chunks.has(key)) return;

    const wx = cx * CHUNK_SIZE;
    const wz = cz * CHUNK_SIZE;
    const segs = 48;
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + wx;
      const z = pos.getZ(i) + wz;
      const h = Math.max(0, terrainHeight(x, z));
      pos.setY(i, h);

      const t = Math.min(h / 1800, 1);
      if (h < 5) colors.push(0.76, 0.70, 0.50);        // sand
      else if (t < 0.25) colors.push(0.25, 0.55, 0.20); // lowland
      else if (t < 0.6) colors.push(0.20, 0.42, 0.15);  // forest
      else if (t < 0.8) colors.push(0.50, 0.45, 0.38);  // rock
      else colors.push(0.92, 0.94, 0.96);                // snow
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, metalness: 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(wx, 0, wz);
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    // City buildings on flat areas
    if (Math.random() < 0.35) {
      this._addCity(wx, wz, CHUNK_SIZE);
    }

    this.chunks.set(key, mesh);
  }

  _addCity(wx, wz, size) {
    const count = 6 + Math.floor(Math.random() * 20);
    const bx = wx + (Math.random() - 0.5) * size * 0.6;
    const bz = wz + (Math.random() - 0.5) * size * 0.6;
    const h = terrainHeight(bx, bz);
    if (h < 10 || h > 200) return;

    const cityGroup = new THREE.Group();
    const colors = [0x8899aa, 0x99aaaa, 0xaabbcc, 0x778899, 0xbbaa99];
    for (let i = 0; i < count; i++) {
      const bh = 30 + Math.random() * 200;
      const bw = 20 + Math.random() * 40;
      const geo = new THREE.BoxGeometry(bw, bh, bw);
      const mat = new THREE.MeshStandardMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        roughness: 0.4, metalness: 0.3,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 600,
        h + bh / 2,
        (Math.random() - 0.5) * 600
      );
      cityGroup.add(mesh);
    }
    this.scene.add(cityGroup);
  }

  update(playerX, playerZ, time) {
    this.ocean.material.uniforms.time.value = time;

    // Update clouds slowly
    this.cloudGroup.children.forEach((c, i) => {
      c.position.x += 0.3 * (i % 2 === 0 ? 1 : -0.5);
      if (c.position.x > 40000) c.position.x = -40000;
    });

    const cx = Math.round(playerX / CHUNK_SIZE);
    const cz = Math.round(playerZ / CHUNK_SIZE);

    if (cx === this.currentChunkX && cz === this.currentChunkZ) return;
    this.currentChunkX = cx;
    this.currentChunkZ = cz;

    // Load nearby chunks
    const r = CHUNKS_VISIBLE;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        this._buildChunk(cx + dx, cz + dz);
      }
    }

    // Unload far chunks
    const maxDist = r + 2;
    for (const [key, mesh] of this.chunks) {
      const [kx, kz] = key.split(',').map(Number);
      if (Math.abs(kx - cx) > maxDist || Math.abs(kz - cz) > maxDist) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        mesh.material.dispose();
        this.chunks.delete(key);
      }
    }
  }

  getTerrainHeight(x, z) {
    return Math.max(0, terrainHeight(x, z));
  }

  getLocationName(x, z) {
    const lat = (z / 1000).toFixed(2);
    const lon = (x / 1000).toFixed(2);
    const h = terrainHeight(x, z);
    const region = h > 1400 ? 'Mountain Range' :
                   h > 600  ? 'Highlands' :
                   h > 100  ? 'Plains' :
                   h > 10   ? 'Coastal' : 'Ocean';
    return `${region}  LAT ${lat}  LON ${lon}`;
  }
}
