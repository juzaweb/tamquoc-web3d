import * as THREE from "three";
import type { CityInfo, Content } from "./types";

function grassTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#3b4d2f";
  ctx.fillRect(0, 0, 256, 256);
  const colors = ["#425636", "#33452a", "#4a5f3b", "#2f4027", "#566b40"];
  for (let i = 0; i < 2600; i += 1) {
    ctx.fillStyle = colors[i % colors.length]!;
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    ctx.fillRect(x, y, 1 + Math.random() * 2, 1 + Math.random() * 3);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(28, 28);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildEnvironment(scene: THREE.Scene, content: Content, isTouchDevice: boolean) {
    const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x2c291f, 1.1);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffd7a1, 2.1);
    sun.position.set(45, 75, 25);
    sun.castShadow = true;
    const shadowMapSize = isTouchDevice ? 512 : 1024;
    sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220;
    sun.shadow.bias = -0.0005;
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(content.world.radius + 25, 96),
      new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1, metalness: 0 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(10, 40),
      new THREE.MeshStandardMaterial({ color: 0x24515f, roughness: 0.15, metalness: 0.4, transparent: true, opacity: 0.9 }),
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(47, 0.02, 22);
    scene.add(pond);

    buildCities(scene, content);
    buildNature(scene, content);
    buildSky(scene);
  }

function buildSky(scene: THREE.Scene) {
    const geometry = new THREE.SphereGeometry(320, 32, 16);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x0a1320) },
        bottomColor: { value: new THREE.Color(0x35404a) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition).y;
          vec3 color = mix(bottomColor, topColor, max(pow(max(h, 0.0), 0.5), 0.0));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    scene.add(new THREE.Mesh(geometry, material));
  }

function buildCities(scene: THREE.Scene, content: Content) {
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 1 });
    for (const city of content.world.cities) {
      buildCity(scene, content, city);
    }
    const center = { x: 0, z: 0 };
    for (const city of content.world.cities) {
      road(scene, city.gate.x, city.gate.z, center.x, center.z, 7, roadMaterial);
    }
    for (const npc of content.world.npcs) {
      const city = content.world.cities.find((entry) => entry.faction === npc.faction);
      buildNpc(scene, npc.x, npc.z, npc.name, npc.interactRadius, city?.x ?? 0, city?.z ?? 0);
    }
    buildMonsterZones(scene, content);
    buildBattlefield(scene);
  }

function buildMonsterZones(scene: THREE.Scene, content: Content) {
    for (const zone of content.world.monsterZones) {
      const monster = content.monsters[zone.monsterId];
      const color = monster?.color ?? 0xe8dcc0;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(zone.radius - 0.4, zone.radius, 64),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(zone.x, 0.06, zone.z);
      scene.add(ring);

      const label = textSprite(zone.name, "#e8dcc0", 5);
      label.position.set(zone.x, 2.6, zone.z);
      scene.add(label);
    }
  }

