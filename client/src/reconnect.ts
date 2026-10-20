export interface ReconnectOptions {
  getToken: () => string | null;
  getCharacterId: () => string | null;
  connect: (token: string) => Promise<void>;
  disconnect: () => void;
  enterWorld: (characterId: string) => void;
  onBanner: (message: string | null) => void;
  onSystemChat: (message: string) => void;
  onRestored: () => void;
  onGiveUp: (message: string, sessionExpired: boolean) => void;
}

const MAX_ATTEMPTS = 8;
const INIT_TIMEOUT_MS = 8000;

export class ReconnectController {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private initTimer: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;
  private running = false;
  private restoredAt = 0;

  constructor(private readonly options: ReconnectOptions) {}

  start() {
    if (this.running) return;
    if (!this.options.getToken() || !this.options.getCharacterId()) return;
    this.running = true;
    this.attempts = 0;
    this.options.onBanner("Đang kết nối lại...");
    this.options.onSystemChat("Mất kết nối tới server. Đang thử kết nối lại...");
    void this.attempt();
  }

  stop() {
    this.running = false;
    this.restoredAt = 0;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.clearInitTimer();
    this.retryTimer = null;
    this.options.onBanner(null);
  }

  notifyWorldInit() {
    if (this.running) this.restoredAt = performance.now();
  }

  private async attempt() {
    this.retryTimer = null;
    if (!this.running) return;
    const token = this.options.getToken();
    const characterId = this.options.getCharacterId();
    if (!token || !characterId) {
      this.stop();
      return;
    }

    this.attempts += 1;
    if (this.attempts > MAX_ATTEMPTS) {
      this.fail("Không thể kết nối lại. Vui lòng đăng nhập lại.", false);
      return;
    }
    this.options.onBanner(`Đang kết nối lại... (${this.attempts}/${MAX_ATTEMPTS})`);

    try {
      await this.options.connect(token);
    } catch (error) {
      if (!this.running) return;
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Phiên đăng nhập")) {
        this.fail("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.", true);
        return;
      }
      this.scheduleRetry();
      return;
    }

    if (!this.running) {
      this.options.disconnect();
      return;
    }
    this.restoredAt = 0;
    this.options.enterWorld(characterId);
    const attemptStarted = performance.now();
    this.initTimer = setInterval(() => {
      if (!this.running) {
        this.clearInitTimer();
        return;
      }
      if (this.restoredAt > 0) {
        this.clearInitTimer();
        this.succeed();
        return;
      }
      if (performance.now() - attemptStarted > INIT_TIMEOUT_MS) {
        this.clearInitTimer();
        this.options.disconnect();
        this.scheduleRetry();
      }
    }, 150);
  }

  private scheduleRetry() {
    if (!this.running) return;
    const delay = Math.min(5000, 750 * 2 ** Math.max(0, this.attempts - 1));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.attempt();
    }, delay);
  }

  private succeed() {
    this.stop();
    this.options.onRestored();
  }

  private fail(message: string, sessionExpired: boolean) {
    this.stop();
    this.options.onGiveUp(message, sessionExpired);
  }

  private clearInitTimer() {
    if (this.initTimer) clearInterval(this.initTimer);
    this.initTimer = null;
  }
}
