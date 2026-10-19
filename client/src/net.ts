import { io, type Socket } from "socket.io-client";

export type NetHandler = (...args: any[]) => void;

export class Net {
  private socket: Socket | null = null;
  private readonly buffer = new Map<string, NetHandler[]>();
  private readonly onceBuffer = new Map<string, NetHandler[]>();

  connect(token: string): Promise<void> {
    this.disconnect();
    return new Promise((resolve, reject) => {
      const socket = io({
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: false,
      });
      this.socket = socket;
      const fail = (message: string) => {
        clearTimeout(timeout);
        socket.removeAllListeners();
        socket.disconnect();
        if (this.socket === socket) this.socket = null;
        reject(new Error(message));
      };
      const timeout = setTimeout(() => fail("Không thể kết nối tới server."), 8000);

      socket.on("connect", () => {
        clearTimeout(timeout);
        this.flush();
        resolve();
      });
      socket.on("connect_error", (error) => {
        fail(error.message === "Unauthorized" ? "Phiên đăng nhập không hợp lệ." : "Mất kết nối server.");
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  get connected(): boolean {
    return Boolean(this.socket?.connected);
  }

  get id(): string | null {
    return this.socket?.id ?? null;
  }

  on(event: string, handler: NetHandler) {
    const handlers = this.buffer.get(event) ?? [];
    handlers.push(handler);
    this.buffer.set(event, handlers);
    if (this.socket?.connected) this.socket.on(event, handler);
  }

  once(event: string, handler: NetHandler) {
    if (this.socket?.connected) {
      this.socket.once(event, handler);
      return;
    }
    const handlers = this.onceBuffer.get(event) ?? [];
    handlers.push(handler);
    this.onceBuffer.set(event, handlers);
  }

  emit(event: string, payload?: unknown) {
    this.socket?.emit(event, payload);
  }

  private flush() {
    if (!this.socket) return;
    for (const [event, handlers] of this.buffer) {
      for (const handler of handlers) this.socket.on(event, handler);
    }
    for (const [event, handlers] of this.onceBuffer) {
      for (const handler of handlers) this.socket.once(event, handler);
    }
    this.onceBuffer.clear();
  }
}