function buildNpc(
  scene: THREE.Scene,
  x: number,
  z: number,
  name: string,
  interactRadius: number,
  facingX: number,
  facingZ: number,
) {
    const group = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3f28, roughness: 0.9 });
    const cloth = new THREE.MeshStandardMaterial({ color: 0x7a2f2f, roughness: 0.85 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9ae87, roughness: 0.85 });

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(interactRadius - 0.25, interactRadius, 48),
      new THREE.MeshBasicMaterial({ color: 0xe8c77a, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.18, z);
    scene.add(ring);

    const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 1.05, 1), wood);
    counter.position.set(0, 0.52, 0.9);
    counter.castShadow = true;
    counter.receiveShadow = true;
    group.add(counter);

    const top = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.16, 1.35), new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.8 }));
    top.position.set(0, 1.12, 0.9);
    group.add(top);

    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3, 8), wood);
      post.position.set(side * 1.7, 1.5, 0.4);
      post.castShadow = true;
      group.add(post);
    }
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 2.4), cloth);
    canopy.position.set(0, 3.05, 0.4);
    canopy.rotation.x = -0.08;
    canopy.castShadow = true;
    group.add(canopy);

    const jarMaterial = new THREE.MeshStandardMaterial({ color: 0x3f7a6a, roughness: 0.6 });
    for (const offset of [-0.9, 0, 0.9]) {
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.34, 10), jarMaterial);
      jar.position.set(offset, 1.37, 0.9);
      jar.castShadow = true;
      group.add(jar);
    }

    const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.46, 1.15, 10), cloth);
    robe.position.set(0, 0.62, 0);
    robe.castShadow = true;
    group.add(robe);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), skin);
    head.position.set(0, 1.4, 0);
    head.castShadow = true;
    group.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.32, 12), wood);
    hat.position.set(0, 1.62, 0);
    group.add(hat);
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.34, 8), new THREE.MeshStandardMaterial({ color: 0xe6e6e6, roughness: 1 }));
    beard.position.set(0, 1.22, 0.19);
    beard.rotation.x = Math.PI;
    group.add(beard);

    group.position.set(x, 0, z);
    group.rotation.y = Math.atan2(facingX - x, facingZ - z);
    scene.add(group);

    const label = textSprite(name, "#ffd98a", 4.2);
    label.position.set(x, 3.6, z);
    scene.add(label);
  }

function road(scene: THREE.Scene, x1: number, z1: number, x2: number, z2: number, width: number, material: THREE.Material) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const length = Math.hypot(dx, dz);
    const road = new THREE.Mesh(new THREE.BoxGeometry(width, 0.04, length), material);
    road.position.set((x1 + x2) / 2, 0.02, (z1 + z2) / 2);
    road.rotation.y = Math.atan2(dx, dz);
    road.receiveShadow = true;
    scene.add(road);
  }

