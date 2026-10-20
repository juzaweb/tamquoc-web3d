import "./style.css";
import { GameClient } from "./game";
import { crossesCityWall } from "./collision";
import { Net } from "./net";
import { ReconnectController } from "./reconnect";
import type {
  CharacterSummary,
  CombatEvent,
  Content,
  FactionId,
  Gender,
  NpcInfo,
  SelfState,
  SectId,
  WorldState,
} from "./types";

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
};

const net = new Net();
let token = localStorage.getItem("tq_token");
let content: Content | null = null;
let characters: CharacterSummary[] = [];
let self: SelfState | null = null;
let worldState: WorldState | null = null;
let game: GameClient | null = null;
let target: { id: string; kind: "monster" | "player" } | null = null;
let currentScreen: "auth" | "characters" | "game" = "auth";
let skillCooldownsAt: Record<string, number> = { Q: 0, W: 0, E: 0, R: 0 };
let potionReadyAt = 0;
let lastMoveSentAt = 0;
let lastFrameAt = performance.now();
let deathTimer: ReturnType<typeof setInterval> | null = null;
let enteringGame = false;
let suppressDisconnectNotice = false;
let activeCharacter: CharacterSummary | null = null;
let activeNpc: NpcInfo | null = null;
let nearbyNpc: NpcInfo | null = null;
let promptNpcId: string | null = null;
let clickTargetPosition: { x: number; z: number } | null = null;
let lastMouseX = window.innerWidth / 2;
let lastMouseY = window.innerHeight / 2;

window.addEventListener("mousemove", (event) => {
  lastMouseX = event.clientX;
  lastMouseY = event.clientY;
});

function isMobileDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

const keys = new Set<string>();
let selectedSect: SectId = "SHAOLIN";
let selectedFaction: FactionId = "HAN";
let selectedGender: Gender = "MALE";

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers: { ...headers, ...(options.headers ?? {}) } });
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error ?? "Yêu cầu thất bại.");
  return data;
}

function checkOrientation() {
  const isPortrait = window.matchMedia("(orientation: portrait)").matches || window.innerHeight > window.innerWidth;
  const isMobileOrTablet = window.innerWidth <= 1024 || window.innerHeight <= 1024 || "ontouchstart" in window;
  const overlay = $("orientation-overlay");
  overlay.classList.toggle("hidden", !(isPortrait && isMobileOrTablet));
}

function requestLandscapeLock() {
  if (screen.orientation && "lock" in screen.orientation) {
    (screen.orientation.lock as (orientation: string) => Promise<void>)("landscape").catch(() => {
      // Ignore orientation lock rejection on unsupported browsers or without user activation
    });
  }
}

function showScreen(screen: "auth" | "characters" | "game") {
  currentScreen = screen;
  $("auth-screen").classList.toggle("hidden", screen !== "auth");
  $("character-screen").classList.toggle("hidden", screen !== "characters");
  $("game-screen").classList.toggle("hidden", screen !== "game");
  checkOrientation();
}

function showAuthError(message: string) {
  $("auth-error").textContent = message;
}

function notify(message: string, kind: "success" | "danger" | "info" = "info") {
  const container = $("notifications");
  const node = document.createElement("div");
  node.className = `notification ${kind}`;
  node.textContent = message;
  container.appendChild(node);
  setTimeout(() => node.remove(), 3800);
}

function appendChat(message: {
  channel: string;
  from: string;
  faction: FactionId | null;
  message: string;
  system?: boolean;
}) {
  if (message.channel === "faction" && self && message.faction && message.faction !== self.faction) return;
  const log = $("chat-log");
  const line = document.createElement("div");
  line.className = `chat-line ${message.channel}${message.system ? " system" : ""}`;
  if (!message.system) {
    const tag = document.createElement("span");
    tag.className = "chat-channel-tag";
    tag.textContent = message.channel === "faction" ? "[Phe]" : "[TG]";
    line.appendChild(tag);
    const from = document.createElement("span");
    from.className = "chat-from";
    from.textContent = `${message.from}: `;
    line.appendChild(from);
  }
  const text = document.createElement("span");
  text.textContent = message.message;
  line.appendChild(text);
  log.appendChild(line);
  while (log.children.length > 120) log.firstElementChild?.remove();
  log.scrollTop = log.scrollHeight;
}

function setupAuthTabs() {
  document.querySelectorAll<HTMLButtonElement>("[data-auth-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll<HTMLButtonElement>("[data-auth-tab]").forEach((other) => {
        other.classList.toggle("active", other === tab);
      });
      const isLogin = tab.dataset.authTab === "login";
      $("login-form").classList.toggle("hidden", !isLogin);
      $("register-form").classList.toggle("hidden", isLogin);
      showAuthError("");
    });
  });
}

