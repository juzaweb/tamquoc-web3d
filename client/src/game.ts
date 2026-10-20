import * as THREE from "three";
import type {
  CombatEvent,
  Content,
  FactionId,
  MonsterSnapshot,
  PlayerSnapshot,
  SelfState,
  SectId,
  WorldState,
} from "./types";
import { buildEnvironment } from "./environment";

type EntityKind = "player" | "monster";

interface EntityView {
  id: string;
  kind: EntityKind;
  group: THREE.Group;
  label: NameLabel;
  targetX: number;
  targetZ: number;
  targetRotation: number;
  walkTime: number;
  limbs: THREE.Object3D[];
  labelHeight: number;
  isBoss: boolean;
  dead: boolean;
  sect?: SectId;
  faction?: FactionId;
  lastDustTime?: number;
}

interface Effect {
  object: THREE.Object3D;
  life: number;
  maxLife: number;
  light?: THREE.PointLight;
  update?: (dt: number, progress: number) => void;
}

class NameLabel {
  readonly sprite: THREE.Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private lastText = "";
  private lastRatio = -1;
  private lastColor = "";

  constructor(width = 256, height = 80) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.SpriteMaterial({
      map: this.texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(material);
    this.sprite.renderOrder = 20;
  }

  set(text: string, ratio: number, color: string, scale: number) {
    if (text === this.lastText && Math.abs(ratio - this.lastRatio) < 0.01 && color === this.lastColor) {
      this.sprite.scale.set(scale, scale * 0.3125, 1);
      return;
    }
    this.lastText = text;
    this.lastRatio = ratio;
    this.lastColor = color;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "700 24px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    ctx.fillText(text, canvas.width / 2, 24, canvas.width - 16);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,0,0,0.72)";
    ctx.fillRect(26, 50, canvas.width - 52, 14);
    ctx.fillStyle = ratio > 0.5 ? "#7fd47f" : ratio > 0.25 ? "#e0b04a" : "#e05a4f";
    ctx.fillRect(28, 52, (canvas.width - 56) * Math.max(0, Math.min(1, ratio)), 10);
    this.texture.needsUpdate = true;
    this.sprite.scale.set(scale, scale * 0.3125, 1);
  }
}

function factionHex(faction: FactionId): string {
  return faction === "HAN" ? "#8ec5ff" : faction === "SHU" ? "#9dffc4" : "#ffa8a2";
}

export class GameClient {
  private readonly canvas: HTMLCanvasElement;
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly lastPointerPos = new THREE.Vector2();
  private readonly entities = new Map<string, EntityView>();
  private readonly effects: Effect[] = [];
  private readonly selectionRing: THREE.Mesh;
  private readonly content: Content;
  private readonly onSelect: (id: string | null, kind: EntityKind | null) => void;
  private readonly onGroundClick?: (point: { x: number; z: number }) => void;

  private localId: string | null = null;
  private targetId: string | null = null;
  private targetKind: EntityKind | null = null;
  private yaw = 0;
  private pitch = 0.55;
  private distance = 16;
  private dragging = false;
  private dragMoved = 0;
  private animationFrame = 0;
  private disposed = false;
  private lastShadowUpdateAt = 0;
  private readonly cameraTarget = new THREE.Vector3();
  private readonly cameraOffset = new THREE.Vector3();
  private readonly cameraDesired = new THREE.Vector3();
  private readonly resizeHandler = () => this.resize();

  constructor(
    canvas: HTMLCanvasElement,
    content: Content,
    onSelect: (id: string | null, kind: EntityKind | null) => void,
    onGroundClick?: (point: { x: number; z: number }) => void,
  ) {
    this.canvas = canvas;
    this.container = canvas.parentElement ?? document.body;
    this.content = content;
    this.onSelect = onSelect;
    this.onGroundClick = onGroundClick;
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouchDevice });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1 : 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
    this.scene.background = new THREE.Color(0x0b1620);
    this.scene.fog = new THREE.FogExp2(0x0b1620, 0.007);

    buildEnvironment(this.scene, this.content, isTouchDevice);