function buildCity(scene: THREE.Scene, content: Content, city: CityInfo) {
    const group = new THREE.Group();
    group.position.set(city.x, 0, city.z);
    const half = content.world.wallHalf;
    const gap = content.world.gateHalf * 2;
    const wallHeight = 3.6;
    const wallThickness = 0.9;
    const segment = half - gap / 2;
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x4d4640, roughness: 0.95 });
    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0x5c5348, roughness: 1 });

    const floor = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.14, half * 2), stoneMaterial);
    floor.position.y = 0.07;
    floor.receiveShadow = true;
    group.add(floor);

    const safeZone = new THREE.Mesh(
      new THREE.RingGeometry(content.world.safeRadius - 0.7, content.world.safeRadius, 64),
      new THREE.MeshBasicMaterial({ color: city.color, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
    );
    safeZone.rotation.x = -Math.PI / 2;
    safeZone.position.y = 0.16;
    group.add(safeZone);

    for (const side of [-1, 1]) {
      for (const offset of [-1, 1]) {
        const northSouth = new THREE.Mesh(
          new THREE.BoxGeometry(segment, wallHeight, wallThickness),
          wallMaterial,
        );
        northSouth.position.set(offset * (gap / 2 + segment / 2), wallHeight / 2, side * half);
        northSouth.castShadow = true;
        northSouth.receiveShadow = true;
        group.add(northSouth);

        const eastWest = new THREE.Mesh(
          new THREE.BoxGeometry(wallThickness, wallHeight, segment),
          wallMaterial,
        );
        eastWest.position.set(side * half, wallHeight / 2, offset * (gap / 2 + segment / 2));
        eastWest.castShadow = true;
        eastWest.receiveShadow = true;
        group.add(eastWest);
      }
    }

    for (const x of [-half, half]) {
      for (const z of [-half, half]) {
        const tower = new THREE.Mesh(new THREE.BoxGeometry(2.8, 5.4, 2.8), wallMaterial);
        tower.position.set(x, 2.7, z);
        tower.castShadow = true;
        tower.receiveShadow = true;
        group.add(tower);
        const cap = new THREE.Mesh(
          new THREE.ConeGeometry(2.4, 1.6, 4),
          new THREE.MeshStandardMaterial({ color: city.color, roughness: 0.7 }),
        );
        cap.rotation.y = Math.PI / 4;
        cap.position.set(x, 6.2, z);
        group.add(cap);
      }
    }

    scene.add(group);

    const gates: { x: number; z: number; rotation: number }[] = [
      { x: city.x, z: city.z + half, rotation: 0 },
      { x: city.x, z: city.z - half, rotation: 0 },
      { x: city.x + half, z: city.z, rotation: Math.PI / 2 },
      { x: city.x - half, z: city.z, rotation: Math.PI / 2 },
    ];
    for (const gate of gates) {
      cityGate(scene, gate.x, gate.z, gate.rotation, city.color, Math.abs(gate.x - city.gate.x) < 0.1 && Math.abs(gate.z - city.gate.z) < 0.1);
    }

    const hutSpots: [number, number][] = [
      [-0.62 * half, -0.62 * half],
      [0.58 * half, -0.58 * half],
      [-0.58 * half, 0.58 * half],
      [0.62 * half, 0.62 * half],
    ];
    hutSpots.forEach(([x, z], index) => {
      hut(scene, city.x + x, city.z + z, [0x6b4f32, 0x74553a, 0x5d452d][index % 3]!);
    });

    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(half * 0.32, 48),
      new THREE.MeshStandardMaterial({ color: 0x746855, roughness: 0.95 }),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(city.x, 0.16, city.z);
    plaza.receiveShadow = true;
    scene.add(plaza);

    banner(scene, city.x - 6, city.z + half * 0.62, city.color);
    banner(scene, city.x + 6, city.z + half * 0.62, city.color);

    const label = textSprite(city.name, "#f2d391", 11);
    label.position.set(city.x, 10.5, city.z);
    scene.add(label);
  }

function cityGate(scene: THREE.Scene, x: number, z: number, rotation: number, color: number, isMain: boolean) {
    const group = new THREE.Group();
    const postMaterial = new THREE.MeshStandardMaterial({ color: 0x6d2424, roughness: 0.8 });
    const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.9 });
    for (const offset of [-3.2, 3.2]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5, 0.55), postMaterial);
      post.position.set(offset, 2.5, 0);
      post.castShadow = true;
      group.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.5, 0.7), postMaterial);
    beam.position.y = 4.6;
    beam.castShadow = true;
    group.add(beam);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.35, 1.6), roofMaterial);
    roof.position.y = 5.05;
    roof.castShadow = true;
    group.add(roof);
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 1.1, 0.16),
      new THREE.MeshStandardMaterial({ color: isMain ? color : 0x17181d, emissive: color, emissiveIntensity: isMain ? 0.35 : 0.12 }),
    );
    plaque.position.set(0, 3.6, 0);
    group.add(plaque);
    group.position.set(x, 0, z);
    group.rotation.y = rotation;
    scene.add(group);
  }