function setupAuthForms() {
  $<HTMLFormElement>("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    showAuthError("");
    try {
      const result = await api<{ token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: String(data.get("username") ?? ""),
          password: String(data.get("password") ?? ""),
        }),
      });
      token = result.token;
      localStorage.setItem("tq_token", token);
      await openCharacterScreen();
    } catch (error) {
      showAuthError(error instanceof Error ? error.message : "Đăng nhập thất bại.");
    }
  });

  $<HTMLFormElement>("register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    showAuthError("");
    if (data.get("password") !== data.get("confirm")) {
      showAuthError("Mật khẩu nhập lại không khớp.");
      return;
    }
    try {
      const result = await api<{ token: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: String(data.get("username") ?? ""),
          password: String(data.get("password") ?? ""),
        }),
      });
      token = result.token;
      localStorage.setItem("tq_token", token);
      await openCharacterScreen();
    } catch (error) {
      showAuthError(error instanceof Error ? error.message : "Tạo tài khoản thất bại.");
    }
  });

  $("logout-btn").addEventListener("click", () => {
    leaveGame();
    token = null;
    localStorage.removeItem("tq_token");
    self = null;
    showScreen("auth");
  });
}

async function openCharacterScreen() {
  if (!token) {
    showScreen("auth");
    return;
  }
  try {
    const me = await api<{ user: { username: string } }>("/api/auth/me");
    $("account-name").textContent = me.user.username;
    await refreshCharacters();
    showScreen("characters");
  } catch {
    token = null;
    localStorage.removeItem("tq_token");
    showScreen("auth");
  }
}

async function refreshCharacters() {
  const result = await api<{ characters: CharacterSummary[] }>("/api/characters");
  characters = result.characters;
  renderCharacterList();
}

function renderCharacterList() {
  const list = $("character-list");
  list.replaceChildren();
  $("no-characters").classList.toggle("hidden", characters.length > 0);
  $("character-count").textContent = `${characters.length}/4 nhân vật`;
  if (!content) return;

  for (const character of characters) {
    const sect = content.sects[character.sect];
    const faction = content.factions[character.faction];
    const card = document.createElement("div");
    card.className = "character-card";
    card.style.setProperty("--accent", character.appearance?.color ?? "#d9b36c");

    const name = document.createElement("h3");
    name.textContent = character.name;
    const meta = document.createElement("div");
    meta.className = "char-meta";
    meta.textContent = `${sect.name} · ${faction.name} · Cấp ${character.level}`;

    const stats = document.createElement("div");
    stats.className = "char-stats";
    stats.innerHTML = `<span>Lực ${character.stats.strength}</span><span>Tốc ${character.stats.speed}</span><span>Trí ${character.stats.intelligence}</span>`;

    const button = document.createElement("button");
    button.className = "btn btn-primary";
    button.textContent = "Vào thế giới";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      void enterGame(character);
    });
    card.addEventListener("click", () => void enterGame(character));

    card.append(name, meta, stats, button);
    list.appendChild(card);
  }
}

function renderCreateOptions() {
  if (!content) return;
  const sects = content.sects;
  const sectWrap = $("sect-options");
  sectWrap.replaceChildren();
  for (const sect of Object.values(sects)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `option${sect.id === selectedSect ? " active" : ""}`;
    button.dataset.sect = sect.id;
    button.innerHTML = `<strong>${sect.name}</strong><small>${sect.weaponName} · ${sect.skills.Q.name}</small>`;
    button.addEventListener("click", () => {
      selectedSect = sect.id;
      if (!sect.allowedGenders.includes(selectedGender)) selectedGender = sect.allowedGenders[0] ?? "MALE";
      renderCreateOptions();
    });
    sectWrap.appendChild(button);
  }

  const factionWrap = $("faction-options");
  factionWrap.replaceChildren();
  for (const faction of Object.values(content.factions)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `option${faction.id === selectedFaction ? " active" : ""}`;
    button.textContent = faction.name;
    button.addEventListener("click", () => {
      selectedFaction = faction.id;
      renderCreateOptions();
    });
    factionWrap.appendChild(button);
  }

  document.querySelectorAll<HTMLButtonElement>("[data-gender]").forEach((button) => {
    const gender = button.dataset.gender as Gender;
    const allowed = sects[selectedSect].allowedGenders.includes(gender);
    button.classList.toggle("active", gender === selectedGender);
    button.disabled = !allowed;
    button.style.opacity = allowed ? "1" : "0.35";
    button.onclick = () => {
      if (!allowed) return;
      selectedGender = gender;
      renderCreateOptions();
    };
  });

  const sect = sects[selectedSect];
  const summary = $("sect-summary");
  summary.innerHTML = `
    <strong>${sect.name} · ${sect.weaponName}</strong><br/>
    ${sect.description}<br/>
    Sức mạnh ${sect.base.strength} · Tốc độ ${sect.base.speed} · Trí tuệ ${sect.base.intelligence}<br/>
    Tầm đánh thường: <strong>${sect.attackRange}m</strong><br/>
    Kỹ năng: <strong>Q: ${sect.skills.Q.name}</strong> (${sect.skills.Q.range}m) |
    <strong>W: ${sect.skills.W.name}</strong> (${sect.skills.W.range}m) |
    <strong>E: ${sect.skills.E.name}</strong> (${sect.skills.E.range}m) |
    <strong>R: ${sect.skills.R.name}</strong> (${sect.skills.R.range}m)
  `;
}

