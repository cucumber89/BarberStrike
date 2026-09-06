import { describe, expect, it } from "vitest";
import { resolveServerUrl } from "./serverUrl";
const at = (protocol: string, hostname: string, port = "") => ({ protocol, hostname, host: port ? `${hostname}:${port}` : hostname });
describe("resolveServerUrl", () => {
  it("uses the same origin for a hosted one-process deployment on the standard port", () => {
    // The Render bug: https://barberstrike.onrender.com must NOT become wss://...:2567.
    expect(resolveServerUrl(at("https:", "barberstrike.onrender.com"), undefined, false)).toBe("wss://barberstrike.onrender.com");
    expect(resolveServerUrl(at("http:", "192.168.1.20", "2567"), undefined, false)).toBe("ws://192.168.1.20:2567");
    expect(resolveServerUrl(at("https:", "mild-fox-1234.trycloudflare.com"), "", false)).toBe("wss://mild-fox-1234.trycloudflare.com");
  });
  it("talks to :2567 beside the Vite dev server, and lets VITE_SERVER_URL override everything", () => {
    expect(resolveServerUrl(at("http:", "localhost", "5174"), undefined, true)).toBe("ws://localhost:2567");
    expect(resolveServerUrl(at("https:", "game.example.com"), " wss://api.example.com ", false)).toBe("wss://api.example.com");
  });
});
