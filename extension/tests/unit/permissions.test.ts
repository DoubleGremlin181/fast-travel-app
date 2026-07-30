import { describe, it, expect } from "vitest";
import {
  hasHistoryPermission,
  requestHistoryPermission,
} from "../../src/core/permissions.js";

function install(perms: {
  contains?: (q: unknown) => Promise<boolean>;
  request?: (q: unknown) => Promise<boolean>;
}) {
  (globalThis as any).chrome = { permissions: perms };
}

describe("permissions seam", () => {
  it("hasHistoryPermission reflects permissions.contains", async () => {
    install({ contains: async () => true });
    expect(await hasHistoryPermission()).toBe(true);
    install({ contains: async () => false });
    expect(await hasHistoryPermission()).toBe(false);
  });

  it("hasHistoryPermission queries the history permission", async () => {
    let query: unknown;
    install({
      contains: async (q) => {
        query = q;
        return true;
      },
    });
    await hasHistoryPermission();
    expect(query).toEqual({ permissions: ["history"] });
  });

  it("requestHistoryPermission returns the grant result", async () => {
    install({ request: async () => true });
    expect(await requestHistoryPermission()).toBe(true);
    install({ request: async () => false });
    expect(await requestHistoryPermission()).toBe(false);
  });

  it("requestHistoryPermission returns false when the API throws", async () => {
    install({
      request: async () => {
        throw new Error("must be called from a user gesture");
      },
    });
    expect(await requestHistoryPermission()).toBe(false);
  });

  it("hasHistoryPermission returns false when the API throws", async () => {
    install({
      contains: async () => {
        throw new Error("nope");
      },
    });
    expect(await hasHistoryPermission()).toBe(false);
  });
});