function setupCharacterCreation() {
  renderCreateOptions();
  $<HTMLFormElement>("create-character-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const data = new FormData(form);
    const errorNode = $("create-error");
    errorNode.textContent = "";
    try {
      await api("/api/characters", {
        method: "POST",
        body: JSON.stringify({
          name: String(data.get("name") ?? "").trim(),
          sect: selectedSect,
          faction: selectedFaction,
          gender: selectedGender,
          appearance: {
            color: String(data.get("appearanceColor") ?? "#c0392b"),
            hair: String(data.get("appearanceHair") ?? "#1b1b1f"),
          },
        }),
      });
      form.reset();
      $<HTMLInputElement>("appearance-color").value = "#c0392b";
      $<HTMLInputElement>("appearance-hair").value = "#1b1b1f";
      await refreshCharacters();
      notify("Đã tạo nhân vật mới.", "success");
    } catch (error) {
      errorNode.textContent = error instanceof Error ? error.message : "Không thể tạo nhân vật.";
    }
  });
}

function resetCanvas() {
  const old = $<HTMLCanvasElement>("game-canvas");
  const fresh = old.cloneNode(false) as HTMLCanvasElement;
  old.replaceWith(fresh);
  return fresh;
}

async function enterGame(character: CharacterSummary) {
  if (!token || !content || enteringGame) return;
  enteringGame = true;
  reconnect.stop();
  suppressDisconnectNotice = false;
  activeCharacter = character;
  showScreen("game");
  $("loading-overlay").classList.remove("hidden", "fade-out");
  resetCanvas();
  game?.dispose();
  clickTargetPosition = null;
  game = new GameClient(
    $<HTMLCanvasElement>("game-canvas"),
    content,
    (id, kind) => {
      target = id && kind ? { id, kind } : null;
      updateTargetFrame();
    },
    (point) => {
      clickTargetPosition = { x: point.x, z: point.z };
    },
  );
  clearChat();
  appendSystemChat("Đang kết nối tới thế giới...");
  try {
    await net.connect(token);
    net.emit("world:enter", { characterId: character.id });
  } catch (error) {
    net.disconnect();
    activeCharacter = null;
    reconnect.stop();
    showScreen("characters");
    notify(error instanceof Error ? error.message : "Không thể kết nối.", "danger");
  } finally {
    enteringGame = false;
  }
}

function clearChat() {
  $("chat-log").replaceChildren();
}

function appendSystemChat(message: string) {
  appendChat({ channel: "system", from: "Hệ thống", faction: null, message, system: true });
}

const reconnect = new ReconnectController({
  getToken: () => token,
  getCharacterId: () => activeCharacter?.id ?? null,
  connect: (value) => net.connect(value),
  disconnect: () => net.disconnect(),
  enterWorld: (characterId) => net.emit("world:enter", { characterId }),
  onBanner: (message) => {
    const banner = $("reconnect-banner");
    banner.classList.toggle("hidden", !message);
    if (message) banner.textContent = message;
  },
  onNotice: (message) => notify(message, "danger"),
  onSystemChat: appendSystemChat,
  onRestored: () => {
    notify("Đã kết nối lại.", "success");
    appendSystemChat("Đã kết nối lại với server.");
  },
  onGiveUp: (message, sessionExpired) => {
    notify(message, "danger");
    if (sessionExpired) {
      token = null;
      localStorage.removeItem("tq_token");
    }
    leaveGame();
  },
});

function leaveGame() {
  suppressDisconnectNotice = true;
  enteringGame = false;
  activeCharacter = null;
  clickTargetPosition = null;
  reconnect.stop();
  keys.clear();
  net.disconnect();
  game?.dispose();
  game = null;
  self = null;
  worldState = null;
  target = null;
  activeNpc = null;
  nearbyNpc = null;
  if (deathTimer) clearInterval(deathTimer);
  deathTimer = null;
  $("death-overlay").classList.add("hidden");
  if (currentScreen === "game") void openCharacterScreen();
}