    this.selectionRing = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.95, 36),
      new THREE.MeshBasicMaterial({ color: 0xf2d391, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    );
    this.selectionRing.rotation.x = -Math.PI / 2;
    this.selectionRing.position.y = 0.05;
    this.selectionRing.visible = false;
    this.scene.add(this.selectionRing);

    this.bindEvents();
    this.resize();
    this.loop();
  }

  private bindEvents() {
    window.addEventListener("resize", this.resizeHandler);
    window.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        this.lastPointerPos.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.lastPointerPos.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      }
    });
    this.canvas.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      this.dragging = true;
      this.dragMoved = 0;
      this.canvas.setPointerCapture(event.pointerId);
    });
    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      const dx = event.movementX;
      const dy = event.movementY;
      this.dragMoved += Math.abs(dx) + Math.abs(dy);
      this.yaw -= dx * 0.005;
      this.pitch = Math.max(0.15, Math.min(1.2, this.pitch + dy * 0.003));
    });
    this.canvas.addEventListener("pointerup", (event) => {
      if (!this.dragging) return;
      const isTouch = event.pointerType === "touch";
      const clickThreshold = isTouch ? 18 : 6;
      this.dragging = false;
      this.canvas.releasePointerCapture(event.pointerId);
      if (this.dragMoved < clickThreshold) this.pick(event.clientX, event.clientY);
    });
    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      this.distance = Math.max(7, Math.min(34, this.distance + event.deltaY * 0.015));
    }, { passive: false });
  }

  private pick(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const meshes = [...this.entities.values()].filter((entity) => !entity.dead).map((entity) => entity.group);
    const hits = this.raycaster.intersectObjects(meshes, true);
    for (const hit of hits) {
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.entityId) object = object.parent;
      if (object?.userData.entityId) {
        const id = object.userData.entityId as string;
        const entity = this.entities.get(id);
        if (entity) {
          this.setTarget(id, entity.kind);
          this.onSelect(id, entity.kind);
        }
        return;
      }
    }
    this.setTarget(null, null);
    this.onSelect(null, null);

    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(groundPlane, groundPoint)) {
      this.spawnImpact(groundPoint, 0x6fcf97, 0.6);
      if (this.onGroundClick) {
        this.onGroundClick({ x: groundPoint.x, z: groundPoint.z });
      }
    }
  }

  setSelf(self: SelfState, world: WorldState, socketId: string) {
    const firstSelf = this.localId === null;
    this.localId = socketId;
    if (firstSelf && Math.hypot(self.x, self.z) > 1) {
      const city = this.content.world.cities.find((entry) => entry.faction === self.faction);
      if (city) {
        this.yaw = Math.atan2(city.x - city.gate.x, city.z - city.gate.z);
      } else {
        this.yaw = Math.atan2(self.x, self.z);
      }
      this.cameraTarget.set(self.x, 1.35, self.z);
      const horizontal = Math.cos(this.pitch) * this.distance;
      this.camera.position.set(
        self.x + Math.sin(this.yaw) * horizontal,
        1.35 + Math.sin(this.pitch) * this.distance,
        self.z + Math.cos(this.yaw) * horizontal,
      );
    }
    const existing = this.entities.get(socketId);
    if (!existing) {
      const entity = this.createPlayerEntity({ ...self, id: socketId } as unknown as PlayerSnapshot);
      this.entities.set(socketId, entity);
      this.scene.add(entity.group);
    }
    this.applyState(world);
  }

  private createPlayerEntity(player: PlayerSnapshot): EntityView {
    const appearance = player.appearance ?? {};
    const color = appearance.color ?? this.content.factions[player.faction]?.color ?? "#b23a3a";
    const colorHex = typeof color === "string" ? color : "#b23a3a";
    const hair = appearance.hair ?? "#1b1b1f";
    const { group, limbs } = this.humanoid({
      robeColor: colorHex,
      hairColor: hair,
      faction: player.faction,
      sect: player.sect,
      gender: (player as unknown as SelfState).gender ?? "MALE",
    });
    group.userData.entityId = player.id;
    const label = new NameLabel();
    const labelHeight = 2.35;
    label.sprite.position.y = labelHeight;
    label.set(player.name, player.hp / Math.max(1, player.maxHp), factionHex(player.faction), 3.4);
    group.add(label.sprite);
    group.position.set(player.x, player.y, player.z);
    return {
      id: player.id,
      kind: "player",
      group,
      label,
      targetX: player.x,
      targetZ: player.z,
      targetRotation: player.rotation,
      walkTime: 0,
      limbs,
      labelHeight,
      isBoss: false,
      dead: player.dead,
      sect: player.sect,
      faction: player.faction,
    };
  }

  private createMonsterEntity(monster: MonsterSnapshot): EntityView {
    const template = this.content.monsters[monster.templateId];
    const isBoss = monster.isBoss || Boolean(template?.isBoss);
    const { group, limbs, height } = this.monsterMesh(monster.templateId, template?.color ?? 0x777777, template?.scale ?? 1);
    group.userData.entityId = monster.id;
    const label = new NameLabel();
    label.sprite.position.y = height;
    label.set(monster.name, monster.hp / Math.max(1, monster.maxHp), isBoss ? "#ffb36b" : "#f1e6cc", isBoss ? 6.5 : 3.1);
    group.add(label.sprite);
    group.position.set(monster.x, monster.y, monster.z);
    return {
      id: monster.id,
      kind: "monster",
      group,
      label,
      targetX: monster.x,
      targetZ: monster.z,
      targetRotation: monster.rotation,
      walkTime: 0,
      limbs,
      labelHeight: height,
      isBoss,
      dead: monster.dead,
    };
  }

  private humanoid(options: {
    robeColor: string;
    hairColor: string;
    faction: FactionId;
    sect: SectId;
    gender: string;
  }): { group: THREE.Group; limbs: THREE.Object3D[] } {
    const group = new THREE.Group();
    const limbs: THREE.Object3D[] = [];
    const isFemale = options.gender === "FEMALE";
    const skin = new THREE.MeshStandardMaterial({ color: 0xd9ae87, roughness: 0.85 });
    const robe = new THREE.MeshStandardMaterial({ color: options.robeColor, roughness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x22242c, roughness: 0.9 });
    const hairMat = new THREE.MeshStandardMaterial({ color: options.hairColor, roughness: 0.9 });

    const legGeometry = new THREE.CylinderGeometry(0.11, 0.1, 0.6, 8);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(legGeometry, dark);
      leg.position.set(side * 0.14, 0.3, 0);
      leg.castShadow = true;
      group.add(leg);
      limbs.push(leg);
    }

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(isFemale ? 0.27 : 0.3, isFemale ? 0.44 : 0.4, 1.05, 10),
      robe,
    );
    body.position.y = 1.05;
    body.castShadow = true;
    group.add(body);

    const sash = new THREE.Mesh(
      new THREE.BoxGeometry(0.68, 0.14, 0.5),
      new THREE.MeshStandardMaterial({
        color: this.content.factions[options.faction]?.color ?? 0xd9b36c,
        roughness: 0.7,
      }),
    );
    sash.position.y = 1.05;
    group.add(sash);

    const armGeometry = new THREE.CylinderGeometry(0.09, 0.085, 0.66, 8);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(armGeometry, robe);
      arm.position.set(side * 0.4, 1.15, 0);
      arm.rotation.z = side * 0.22;
      arm.castShadow = true;
      group.add(arm);
      limbs.push(arm);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 12), skin);
    head.position.y = 1.72;
    head.castShadow = true;
    group.add(head);

    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.245, 16, 12), hairMat);
    hairCap.scale.set(1, 0.78, 1);
    hairCap.position.y = 1.79;
    group.add(hairCap);

    if (isFemale) {
      const bun = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), hairMat);
      bun.position.set(0, 1.98, -0.1);
      group.add(bun);
      const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.8, 6), hairMat);
      braid.position.set(0, 1.45, -0.22);
      group.add(braid);
    } else {
      const topknot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.24, 8), hairMat);
      topknot.position.y = 2.02;
      group.add(topknot);
    }

    const weapon = new THREE.Group();
    if (options.sect === "WUDANG" || options.sect === "EMEI") {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.25, 0.1),
        new THREE.MeshStandardMaterial({ color: 0xd7dde6, metalness: 0.8, roughness: 0.3 }),
      );
      blade.position.y = 0.55;
      weapon.add(blade);
      const guard = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.06, 0.12),
        new THREE.MeshStandardMaterial({ color: 0xd9b36c, metalness: 0.6, roughness: 0.4 }),
      );
      guard.position.y = -0.05;
      weapon.add(guard);
      weapon.position.set(0.52, 0.9, 0.05);
      weapon.rotation.z = -0.25;
    } else if (options.sect === "SHAOLIN") {
      const fist = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x2c2c33, roughness: 0.9 }),
      );
      fist.position.set(0.52, 0.93, 0.08);
      weapon.add(fist);
    } else {
      const pan = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.26, 0.08, 14),
        new THREE.MeshStandardMaterial({ color: 0x3d4047, metalness: 0.7, roughness: 0.5 }),
      );
      pan.position.set(0.55, 0.95, 0.1);
      pan.rotation.z = 0.4;
      weapon.add(pan);
    }
    group.add(weapon);
    return { group, limbs };
  }

  private monsterMesh(
    templateId: string,
    color: number,
    scale: number,
  ): { group: THREE.Group; limbs: THREE.Object3D[]; height: number } {
    const group = new THREE.Group();
    const limbs: THREE.Object3D[] = [];
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true });

    if (templateId === "wolf" || templateId === "tiger") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 1.35), material);
      body.position.y = 0.65;
      body.castShadow = true;
      group.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.5), material);
      head.position.set(0, 0.75, 0.82);
      head.castShadow = true;
      group.add(head);
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.24, 4), material);
        ear.position.set(side * 0.13, 1.02, 0.82);
        group.add(ear);
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffb703, emissiveIntensity: 1 }),
        );
        eye.position.set(side * 0.12, 0.8, 1.05);
        group.add(eye);
      }
      const legGeometry = new THREE.CylinderGeometry(0.08, 0.07, 0.55, 6);
      for (const [x, z] of [
        [-0.2, 0.45],
        [0.2, 0.45],
        [-0.2, -0.45],
        [0.2, -0.45],
      ] as [number, number][]) {
        const leg = new THREE.Mesh(legGeometry, material);
        leg.position.set(x, 0.28, z);
        leg.castShadow = true;
        group.add(leg);
        limbs.push(leg);
      }
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.7, 6), material);
      tail.position.set(0, 0.72, -0.9);
      tail.rotation.x = -1.1;
      group.add(tail);
      group.scale.setScalar(scale);
      return { group, limbs, height: 1.65 * scale };
    }

    if (templateId === "snake") {
      const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true });
      for (let i = 0; i < 5; i += 1) {
        const segment = new THREE.Mesh(new THREE.SphereGeometry(0.32 - i * 0.035, 10, 8), bodyMat);
        segment.position.set(Math.sin(i * 1.2) * 0.24, 0.3, i * 0.32);
        segment.castShadow = true;
        group.add(segment);
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), bodyMat);
      head.scale.set(1, 0.8, 1.2);
      head.position.set(Math.sin(5 * 1.2) * 0.24, 0.45, 1.62);
      head.castShadow = true;
      group.add(head);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(
          new THREE.SphereGeometry(0.05, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xffef7a, emissive: 0xffb703, emissiveIntensity: 1.4 }),
        );
        eye.position.set(side * 0.14, 0.55, 1.85);
        group.add(eye);
      }
      group.scale.setScalar(scale);
      return { group, limbs, height: 1.5 * scale };
    }

    if (templateId === "bandit") {
      const human = this.humanoid({
        robeColor: "#6b2b22",
        hairColor: "#151515",
        faction: "WEI",
        sect: "WUDANG",
        gender: "MALE",
      });
      human.group.scale.setScalar(scale);
      return { group: human.group, limbs: human.limbs, height: 2.35 * scale };
    }

    if (templateId === "demon" || templateId === "warlord") {
      const isWarlord = templateId === "warlord";
      const human = this.humanoid({
        robeColor: isWarlord ? "#571f1f" : "#3c2a5c",
        hairColor: isWarlord ? "#e5d3bc" : "#cfc5eb",
        faction: "WEI",
        sect: isWarlord ? "WUDANG" : "SHAOLIN",
        gender: "MALE",
      });
      const multiplier = isWarlord ? 1.18 : 1;
      human.group.scale.setScalar(scale * multiplier);
      return {
        group: human.group,
        limbs: human.limbs,
        height: (2.35 + (multiplier - 1)) * scale,
      };
    }

    const bossMat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, flatShading: true, emissive: 0x1a0e2a, emissiveIntensity: 0.4 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), bossMat);
    body.scale.set(0.9, 0.8, 1.5);
    body.position.y = 1.2;
    body.castShadow = true;
    group.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.2, 8), bossMat);
    neck.position.set(0, 1.7, 1.1);
    neck.rotation.x = 0.5;
    group.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.6, 0.9), bossMat);
    head.position.set(0, 2.25, 1.75);
    head.castShadow = true;
    group.add(head);
    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.11, 0.75, 6),
        new THREE.MeshStandardMaterial({ color: 0xd9c9a3, roughness: 0.6 }),
      );
      horn.position.set(side * 0.24, 2.75, 1.9);
      horn.rotation.x = -0.4;
      group.add(horn);
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff2d2d, emissiveIntensity: 2 }),
      );
      eye.position.set(side * 0.2, 2.3, 2.2);
      group.add(eye);
      const wing = new THREE.Mesh(
        new THREE.ConeGeometry(0.9, 2.1, 3),
        new THREE.MeshStandardMaterial({ color: 0x241a33, roughness: 1, side: THREE.DoubleSide }),
      );
      wing.position.set(side * 1.15, 1.75, -0.15);
      wing.rotation.z = side * 1.15;
      wing.rotation.y = side * 0.4;
      group.add(wing);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.2, 7), bossMat);
    tail.position.set(0, 1, -1.7);
    tail.rotation.x = 1.2;
    group.add(tail);
    const legGeometry = new THREE.CylinderGeometry(0.2, 0.16, 0.9, 7);
    for (const [x, z] of [
      [-0.6, 0.55],
      [0.6, 0.55],
      [-0.6, -0.62],
      [0.6, -0.62],
    ] as [number, number][]) {
      const leg = new THREE.Mesh(legGeometry, bossMat);
      leg.position.set(x, 0.45, z);
      group.add(leg);
      limbs.push(leg);
    }
    group.scale.setScalar(scale * 0.85);
    return { group, limbs, height: 4.2 * scale };
  }

  applyState(state: WorldState) {
    const seen = new Set<string>();
    for (const player of state.players) {
      seen.add(player.id);
      let entity = this.entities.get(player.id);
      if (!entity) {
        entity = this.createPlayerEntity(player);
        this.entities.set(player.id, entity);
        this.scene.add(entity.group);
      }
      if (player.id !== this.localId) {
        entity.targetX = player.x;
        entity.targetZ = player.z;
        entity.targetRotation = player.rotation;
      } else {
        const local = entity.group.position;
        if (local.distanceTo(new THREE.Vector3(player.x, local.y, player.z)) > 4) {
          entity.targetX = player.x;
          entity.targetZ = player.z;
        }
      }
      entity.sect = player.sect;
      entity.faction = player.faction;
      entity.group.visible = !player.dead;
      this.updateLabel(
        entity,
        player.stunnedUntil && player.stunnedUntil > state.serverTime ? `[Choáng] ${player.name}` : player.name,
        player.hp / Math.max(1, player.maxHp),
        factionHex(player.faction),
      );
    }

    for (const monster of state.monsters) {
      seen.add(monster.id);
      let entity = this.entities.get(monster.id);
      if (!entity) {
        entity = this.createMonsterEntity(monster);
        this.entities.set(monster.id, entity);
        this.scene.add(entity.group);
      }
      entity.targetX = monster.x;
      entity.targetZ = monster.z;
      entity.targetRotation = monster.rotation;
      entity.dead = monster.dead;
      entity.group.visible = !monster.dead;
      this.updateLabel(
        entity,
        monster.stunnedUntil && monster.stunnedUntil > state.serverTime ? `[Choáng] ${monster.name}` : monster.name,
        monster.hp / Math.max(1, monster.maxHp),
        monster.isBoss ? "#ffb36b" : "#f1e6cc",
      );
    }

    for (const [id, entity] of this.entities) {
      if (seen.has(id)) continue;
      this.scene.remove(entity.group);
      this.disposeObject(entity.group);
      this.entities.delete(id);
      if (this.targetId === id) this.setTarget(null, null);
    }

    if (this.targetId) {
      const target = state.monsters.find((monster) => monster.id === this.targetId)
        ?? state.players.find((player) => player.id === this.targetId);
      if (!target || target.dead) this.setTarget(null, null);
    }
  }

  private updateLabel(entity: EntityView, text: string, ratio: number, color: string) {
    const scale = entity.isBoss ? 6.5 : entity.kind === "player" ? 3.4 : 3.1;
    entity.label.set(text, ratio, color, scale);
  }

  setTarget(id: string | null, kind: EntityKind | null) {
    this.targetId = id;
    this.targetKind = kind;
    if (!id) {
      this.selectionRing.visible = false;
      return;
    }
    const entity = this.entities.get(id);
    if (!entity) {
      this.selectionRing.visible = false;
      return;
    }
    this.selectionRing.visible = true;
    this.selectionRing.position.set(entity.group.position.x, 0.06, entity.group.position.z);
    this.selectionRing.scale.setScalar(entity.isBoss ? 2.6 : 1);
  }

  getTarget(): { id: string; kind: EntityKind } | null {
    if (!this.targetId || !this.targetKind) return null;
    return { id: this.targetId, kind: this.targetKind };
  }

  cycleTarget(): { id: string; kind: EntityKind } | null {
    const alive = [...this.entities.values()].filter(
      (entity) => !entity.dead && entity.id !== this.localId,
    );
    if (alive.length === 0) return null;
    const currentIndex = alive.findIndex((entity) => entity.id === this.targetId);
    const next = alive[(currentIndex + 1) % alive.length];
    if (!next) return null;
    this.setTarget(next.id, next.kind);
    this.onSelect(next.id, next.kind);
    return { id: next.id, kind: next.kind };
  }

  getGroundPointFromPointer(clientX?: number, clientY?: number): { x: number; z: number } | null {
    if (clientX !== undefined && clientY !== undefined) {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    } else {
      this.pointer.copy(this.lastPointerPos);
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const groundPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(groundPlane, groundPoint)) {
      return { x: groundPoint.x, z: groundPoint.z };
    }
    return null;
  }

  getLocalPosition(): { x: number; z: number } | null {
    if (!this.localId) return null;
    const entity = this.entities.get(this.localId);
    if (!entity) return null;
    return { x: entity.targetX, z: entity.targetZ };
  }

  getLocalRotation(): number {
    if (!this.localId) return 0;
    const entity = this.entities.get(this.localId);
    return entity ? entity.group.rotation.y : 0;
  }

  setLocalRotation(rotation: number) {
    if (!this.localId) return;
    const entity = this.entities.get(this.localId);
    if (!entity) return;
    entity.targetRotation = rotation;
    entity.group.rotation.y = rotation;
  }

  setLocalTarget(x: number, z: number) {
    if (!this.localId) return;
    const entity = this.entities.get(this.localId);
    if (!entity) return;
    entity.targetX = x;
    entity.targetZ = z;
    if (Math.abs(x - entity.group.position.x) > 0.01 || Math.abs(z - entity.group.position.z) > 0.01) {
      entity.targetRotation = Math.atan2(x - entity.group.position.x, z - entity.group.position.z);
    }
  }

  getMovementBasis(): { forward: { x: number; z: number }; right: { x: number; z: number } } {
    const forward = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const right = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    return { forward, right };
  }

  playCombat(event: CombatEvent) {
    const targetEntity = this.entities.get(event.targetId);
    const attackerEntity = this.entities.get(event.attackerId);
    if (!targetEntity) return;

    const targetPos = targetEntity.group.position.clone();
    const attackerPos = attackerEntity ? attackerEntity.group.position.clone() : targetPos.clone();
    const attackerRot = attackerEntity ? attackerEntity.group.rotation.y : 0;

    const numberPos = targetPos.clone();
    numberPos.y += event.targetType === "monster" ? targetEntity.labelHeight * 0.5 : 1.7;
    if (event.damage !== 0) {
      this.spawnDamageNumber(numberPos, event);
    }

    if (event.skill) {
      const sect = attackerEntity?.sect;
      if (sect === "SHAOLIN") {
        this.spawnShaolinPalmSkill(attackerPos, targetPos, attackerRot);
      } else if (sect === "WUDU") {
        this.spawnWuduPoisonPalmSkill(attackerPos, targetPos);
      } else if (sect === "WUDANG") {
        this.spawnWudangSwordSkill(attackerPos, targetPos, attackerRot);
      } else if (sect === "EMEI") {
        this.spawnEmeiLightSkill(attackerPos.distanceTo(targetPos) < 2 ? attackerPos : targetPos);
      } else {
        // Fallback or Boss / Monster Skill
        this.spawnShaolinPalmSkill(attackerPos, targetPos, attackerRot);
      }
      this.spawnImpact(targetPos, 0xffd166, 2.5, 0xffa726);
    } else {
      // Basic Attack
      if (attackerEntity?.sect === "SHAOLIN" || attackerEntity?.sect === "WUDU") {
        this.spawnShaolinPalmSkill(attackerPos, targetPos, attackerRot, 1.1);
      }
      this.spawnImpact(targetPos, 0xff8a80, 1.2, 0xff5252);
    }
  }

  playBossSpawn(id: string) {
    const entity = this.entities.get(id);
    if (!entity) return;
    this.spawnImpact(entity.group.position, 0xb37bff, 3);
  }

  private spawnDamageNumber(position: THREE.Vector3, event: CombatEvent) {
    const projected = position.clone().project(this.camera);
    if (projected.z > 1) return;
    const rect = this.canvas.getBoundingClientRect();
    const x = rect.left + (projected.x * 0.5 + 0.5) * rect.width;
    const y = rect.top + (-projected.y * 0.5 + 0.5) * rect.height;
    const div = document.createElement("div");
    const heal = event.damage < 0;
    div.className = `damage-number${event.crit ? " crit" : ""}${event.skill ? " skill" : ""}${heal ? " heal" : ""}`;
    div.textContent = heal ? `+${Math.abs(event.damage)}` : `-${event.damage}${event.crit ? "!" : ""}`;
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    this.container.appendChild(div);
    setTimeout(() => div.remove(), 900);
  }

  private createPalmGroup(color: number, scale = 1): THREE.Group {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
    });

    // Central palm mesh
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.7 * scale, 0.16 * scale, 0.75 * scale), mat);
    palm.position.set(0, 0, 0);
    group.add(palm);

    // Core energy sphere
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.25 * scale, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }),
    );
    core.position.set(0, 0.08 * scale, 0);
    group.add(core);

    // Fingers
    const fingers = [
      { x: -0.42 * scale, z: -0.1 * scale, w: 0.18, h: 0.12, l: 0.42, rotY: -0.5 }, // Thumb
      { x: -0.26 * scale, z: 0.6 * scale, w: 0.15, h: 0.12, l: 0.55, rotY: -0.05 }, // Index
      { x: 0.0 * scale, z: 0.68 * scale, w: 0.16, h: 0.12, l: 0.65, rotY: 0 },      // Middle
      { x: 0.26 * scale, z: 0.62 * scale, w: 0.15, h: 0.12, l: 0.58, rotY: 0.05 },  // Ring
      { x: 0.46 * scale, z: 0.46 * scale, w: 0.13, h: 0.11, l: 0.45, rotY: 0.2 },   // Pinky
    ];

    for (const f of fingers) {
      const finger = new THREE.Mesh(
        new THREE.BoxGeometry(f.w * scale, f.h * scale, f.l * scale),
        mat,
      );
      finger.position.set(f.x, 0, f.z);
      finger.rotation.y = f.rotY;
      group.add(finger);
    }

    // Outer glowing aura ring
    const aura = new THREE.Mesh(
      new THREE.RingGeometry(0.5 * scale, 0.85 * scale, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    aura.rotation.x = -Math.PI / 2;
    group.add(aura);

    return group;
  }

  private spawnDustPuff(pos: THREE.Vector3, rotationY: number) {
    const size = 0.18 + Math.random() * 0.16;
    const geo = new THREE.DodecahedronGeometry(size, 0);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd2c29d,
      transparent: true,
      opacity: 0.55,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const backAngle = rotationY + Math.PI + (Math.random() - 0.5) * 0.8;
    const dist = 0.2 + Math.random() * 0.35;
    mesh.position.set(
      pos.x + Math.sin(backAngle) * dist,
      0.08 + Math.random() * 0.08,
      pos.z + Math.cos(backAngle) * dist,
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    this.scene.add(mesh);

    const vx = (Math.random() - 0.5) * 0.5;
    const vz = (Math.random() - 0.5) * 0.5;
    const vy = 0.4 + Math.random() * 0.4;

    this.effects.push({
      object: mesh,
      life: 0,
      maxLife: 0.4 + Math.random() * 0.25,
      update: (dt, progress) => {
        mesh.position.x += vx * dt;
        mesh.position.y += vy * dt;
        mesh.position.z += vz * dt;
        mesh.scale.setScalar(1 + progress * 2.2);
        mat.opacity = Math.max(0, 0.55 * (1 - progress));
      },
    });
  }

  private spawnShaolinPalmSkill(
    attackerPos: THREE.Vector3,
    targetPos: THREE.Vector3,
    attackerRot: number,
    scaleMult = 2.2,
  ) {
    const palmGroup = this.createPalmGroup(0xffd700, scaleMult);
    palmGroup.position.copy(attackerPos);
    palmGroup.position.y += 1.2;

    const dir = new THREE.Vector3().subVectors(targetPos, attackerPos);
    const angle = dir.lengthSq() > 0.01 ? Math.atan2(dir.x, dir.z) : attackerRot;
    palmGroup.rotation.y = angle;

    const light = new THREE.PointLight(0xffd700, 8, 14);
    light.position.set(0, 0, 0);
    palmGroup.add(light);

    this.scene.add(palmGroup);

    const startX = palmGroup.position.x;
    const startZ = palmGroup.position.z;
    const forwardX = Math.sin(angle);
    const forwardZ = Math.cos(angle);

    this.effects.push({
      object: palmGroup,
      life: 0,
      maxLife: 0.55,
      light,
      update: (_dt, progress) => {
        const moveDist = progress * 4.5;
        palmGroup.position.x = startX + forwardX * moveDist;
        palmGroup.position.z = startZ + forwardZ * moveDist;
        palmGroup.scale.setScalar(scaleMult * (1 + progress * 0.7));
        light.intensity = Math.max(0, 8 * (1 - progress));
        palmGroup.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const mat = child.material as THREE.Material;
            if ("opacity" in mat) (mat as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - progress));
          }
        });
      },
    });
  }

  private spawnWuduPoisonPalmSkill(attackerPos: THREE.Vector3, targetPos: THREE.Vector3) {
    const palmGroup = this.createPalmGroup(0x33ff66, 1.4);
    palmGroup.position.copy(attackerPos);
    palmGroup.position.y += 1.2;

    const dir = new THREE.Vector3().subVectors(targetPos, attackerPos);
    const dist = dir.length();
    const angle = Math.atan2(dir.x, dir.z);
    palmGroup.rotation.y = angle;

    const light = new THREE.PointLight(0x00ff66, 7, 12);
    palmGroup.add(light);
    this.scene.add(palmGroup);

    let lastSparkleTime = 0;

    this.effects.push({
      object: palmGroup,
      life: 0,
      maxLife: Math.max(0.3, Math.min(0.65, dist / 22)),
      light,
      update: (_dt, progress) => {
        palmGroup.position.lerpVectors(
          new THREE.Vector3(attackerPos.x, 1.2, attackerPos.z),
          new THREE.Vector3(targetPos.x, 1.2, targetPos.z),
          progress,
        );
        light.intensity = Math.max(0, 7 * (1 - progress * 0.4));

        if (progress - lastSparkleTime > 0.08) {
          lastSparkleTime = progress;
          this.spawnLightSparkle(palmGroup.position, 0x00ff66, 0.8);
        }

        if (progress >= 0.95) {
          this.spawnImpact(targetPos, 0x00ff66, 2.5, 0x33ff66);
        }
      },
    });
  }

  private spawnWudangSwordSkill(attackerPos: THREE.Vector3, targetPos: THREE.Vector3, attackerRot: number) {
    const group = new THREE.Group();
    const geo = new THREE.TorusGeometry(1.5, 0.12, 8, 24, Math.PI * 0.8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    const crescent = new THREE.Mesh(geo, mat);
    crescent.rotation.x = Math.PI / 2;
    group.add(crescent);

    const innerGeo = new THREE.TorusGeometry(1.4, 0.06, 8, 24, Math.PI * 0.8);
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
    const inner = new THREE.Mesh(innerGeo, innerMat);
    inner.rotation.x = Math.PI / 2;
    group.add(inner);

    const dir = new THREE.Vector3().subVectors(targetPos, attackerPos);
    const angle = dir.lengthSq() > 0.01 ? Math.atan2(dir.x, dir.z) : attackerRot;
    group.position.copy(attackerPos);
    group.position.y += 1.1;
    group.rotation.y = angle;

    const light = new THREE.PointLight(0x00e5ff, 8, 14);
    group.add(light);
    this.scene.add(group);

    const startX = group.position.x;
    const startZ = group.position.z;
    const forwardX = Math.sin(angle);
    const forwardZ = Math.cos(angle);

    this.effects.push({
      object: group,
      life: 0,
      maxLife: 0.5,
      light,
      update: (_dt, progress) => {
        const travel = progress * 12;
        group.position.x = startX + forwardX * travel;
        group.position.z = startZ + forwardZ * travel;
        group.scale.setScalar(1 + progress * 0.6);
        light.intensity = Math.max(0, 8 * (1 - progress));
        mat.opacity = Math.max(0, 0.9 * (1 - progress));
        innerMat.opacity = Math.max(0, 0.95 * (1 - progress));
      },
    });

    this.spawnImpact(targetPos, 0x00e5ff, 2.8, 0x80efff);
  }

  private spawnEmeiLightSkill(position: THREE.Vector3) {
    const group = new THREE.Group();
    group.position.copy(position);

    const pillarGeo = new THREE.CylinderGeometry(1.2, 1.8, 12, 16, 1, true);
    const pillarMat = new THREE.MeshBasicMaterial({
      color: 0xffea78,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });
    const pillar = new THREE.Mesh(pillarGeo, pillarMat);
    pillar.position.y = 6;
    group.add(pillar);

    const ringGeo = new THREE.RingGeometry(0.5, 3.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.1;
    group.add(ring);

    const light = new THREE.PointLight(0xffea78, 10, 16);
    light.position.y = 2;
    group.add(light);

    this.scene.add(group);

    for (let i = 0; i < 10; i += 1) {
      const sparkPos = position.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 2.5,
        Math.random() * 3,
        (Math.random() - 0.5) * 2.5,
      ));
      this.spawnLightSparkle(sparkPos, 0xffffff, 1.2);
    }

    this.effects.push({
      object: group,
      life: 0,
      maxLife: 0.8,
      light,
      update: (_dt, progress) => {
        light.intensity = Math.max(0, 10 * (1 - progress));
        pillarMat.opacity = Math.max(0, 0.75 * (1 - progress));
        ringMat.opacity = Math.max(0, 0.85 * (1 - progress));
        group.scale.set(1 + progress * 0.3, 1, 1 + progress * 0.3);
      },
    });
  }

  private spawnLightSparkle(pos: THREE.Vector3, color: number, scale = 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.12 * scale, 8, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
    );
    mesh.position.copy(pos);
    this.scene.add(mesh);

    const vy = 1.2 + Math.random() * 1.5;

    this.effects.push({
      object: mesh,
      life: 0,
      maxLife: 0.4,
      update: (dt, progress) => {
        mesh.position.y += vy * dt;
        mesh.scale.setScalar(Math.max(0, scale * (1 - progress)));
        (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - progress));
      },
    });
  }

  private spawnImpact(position: THREE.Vector3, color: number, size = 1, lightColor?: number) {
    const group = new THREE.Group();
    group.position.copy(position);

    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.55, 28),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.2;
    mesh.scale.setScalar(size);
    group.add(mesh);

    const light = new THREE.PointLight(lightColor ?? color, 6 * size, 10 * size);
    light.position.y = 0.5;
    group.add(light);

    this.scene.add(group);

    this.effects.push({
      object: group,
      life: 0,
      maxLife: 0.45,
      light,
      update: (_dt, progress) => {
        mesh.scale.setScalar(size * (1 + progress * 5));
        (mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 * (1 - progress));
        light.intensity = Math.max(0, 6 * size * (1 - progress));
      },
    });
  }

  private resize() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  private loop = () => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.updateEntities(dt);
    this.updateCamera(dt);
    this.updateEffects(dt);
    if (now - this.lastShadowUpdateAt >= 125) {
      this.lastShadowUpdateAt = now;
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.renderer.render(this.scene, this.camera);
  };

  private updateEntities(dt: number) {
    const lerp = 1 - Math.exp(-dt * 9);
    const nowSec = performance.now() * 0.001;

    for (const entity of this.entities.values()) {
      const group = entity.group;
      const dx = entity.targetX - group.position.x;
      const dz = entity.targetZ - group.position.z;
      const moving = Math.hypot(dx, dz) > 0.03;
      if (moving) {
        group.position.x += dx * lerp;
        group.position.z += dz * lerp;
        let diff = entity.targetRotation - group.rotation.y;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        group.rotation.y += diff * Math.min(1, dt * 10);
        entity.walkTime += dt;

        if (!entity.lastDustTime || nowSec - entity.lastDustTime > 0.18) {
          entity.lastDustTime = nowSec;
          this.spawnDustPuff(group.position, group.rotation.y);
        }
      }
      const swing = moving ? Math.sin(entity.walkTime * 10) * 0.55 : 0;
      entity.limbs.forEach((limb, index) => {
        const target = index % 2 === 0 ? swing : -swing;
        limb.rotation.x += (target - limb.rotation.x) * Math.min(1, dt * 8);
      });
    }
    if (this.targetId) {
      const target = this.entities.get(this.targetId);
      if (target) {
        this.selectionRing.position.set(target.group.position.x, 0.06, target.group.position.z);
        const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.06;
        this.selectionRing.scale.setScalar((target.isBoss ? 2.6 : 1) * pulse);
      }
    }
  }

  private updateCamera(dt: number) {
    const local = this.localId ? this.entities.get(this.localId) : null;
    if (local) {
      this.cameraTarget.lerp(
        this.cameraOffset.set(local.group.position.x, local.group.position.y + 1.35, local.group.position.z),
        1 - Math.exp(-dt * 8),
      );
    }
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.cameraOffset.set(
      Math.sin(this.yaw) * horizontal,
      Math.sin(this.pitch) * this.distance,
      Math.cos(this.yaw) * horizontal,
    );
    this.cameraDesired.copy(this.cameraTarget).add(this.cameraOffset);
    this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-dt * 10));
    this.camera.lookAt(this.cameraTarget);
  }

  private updateEffects(dt: number) {
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const effect = this.effects[i]!;
      effect.life += dt;
      const progress = Math.min(1, effect.life / effect.maxLife);

      if (effect.update) {
        effect.update(dt, progress);
      }

      if (effect.life >= effect.maxLife) {
        this.scene.remove(effect.object);
        this.disposeObject(effect.object);
        this.effects.splice(i, 1);
      }
    }
  }

  private disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      if (child instanceof THREE.Light) {
        child.dispose?.();
      }
      const materials = child instanceof THREE.Mesh || child instanceof THREE.Sprite
        ? Array.isArray(child.material) ? child.material : [child.material]
        : [];
      for (const material of materials) {
        if (material instanceof THREE.SpriteMaterial || material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) {
          material.map?.dispose();
        }
        material.dispose();
      }
      if ("geometry" in child && (child as { geometry?: THREE.BufferGeometry }).geometry) {
        (child as { geometry: THREE.BufferGeometry }).geometry.dispose();
      }
    });
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("resize", this.resizeHandler);
    this.renderer.dispose();
    this.disposeObject(this.scene);
  }
}
