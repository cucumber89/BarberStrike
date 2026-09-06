import { describe, expect, it } from "vitest";
import { hostBanner, lanAddresses } from "./hosting";

/**
 * Player-hosted games (2.0). What is testable here is the thing the host READS OUT to the room —
 * a banner that names an address nobody can reach is worse than no banner at all.
 */
describe("host banner", () => {
  it("says what to do when the client has not been built, instead of an address with nothing behind it", () => {
    const lines = hostBanner(2567, false).join("\n");
    expect(lines).toMatch(/not built/i);
    expect(lines).toMatch(/pnpm host/);
    expect(lines, "no address may be offered when there is no page to serve").not.toMatch(/http:\/\//);
  });

  it("offers localhost and every LAN address, on the port it is actually listening on", () => {
    const lines = hostBanner(4321, true);
    const text = lines.join("\n");
    expect(text).toContain("http://localhost:4321");
    for (const a of lanAddresses()) expect(text).toContain(`http://${a}:4321`);
    // The room name is how two people end up in the same match; leaving it out is the first
    // question the host gets asked.
    expect(text).toMatch(/room name/i);
  });

  it("never offers a link-local address", () => {
    // 169.254.x.x is what a machine gives itself when DHCP failed: telling friends to open it
    // sends them somewhere that cannot work.
    for (const a of lanAddresses()) expect(a.startsWith("169.254."), a).toBe(false);
  });
});