function bindGameEvents() {
  net.on("world:init", (payload: { self: SelfState; world: WorldState }) => {
    self = payload.self;
    worldState = payload.world;
    reconnect.notifyWorldInit();
    if (game) game.setSelf(self, payload.world, net.id ?? "");
    updateSelfUI();
    renderInventory();
    renderQuests();
    updateTargetFrame();
    setTimeout(() => $("loading-overlay").classList.add("fade-out"), 250);
    setTimeout(() => $("loading-overlay").classList.add("hidden"), 900);
  });

  net.on("self:update", (state: SelfState) => {
    self = state;
    updateSelfUI();
    if ($("inventory-panel").classList.contains("hidden") === false) renderInventory();
    if ($("quests-panel").classList.contains("hidden") === false) renderQuests();
    if ($("shop-panel").classList.contains("hidden") === false) renderShop();
    if (!state.dead) $("death-overlay").classList.add("hidden");
  });

  net.on("world:state", (state: WorldState) => {
    worldState = state;
    game?.applyState(state);
    const me = state.players.find((player) => player.id === net.id);
    if (self && me) {
      self.hp = me.hp;
      self.mp = me.mp;
      self.dead = me.dead;
      self.x = me.x;
      self.z = me.z;
      updateSelfUI();
    }
    updateWorldMeta();
    updateTargetFrame();
  });

  net.on("combat:event", (event: CombatEvent) => {
    game?.playCombat(event);
    if (event.killed && event.targetType === "monster" && event.attackerId === net.id) {
      target = null;
      updateTargetFrame();
    }
  });

  net.on("chat:message", (message: { channel: string; from: string; faction: FactionId | null; message: string; system?: boolean }) => {
    appendChat(message);
  });

  net.on("notification", (payload: { kind?: "success" | "danger" | "info"; message: string }) => {
    notify(payload.message, payload.kind ?? "info");
  });

  net.on("loot", (payload: { xp: number; gold: number; items: { name: string; quantity: number }[] }) => {
    const parts = [`+${payload.xp} XP`, `+${payload.gold} vàng`];
    for (const item of payload.items) parts.push(`${item.name} x${item.quantity}`);
    notify(`Nhận được: ${parts.join(", ")}`, "success");
  });

  net.on("level:up", (payload: { level: number }) => {
    notify(`Thăng cấp! Bạn đạt cấp ${payload.level}.`, "success");
  });

  net.on("boss:spawn", (payload: { id: string; message: string }) => {
    notify(payload.message, "danger");
    game?.playBossSpawn(payload.id);
  });

  net.on("player:died", () => {
    startDeathCountdown(5);
  });

  net.on("error:game", (payload: { message: string }) => {
    notify(payload.message, "danger");
  });

  net.on("disconnect", (reason: string) => {
    if (currentScreen !== "game" || suppressDisconnectNotice) {
      suppressDisconnectNotice = false;
      return;
    }
    if (reason === "io server disconnect") {
      reconnect.stop();
      notify("Phiên chơi đã được tiếp nhận ở nơi khác.", "danger");
      leaveGame();
      return;
    }
    if (reason === "io client disconnect") return;
    reconnect.start();
  });
}

function startDeathCountdown(seconds: number) {
  $("death-overlay").classList.remove("hidden");
  let remaining = seconds;
  $("respawn-countdown").textContent = String(remaining);
  if (deathTimer) clearInterval(deathTimer);
  deathTimer = setInterval(() => {
    remaining -= 1;
    $("respawn-countdown").textContent = String(Math.max(0, remaining));
    if (remaining <= 0) {
      if (deathTimer) clearInterval(deathTimer);
      deathTimer = null;
    }
  }, 1000);
}

function updateSelfUI() {
  if (!self || !content) return;
  const sect = content.sects[self.sect];
  const faction = content.factions[self.faction];
  $("self-name").textContent = self.name;
  $("self-level").textContent = `Cấp ${self.level}`;
  const factionChip = $("self-faction");
  factionChip.textContent = faction.name;
  factionChip.dataset.faction = self.faction;
  $("portrait-badge").textContent = sect.name.charAt(0);

  const hpRatio = Math.max(0, Math.min(1, self.hp / Math.max(1, self.stats.maxHp)));
  const mpRatio = Math.max(0, Math.min(1, self.mp / Math.max(1, self.stats.maxMp)));
  const atMaxLevel = self.level >= (content.world.maxLevel ?? 100);
  const xpRatio = atMaxLevel ? 1 : Math.max(0, Math.min(1, self.xp / Math.max(1, self.xpNext)));
  $("hp-fill").style.width = `${hpRatio * 100}%`;
  $("mp-fill").style.width = `${mpRatio * 100}%`;
  $("xp-fill").style.width = `${xpRatio * 100}%`;
  $("hp-text").textContent = `${Math.round(self.hp)} / ${self.stats.maxHp}`;
  $("mp-text").textContent = `${Math.round(self.mp)} / ${self.stats.maxMp}`;
  $("xp-text").textContent = atMaxLevel ? "Cấp tối đa" : `${self.xp} / ${self.xpNext} XP`;
  $("self-gold").textContent = `${self.gold.toLocaleString("vi-VN")} vàng`;
  $("self-stats").textContent = `Lực ${self.stats.strength} · Tốc ${self.stats.speed} · Trí ${self.stats.intelligence}`;
  updateZoneLabel();
  const slots: ("Q" | "W" | "E" | "R")[] = ["Q", "W", "E", "R"];
  for (const slot of slots) {
    const sk = sect.skills[slot];
    if (sk) {
      $(`skill-${slot.toLowerCase()}-label`).textContent = sk.name;
      $(`skill-${slot.toLowerCase()}-icon`).textContent = slot;
      $(`action-skill-${slot.toLowerCase()}`).title = `${sk.name} (${slot})\n${sk.description}`;
    }
  }
  $("pvp-toggle").textContent = `PvP: ${self.pvpEnabled ? "Bật" : "Tắt"}`;
  $("pvp-toggle").classList.toggle("btn-primary", self.pvpEnabled);
}