function buildBattlefield(scene: THREE.Scene) {
    const arena = new THREE.Mesh(
      new THREE.CircleGeometry(27, 64),
      new THREE.MeshStandardMaterial({ color: 0x4c3d2e, roughness: 1 }),
    );
    arena.rotation.x = -Math.PI / 2;
    arena.position.y = 0.03;
    arena.receiveShadow = true;
    scene.add(arena);

    const border = new THREE.Mesh(
      new THREE.RingGeometry(26.2, 27.4, 72),
      new THREE.MeshBasicMaterial({ color: 0xd9b36c, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
    );
    border.rotation.x = -Math.PI / 2;
    border.position.y = 0.05;
    scene.add(border);

    const bossCircle = new THREE.Mesh(
      new THREE.CircleGeometry(5.5, 40),
      new THREE.MeshStandardMaterial({ color: 0x2a2138, roughness: 0.8, emissive: 0x39204d, emissiveIntensity: 0.4 }),
    );
    bossCircle.rotation.x = -Math.PI / 2;
    bossCircle.position.y = 0.05;
    scene.add(bossCircle);

    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2;
      const x = Math.cos(angle) * 19;
      const z = Math.sin(angle) * 19;
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x2f2418 }),
      );
      pole.position.set(x, 1.3, z);
      polarityTorch(scene, pole, x, z);
    }

    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2 + 0.3;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.8 + Math.random() * 1.2),
        new THREE.MeshStandardMaterial({ color: 0x3b3a3d, roughness: 1, flatShading: true }),
      );
      rock.position.set(Math.cos(angle) * 24, 0.4, Math.sin(angle) * 24);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      scene.add(rock);
    }
  }

function textSprite(text: string, color: string, scale: number): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext("2d")!;
    ctx.font = "700 52px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 20);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }),
    );
    sprite.scale.set(scale, scale * 0.1875, 1);
    sprite.renderOrder = 15;
    return sprite;
  }

function hut(scene: THREE.Scene, x: number, z: number, color: number) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(4, 2.4, 3.4),
      new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
    );
    base.position.y = 1.2;
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(3.5, 1.9, 4),
      new THREE.MeshStandardMaterial({ color: 0x33261c, roughness: 0.95 }),
    );
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 3.35;
    roof.castShadow = true;
    group.add(roof);

    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.7, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x241a12 }),
    );
    door.position.set(0, 0.85, 1.72);
    group.add(door);

    group.position.set(x, 0, z);
    group.rotation.y = Math.atan2(-x, -z);
    scene.add(group);
  }

function banner(scene: THREE.Scene, x: number, z: number, color: number) {
    const group = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 4, 6),
      new THREE.MeshStandardMaterial({ color: 0x2f2418 }),
    );
    pole.position.y = 2;
    group.add(pole);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 2.4),
      new THREE.MeshStandardMaterial({ color, roughness: 0.8, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.12 }),
    );
    cloth.position.set(0.9, 2.7, 0);
    group.add(cloth);
    group.position.set(x, 0, z);
    scene.add(group);
  }

