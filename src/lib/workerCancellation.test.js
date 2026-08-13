import { describe, expect, it } from "vitest";

// The cancel-bookkeeping invariant both workers share.
//
// Neither worker can be imported here: each is a module-scoped `self.onmessage`
// that touches OffscreenCanvas or pdf-lib on evaluation. What IS testable is the
// rule the two implement, and the rule is where the bug was — the image worker
// recorded every cancel unconditionally while its cleanup only cleared ids that
// ran, so a cancel arriving after its request settled stayed in the set forever
// and could discard a later request that reused the id.
//
// This transcribes the guarded shape and pins the two properties that matter. It
// is a contract test, not a copy of the implementation: if a worker's dispatcher
// stops matching this shape, that is the signal to look, because the failure it
// prevents is silent — a batch that completes and posts nothing.

/** The dispatcher shape both workers use, reduced to its bookkeeping. */
function createDispatcher() {
  const inFlight = new Set();
  const cancelled = new Set();
  const completed = [];

  return {
    inFlight,
    cancelled,
    completed,

    cancel(id) {
      // The guard. Without the inFlight check this is an unconditional add.
      if (inFlight.has(id)) cancelled.add(id);
    },

    async run(id) {
      inFlight.add(id);
      try {
        // Yields, so a cancel can interleave exactly as it does in the worker.
        await Promise.resolve();
        if (cancelled.has(id)) return;
        completed.push(id);
      } finally {
        inFlight.delete(id);
        cancelled.delete(id);
      }
    },
  };
}

describe("worker cancellation bookkeeping", () => {
  it("cancels a request that is genuinely in flight", () => {
    const worker = createDispatcher();
    const running = worker.run("req-0");

    worker.cancel("req-0");
    expect(worker.cancelled.has("req-0")).toBe(true);

    return running.then(() => {
      expect(worker.completed).toEqual([]);
    });
  });

  it("leaves no residue after a cancelled request settles", () => {
    const worker = createDispatcher();
    const running = worker.run("req-0");
    worker.cancel("req-0");

    return running.then(() => {
      expect(worker.cancelled.size).toBe(0);
      expect(worker.inFlight.size).toBe(0);
    });
  });

  it("ignores a cancel for an id that already settled", async () => {
    // The leak, stated directly. An unguarded `cancelled.add` leaves "req-0" in
    // the set with nothing left to clear it.
    const worker = createDispatcher();
    await worker.run("req-0");

    worker.cancel("req-0");

    expect(worker.cancelled.has("req-0")).toBe(false);
    expect(worker.cancelled.size).toBe(0);
  });

  it("does not let a stale cancel discard a later request that reuses the id", async () => {
    // The consequence, and the reason this is worth a test rather than a
    // comment: the reused request completes normally and posts nothing back,
    // with no error anywhere to explain it.
    const worker = createDispatcher();

    await worker.run("req-0");
    worker.cancel("req-0"); // Late — lost the race with completion.

    await worker.run("req-0"); // A fresh worker's first request.

    expect(worker.completed).toEqual(["req-0", "req-0"]);
  });

  it("ignores a cancel for an id that never existed", async () => {
    const worker = createDispatcher();
    worker.cancel("req-99");

    expect(worker.cancelled.size).toBe(0);

    await worker.run("req-99");
    expect(worker.completed).toEqual(["req-99"]);
  });

  it("cancels only the named request when several are in flight", async () => {
    const worker = createDispatcher();
    const a = worker.run("req-0");
    const b = worker.run("req-1");

    worker.cancel("req-1");
    await Promise.all([a, b]);

    expect(worker.completed).toEqual(["req-0"]);
    expect(worker.cancelled.size).toBe(0);
    expect(worker.inFlight.size).toBe(0);
  });
});