function updateZoneLabel() {
  if (!self || !content) return;
  const world = content.world;
  const zone = $("zone-name");
  const atGate = world.cities.find((city) => {
    const gate = city.gate;
    return Math.hypot(self!.x - gate.x, self!.z - gate.z) < world.gatePkRadius
      && Math.hypot(self!.x - city.x, self!.z - city.z) > world.gatePkInnerRadius;
  });
  if (atGate) {
    zone.textContent = `${atGate.name} · Cổng chính · PK tự động`;
    zone.dataset.faction = atGate.faction;
    return;
  }
  const inCity = world.cities.find(
    (city) => Math.hypot(self!.x - city.x, self!.z - city.z) < world.safeRadius,
  );
  if (inCity) {
    zone.textContent = `${inCity.name} · Khu an toàn`;
    zone.dataset.faction = inCity.faction;
    return;
  }
  if (Math.hypot(self.x, self.z) < 30) {
    zone.textContent = "Chiến Trường Trung Nguyên · PvP";
    zone.dataset.faction = "";
    return;
  }
  let nearest = world.cities[0]!;
  for (const city of world.cities) {
    if (Math.hypot(self.x - city.x, self.z - city.z) < Math.hypot(self.x - nearest.x, self.z - nearest.z)) {
      nearest = city;
    }
  }
  zone.textContent = `Ngoại thành ${nearest.name} · Bãi farm`;
  zone.dataset.faction = nearest.faction;
}