function buildNature(scene: THREE.Scene, content: Content) {
    const treePositions: { x: number; z: number; scale: number; foliage: number }[] = [];
    for (let i = 0; i < 140; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 22 + Math.random() * 115;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (Math.hypot(x - 47, z - 22) < 14) continue;
      if (Math.hypot(x, z) < 31) continue;
      const cityClear = content.world.wallHalf + 8;
      if (content.world.cities.some((city) => Math.abs(x - city.x) < cityClear && Math.abs(z - city.z) < cityClear)) continue;
      if (content.world.monsterZones.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius + 3)) continue;
      treePositions.push({
        x,
        z,
        scale: 0.8 + Math.random() * 0.9,
        foliage: Math.floor(Math.random() * 2),
      });
    }
    const treeTransform = new THREE.Object3D();
    if (treePositions.length > 0) {
      const trunks = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.18, 0.28, 2.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }),
        treePositions.length,
      );
      trunks.castShadow = true;
      treePositions.forEach(({ x, z, scale }, index) => {
        treeTransform.position.set(x, 1.1 * scale, z);
        treeTransform.scale.setScalar(scale);
        treeTransform.updateMatrix();
        trunks.setMatrixAt(index, treeTransform.matrix);
      });
      trunks.instanceMatrix.needsUpdate = true;
      scene.add(trunks);

      const leafColors = [0x2f5e37, 0x3b6b3a] as const;
      const leafMaterials = leafColors.map(
        (color) => new THREE.MeshStandardMaterial({ color, roughness: 1, flatShading: true }),
      );
      for (let tier = 0; tier < 3; tier += 1) {
        const geometry = new THREE.ConeGeometry(1.5 - tier * 0.32, 1.7, 6);
        for (let colorIndex = 0; colorIndex < leafColors.length; colorIndex += 1) {
          const instances = treePositions.filter((tree) => tree.foliage === colorIndex);
          if (instances.length === 0) continue;
          const leaves = new THREE.InstancedMesh(geometry, leafMaterials[colorIndex]!, instances.length);
          leaves.castShadow = true;
          instances.forEach(({ x, z, scale }, index) => {
            treeTransform.position.set(x, (2.2 + tier * 0.75) * scale, z);
            treeTransform.scale.setScalar(scale);
            treeTransform.updateMatrix();
            leaves.setMatrixAt(index, treeTransform.matrix);
          });
          leaves.instanceMatrix.needsUpdate = true;
          scene.add(leaves);
        }
      }
    }

    const rockPositions: { x: number; z: number; size: number; rotation: THREE.Euler }[] = [];
    for (let i = 0; i < 60; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 18 + Math.random() * 125;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const cityClear = content.world.wallHalf + 4;
      if (content.world.cities.some((city) => Math.abs(x - city.x) < cityClear && Math.abs(z - city.z) < cityClear)) continue;
      if (content.world.monsterZones.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius + 2)) continue;
      rockPositions.push({
        x,
        z,
        size: 0.5 + Math.random() * 1.4,
        rotation: new THREE.Euler(Math.random(), Math.random(), Math.random()),
      });
    }
    if (rockPositions.length > 0) {
      const rocks = new THREE.InstancedMesh(
        new THREE.DodecahedronGeometry(1),
        new THREE.MeshStandardMaterial({ color: 0x5b5f63, roughness: 1, flatShading: true }),
        rockPositions.length,
      );
      rocks.castShadow = true;
      rocks.receiveShadow = true;
      rockPositions.forEach(({ x, z, size, rotation }, index) => {
        treeTransform.position.set(x, 0.25, z);
        treeTransform.rotation.copy(rotation);
        treeTransform.scale.setScalar(size);
        treeTransform.updateMatrix();
        rocks.setMatrixAt(index, treeTransform.matrix);
      });
      rocks.instanceMatrix.needsUpdate = true;
      scene.add(rocks);
    }

    const mountains: { x: number; z: number; radius: number; height: number; rotation: number }[] = [];
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2 + Math.random() * 0.1;
      const radius = 165 + Math.random() * 70;
      const height = 28 + Math.random() * 46;
      mountains.push({
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        radius: 16 + Math.random() * 20,
        height,
        rotation: Math.random() * Math.PI,
      });
    }
    if (mountains.length > 0) {
      const mountainMesh = new THREE.InstancedMesh(
        new THREE.ConeGeometry(1, 1, 5),
        new THREE.MeshStandardMaterial({ color: 0x1b2833, roughness: 1, flatShading: true }),
        mountains.length,
      );
      mountains.forEach(({ x, z, radius, height, rotation }, index) => {
        treeTransform.position.set(x, height / 2 - 4, z);
        treeTransform.rotation.set(0, rotation, 0);
        treeTransform.scale.set(radius, height, radius);
        treeTransform.updateMatrix();
        mountainMesh.setMatrixAt(index, treeTransform.matrix);
      });
      mountainMesh.instanceMatrix.needsUpdate = true;
      scene.add(mountainMesh);
    }
  }

function polarityTorch(scene: THREE.Scene, pole: THREE.Mesh, x: number, z: number) {
  scene.add(pole);
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffb35c, emissive: 0xff7b00, emissiveIntensity: 2 }),
  );
  flame.position.set(x, 2.5, z);
  scene.add(flame);
  const light = new THREE.PointLight(0xff9a3c, 1.6, 9, 2);
  light.position.set(x, 2.5, z);
  scene.add(light);
}