function updateWorldMeta() {
  if (!worldState) return;
  $("online-count").textContent = `${worldState.players.length} online`;
  const bossChip = $("boss-timer");
  if (worldState.bossActive) {
    bossChip.classList.remove("hidden");
    bossChip.textContent = "Hắc Long Vương đang hoành hành";
  } else {
    const remaining = Math.max(0, Math.ceil((worldState.nextBossAt - Date.now()) / 1000));
    bossChip.classList.remove("hidden");
    bossChip.textContent = `Boss: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
  }
}

function updateTargetFrame() {
  const frame = $("target-frame");
  if (!target || !worldState) {
    frame.classList.add("hidden");
    return;
  }
  const entity = target.kind === "monster"
    ? worldState.monsters.find((monster) => monster.id === target?.id)
    : worldState.players.find((player) => player.id === target?.id);
  if (!entity || entity.dead) {
    target = null;
    frame.classList.add("hidden");
    game?.setTarget(null, null);
    return;
  }
  frame.classList.remove("hidden");
  $("target-name").textContent = entity.name;
  $("target-level").textContent = `Cấp ${entity.level}`;
  const ratio = entity.hp / Math.max(1, entity.maxHp);
  $("target-hp-fill").style.width = `${Math.max(0, ratio) * 100}%`;
  $("target-hp-text").textContent = `${Math.round(entity.hp)} / ${entity.maxHp}`;
}

function renderInventory() {
  if (!self || !content) return;
  const equipment = $("equipment-row");
  equipment.replaceChildren();
  const slotLabels: { key: "weapon" | "armor" | "accessory"; label: string }[] = [
    { key: "weapon", label: "Vũ khí" },
    { key: "armor", label: "Áo giáp" },
    { key: "accessory", label: "Phụ kiện" },
  ];
  for (const slot of slotLabels) {
    const item = self.items.find((entry) => entry.slot === slot.key);
    const template = item ? content.items[item.templateId] : null;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `equip-slot${item ? " filled" : ""}`;
    button.innerHTML = `<span>${slot.label}</span><small>${template ? template.name : "Trống"}</small>`;
    button.title = template ? template.description : "Chưa trang bị";
    if (item) {
      button.addEventListener("click", () => net.emit("inventory:unequip", { slot: slot.key }));
    }
    equipment.appendChild(button);
  }

  const grid = $("inventory-grid");
  grid.replaceChildren();
  for (const item of self.items) {
    const template = content.items[item.templateId];
    if (!template) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "inv-item";
    button.dataset.rarity = template.rarity;
    button.title = template.description;
    const icon = document.createElement("span");
    icon.className = "inv-icon";
    icon.textContent = itemIcon(template.type);
    const name = document.createElement("span");
    name.className = "inv-name";
    name.textContent = template.name;
    button.append(icon, name);
    if (item.quantity > 1) {
      const qty = document.createElement("span");
      qty.className = "inv-qty";
      qty.textContent = `x${item.quantity}`;
      button.appendChild(qty);
    }
    button.addEventListener("click", () => {
      if (template.slot) {
        net.emit("inventory:equip", { itemId: item.id });
      } else if (template.type === "consumable") {
        net.emit("inventory:use", { itemId: item.id });
      } else {
        notify(`${template.name}: ${template.description}`, "info");
      }
    });
    grid.appendChild(button);
  }
}

function itemIcon(type: string): string {
  switch (type) {
    case "weapon":
      return "⚔";
    case "armor":
      return "衣";
    case "accessory":
      return "玉";
    case "consumable":
      return "丹";
    default:
      return "材";
  }
}

function renderQuests() {
  if (!self || !content) return;
  const list = $("quest-list");
  list.replaceChildren();
  for (const quest of Object.values(content.quests)) {
    const progress = self.quests.find((entry) => entry.id === quest.id);
    const card = document.createElement("div");
    card.className = `quest-card${progress?.status === "COMPLETED" ? " completed" : ""}`;
    const title = document.createElement("h4");
    title.textContent = quest.name;
    const description = document.createElement("p");
    description.textContent = quest.description;
    const bar = document.createElement("div");
    bar.className = "quest-progress";
    const fill = document.createElement("div");
    const current = progress?.progress ?? 0;
    fill.style.width = `${Math.min(100, (current / quest.objective.count) * 100)}%`;
    bar.appendChild(fill);
    const footer = document.createElement("div");
    footer.className = "quest-footer";
    const reward = document.createElement("span");
    reward.textContent = `${current}/${quest.objective.count} · ${quest.rewards.xp} XP · ${quest.rewards.gold} vàng`;
    footer.appendChild(reward);

    if (!progress) {
      const button = document.createElement("button");
      button.className = "btn";
      button.textContent = "Nhận";
      button.disabled = self.level < quest.requiredLevel;
      button.title = self.level < quest.requiredLevel ? `Cần cấp ${quest.requiredLevel}` : "";
      button.addEventListener("click", () => net.emit("quest:accept", { questId: quest.id }));
      footer.appendChild(button);
    } else if (progress.status === "ACTIVE" && progress.progress < quest.objective.count) {
      const status = document.createElement("span");
      status.textContent = "Đang làm";
      footer.appendChild(status);
    } else if (progress.status === "ACTIVE") {
      const button = document.createElement("button");
      button.className = "btn btn-primary";
      button.textContent = "Báo công";
      button.addEventListener("click", () => net.emit("quest:complete", { questId: quest.id }));
      footer.appendChild(button);
    } else {
      const status = document.createElement("span");
      status.textContent = "Đã hoàn thành";
      footer.appendChild(status);
    }
    card.append(title, description, bar, footer);
    list.appendChild(card);
  }
}

function renderShop() {
  if (!activeNpc || !content || !self) return;
  $("shop-name").textContent = activeNpc.name;
  $("shop-gold").textContent = `${self.gold.toLocaleString("vi-VN")} vàng`;
  const list = $("shop-list");
  list.replaceChildren();
  for (const entry of activeNpc.stock) {
    const template = content.items[entry.templateId];
    if (!template) continue;
    const row = document.createElement("div");
    row.className = "shop-row";
    const info = document.createElement("div");
    info.className = "shop-info";
    const name = document.createElement("strong");
    name.textContent = template.name;
    const description = document.createElement("span");
    description.className = "muted small";
    description.textContent = template.description;
    info.append(name, description);
    const price = document.createElement("span");
    price.className = "shop-price";
    price.textContent = `${entry.price} vàng`;
    const actions = document.createElement("div");
    actions.className = "shop-actions";
    for (const amount of [1, 5]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn small";
      button.textContent = `Mua ${amount}`;
      button.disabled = self.gold < entry.price * amount;
      button.addEventListener("click", () => {
        if (!activeNpc) return;
        net.emit("shop:buy", { npcId: activeNpc.id, templateId: entry.templateId, quantity: amount });
      });
      actions.appendChild(button);
    }
    row.append(info, price, actions);
    list.appendChild(row);
  }
}

function openShop(npc: NpcInfo) {
  activeNpc = npc;
  openPanel("shop");
}

function openPanel(panel: "inventory" | "quests" | "shop") {
  if (panel === "shop") {
    if (!nearbyNpc) {
      notify("Hãy đến gần thương nhân trong thành.", "info");
      return;
    }
    activeNpc = nearbyNpc;
  }
  $("side-panel").classList.remove("hidden");
  $("inventory-panel").classList.toggle("hidden", panel !== "inventory");
  $("quests-panel").classList.toggle("hidden", panel !== "quests");
  $("shop-panel").classList.toggle("hidden", panel !== "shop");
  $("tab-inventory").classList.toggle("active", panel === "inventory");
  $("tab-quests").classList.toggle("active", panel === "quests");
  $("tab-shop").classList.toggle("active", panel === "shop");
  if (panel === "inventory") renderInventory();
  else if (panel === "quests") renderQuests();
  else renderShop();
}

function updateNpcPrompt() {
  const prompt = $("npc-prompt");
  if (currentScreen !== "game" || !content || !game) {
    nearbyNpc = null;
    promptNpcId = null;
    prompt.classList.add("hidden");
    $("tab-shop").classList.add("hidden");
    return;
  }
  const position = game.getLocalPosition();
  let best: NpcInfo | null = null;
  let bestDist = Infinity;
  if (position) {
    for (const npc of content.world.npcs) {
      const dist = Math.hypot(position.x - npc.x, position.z - npc.z);
      if (dist <= npc.interactRadius && dist < bestDist) {
        best = npc;
        bestDist = dist;
      }
    }
  }
  nearbyNpc = best;
  if (promptNpcId !== (best?.id ?? null)) {
    promptNpcId = best?.id ?? null;
    prompt.classList.toggle("hidden", !best);
    $("tab-shop").classList.toggle("hidden", !best);
    if (best) prompt.textContent = `Mở cửa hàng · ${best.name} (F)`;
  }
  if (activeNpc && (!best || best.id !== activeNpc.id)) {
    activeNpc = null;
    if (!$("shop-panel").classList.contains("hidden")) $("side-panel").classList.add("hidden");
  }
}

function performSkill(slot: "Q" | "W" | "E" | "R") {
  if (!self || !content) return;
  const skill = content.sects[self.sect].skills[slot];
  if (!skill) return;

  target = null;
  updateTargetFrame();
  game?.setTarget(null, null);

  if (self.mp < skill.mpCost) {
    notify("Không đủ nội lực.", "danger");
    return;
  }
  const now = performance.now();
  const readyAt = skillCooldownsAt[slot] ?? 0;
  if (now < readyAt) return;

  if (game && !isMobileDevice()) {
    const groundPoint = game.getGroundPointFromPointer(lastMouseX, lastMouseY);
    const selfPos = game.getLocalPosition();
    if (groundPoint && selfPos) {
      const dx = groundPoint.x - selfPos.x;
      const dz = groundPoint.z - selfPos.z;
      if (Math.hypot(dx, dz) > 0.1) {
        const aimRotation = Math.atan2(dx, dz);
        game.setLocalRotation(aimRotation);
        net.emit("player:move", { x: selfPos.x, z: selfPos.z, rotation: aimRotation });
      }
    }
  }

  skillCooldownsAt[slot] = now + skill.cooldownMs;
  net.emit("combat:skill", { slot, targetId: null, targetType: "monster" });
}

function useHpPotion() {
  if (!self) return;
  const now = performance.now();
  if (now < potionReadyAt) return;
  const potion = self.items.find((item) => item.templateId === "potion_hp");
  if (!potion) {
    notify("Bạn không còn Hồi Huyết Đan.", "danger");
    return;
  }
  potionReadyAt = now + 1200;
  net.emit("inventory:use", { itemId: potion.id });
}

function useMpPotion() {
  if (!self) return;
  const now = performance.now();
  if (now < potionReadyAt) return;
  const potion = self.items.find((item) => item.templateId === "potion_mp");
  if (!potion) {
    notify("Bạn không còn Hồi Khí Đan.", "danger");
    return;
  }
  potionReadyAt = now + 1200;
  net.emit("inventory:use", { itemId: potion.id });
}

function setupGameHud() {
  $("pvp-toggle").addEventListener("click", () => {
    if (self) net.emit("pvp:toggle", { enabled: !self.pvpEnabled });
  });
  $("panel-inventory-btn").addEventListener("click", () => openPanel("inventory"));
  $("panel-quests-btn").addEventListener("click", () => openPanel("quests"));
  $("tab-inventory").addEventListener("click", () => openPanel("inventory"));
  $("tab-quests").addEventListener("click", () => openPanel("quests"));
  $("tab-shop").addEventListener("click", () => openPanel("shop"));
  $("npc-prompt").addEventListener("click", () => {
    if (nearbyNpc) openShop(nearbyNpc);
  });
  $("close-panel").addEventListener("click", () => $("side-panel").classList.add("hidden"));
  $("leave-btn").addEventListener("click", leaveGame);
  $("action-skill-q").addEventListener("click", () => performSkill("Q"));
  $("action-skill-w").addEventListener("click", () => performSkill("W"));
  $("action-skill-e").addEventListener("click", () => performSkill("E"));
  $("action-skill-r").addEventListener("click", () => performSkill("R"));
  $("action-potion-hp").addEventListener("click", useHpPotion);
  $("action-potion-mp").addEventListener("click", useMpPotion);

  $<HTMLFormElement>("chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = $<HTMLInputElement>("chat-input");
    const message = input.value.trim();
    if (!message) return;
    const channel = $<HTMLSelectElement>("chat-channel").value as "global" | "faction";
    net.emit("chat:send", { channel, message });
    input.value = "";
    input.blur();
  });

  window.addEventListener("keydown", (event) => {
    if (currentScreen !== "game") return;
    const active = document.activeElement;
    const typing = active instanceof HTMLInputElement || active instanceof HTMLSelectElement || active instanceof HTMLTextAreaElement;
    if (typing) return;
    if (event.code === "Tab") {
      event.preventDefault();
      const next = game?.cycleTarget() ?? null;
      target = next;
      updateTargetFrame();
      return;
    }
    if (event.code === "Enter") {
      event.preventDefault();
      $<HTMLInputElement>("chat-input").focus();
      return;
    }
    keys.add(event.code);
    if (event.code === "KeyQ") performSkill("Q");
    if (event.code === "KeyW") performSkill("W");
    if (event.code === "KeyE") performSkill("E");
    if (event.code === "KeyR") performSkill("R");
    if (event.code === "Digit1" || event.code === "KeyA") useHpPotion();
    if (event.code === "Digit2" || event.code === "KeyS") useMpPotion();
    if (event.code === "KeyF" && nearbyNpc) {
      event.preventDefault();
      openShop(nearbyNpc);
      return;
    }
    if (event.code === "KeyI") {
      const visible = !$("side-panel").classList.contains("hidden");
      if (visible && !$("inventory-panel").classList.contains("hidden")) $("side-panel").classList.add("hidden");
      else openPanel("inventory");
    }
    if (event.code === "KeyJ") {
      const visible = !$("side-panel").classList.contains("hidden");
      if (visible && !$("quests-panel").classList.contains("hidden")) $("side-panel").classList.add("hidden");
      else openPanel("quests");
    }
  });
  window.addEventListener("keyup", (event) => {
    keys.delete(event.code);
  });
  window.addEventListener("blur", () => keys.clear());

  // Prevent context menu on touch long-presses over game controls and canvas
  document.addEventListener("contextmenu", (event) => {
    const targetNode = event.target as HTMLElement | null;
    if (targetNode && (targetNode.tagName === "CANVAS" || targetNode.closest("#game-screen"))) {
      event.preventDefault();
    }
  });
}

function movementLoop() {
  requestAnimationFrame(movementLoop);
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrameAt) / 1000);
  lastFrameAt = now;
  updateCooldowns(now);
  updateNpcPrompt();
  if (currentScreen !== "game" || !game || !self || self.dead || !net.connected) {
    clickTargetPosition = null;
    return;
  }

  if (!clickTargetPosition) return;

  const position = game.getLocalPosition();
  if (!position) return;

  const dist = Math.hypot(clickTargetPosition.x - position.x, clickTargetPosition.z - position.z);
  if (dist < 0.25) {
    clickTargetPosition = null;
    return;
  }

  const dx = (clickTargetPosition.x - position.x) / dist;
  const dz = (clickTargetPosition.z - position.z) / dist;

  const step = Math.min(dist, self.stats.moveSpeed * dt);
  const radius = content?.world.radius ?? 110;
  const nextX = Math.max(-radius, Math.min(radius, position.x + dx * step));
  const nextZ = Math.max(-radius, Math.min(radius, position.z + dz * step));

  if (content && crossesCityWall(content.world, position.x, position.z, nextX, nextZ)) {
    clickTargetPosition = null;
    return;
  }

  game.setLocalTarget(nextX, nextZ);
  if (now - lastMoveSentAt > 90) {
    lastMoveSentAt = now;
    net.emit("player:move", { x: nextX, z: nextZ, rotation: Math.atan2(dx, dz) });
  }
}

function updateCooldowns(now: number) {
  if (!self || !content) return;
  const sectSkills = content.sects[self.sect].skills;
  const slots: ("Q" | "W" | "E" | "R")[] = ["Q", "W", "E", "R"];
  for (const slot of slots) {
    const sk = sectSkills[slot];
    if (!sk) continue;
    const readyAt = skillCooldownsAt[slot] ?? 0;
    const remaining = Math.max(0, readyAt - now);
    const cdElement = $(`cd-skill-${slot.toLowerCase()}`);
    if (cdElement) {
      cdElement.style.transform = `scaleY(${Math.min(1, remaining / sk.cooldownMs)})`;
      cdElement.parentElement?.classList.toggle("disabled", remaining > 0);
    }
  }
}

async function init() {
  setupAuthTabs();
  setupAuthForms();
  setupCharacterCreation();
  setupGameHud();
  bindGameEvents();
  movementLoop();

  window.addEventListener("resize", checkOrientation);
  window.addEventListener("orientationchange", checkOrientation);
  window.addEventListener("click", requestLandscapeLock, { once: false });
  window.addEventListener("touchstart", requestLandscapeLock, { once: false, passive: true });
  checkOrientation();

  try {
    content = await (await fetch("/api/content")).json() as Content;
  } catch {
    showAuthError("Không thể tải dữ liệu game. Kiểm tra server.");
    return;
  }
  renderCreateOptions();

  if (token) {
    await openCharacterScreen();
  } else {
    showScreen("auth");
  }
}

void init();
