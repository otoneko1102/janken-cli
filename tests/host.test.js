// --- mocks ---

jest.mock("commander", () => {
  let _savedCallback = null;
  const mockProgram = {
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    action: jest.fn((cb) => {
      _savedCallback = cb;
      return mockProgram;
    }),
    parse: jest.fn().mockReturnThis(),
  };
  return {
    Command: jest.fn(() => mockProgram),
    getActionCallback: () => _savedCallback,
  };
});

jest.mock("@hono/node-server", () => ({
  serve: jest.fn((options, callback) => {
    if (callback) callback({ port: 3000 });
    return {};
  }),
}));

jest.mock("hono", () => ({
  Hono: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    fetch: jest.fn(),
  })),
}));

jest.mock("ws", () => ({
  __esModule: true,
  WebSocketServer: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
  })),
}));

jest.mock("fs", () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(() => false),
}));

jest.mock("consola", () => ({
  consola: {
    start: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    log: jest.fn(),
    success: jest.fn(),
  },
}));

// --- load module under test ---

const { judge, startMatch } = require("../src/host.js");

// --- helpers ---

function createMockWs(name) {
  const handlers = {};
  return {
    playerName: name,
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn((event, handler) => {
      handlers[event] = handler;
    }),
    // Emit an event with a plain object (auto-serialised to JSON string)
    emit: (event, data) =>
      handlers[event]?.(
        typeof data === "string"
          ? data
          : JSON.stringify(data),
      ),
  };
}

// --- judge() ---

describe("judge()", () => {
  test.each([
    ["rock", "rock", "draw"],
    ["scissors", "scissors", "draw"],
    ["paper", "paper", "draw"],
    ["rock", "scissors", "win"],
    ["scissors", "paper", "win"],
    ["paper", "rock", "win"],
    ["rock", "paper", "lose"],
    ["scissors", "rock", "lose"],
    ["paper", "scissors", "lose"],
  ])("judge(%s, %s) → %s", (a, b, expected) => {
    expect(judge(a, b)).toBe(expected);
  });
});

// --- startMatch() ---

describe("startMatch()", () => {
  test("sends start message with opponent name to both players", () => {
    const p1 = createMockWs("Player1");
    const p2 = createMockWs("Player2");
    startMatch(p1, p2);

    expect(p1.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "start",
        opponent: "Player2",
      }),
    );
    expect(p2.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "start",
        opponent: "Player1",
      }),
    );
  });

  test("does not send result until both players have chosen", () => {
    const p1 = createMockWs("Player1");
    const p2 = createMockWs("Player2");
    startMatch(p1, p2);

    p1.send.mockClear();
    p2.send.mockClear();

    p1.emit("message", { type: "choice", hand: "rock" });

    expect(p1.send).not.toHaveBeenCalled();
    expect(p2.send).not.toHaveBeenCalled();
  });

  test("sends correct result to both players when both have chosen", () => {
    const p1 = createMockWs("Player1");
    const p2 = createMockWs("Player2");
    startMatch(p1, p2);

    p1.emit("message", { type: "choice", hand: "rock" });
    p2.emit("message", {
      type: "choice",
      hand: "scissors",
    });

    const p1Msgs = p1.send.mock.calls.map(([m]) =>
      JSON.parse(m),
    );
    const p2Msgs = p2.send.mock.calls.map(([m]) =>
      JSON.parse(m),
    );
    const p1Result = p1Msgs.find(
      (m) => m.type === "result",
    );
    const p2Result = p2Msgs.find(
      (m) => m.type === "result",
    );

    expect(p1Result).toEqual({
      type: "result",
      result: "win",
      myHand: "rock",
      opponentHand: "scissors",
    });
    expect(p2Result).toEqual({
      type: "result",
      result: "lose",
      myHand: "scissors",
      opponentHand: "rock",
    });
  });

  test("both players get draw when choosing the same hand", () => {
    const p1 = createMockWs("Player1");
    const p2 = createMockWs("Player2");
    startMatch(p1, p2);

    p1.emit("message", { type: "choice", hand: "paper" });
    p2.emit("message", { type: "choice", hand: "paper" });

    const p1Result = p1.send.mock.calls
      .map(([m]) => JSON.parse(m))
      .find((m) => m.type === "result");
    const p2Result = p2.send.mock.calls
      .map(([m]) => JSON.parse(m))
      .find((m) => m.type === "result");

    expect(p1Result.result).toBe("draw");
    expect(p2Result.result).toBe("draw");
  });

  test("ignores duplicate choice from the same player", () => {
    const p1 = createMockWs("Player1");
    const p2 = createMockWs("Player2");
    startMatch(p1, p2);

    // p1 sends choice twice – only the first should count
    p1.emit("message", { type: "choice", hand: "rock" });
    p1.emit("message", { type: "choice", hand: "paper" });
    p2.emit("message", {
      type: "choice",
      hand: "scissors",
    });

    const p1Result = p1.send.mock.calls
      .map(([m]) => JSON.parse(m))
      .find((m) => m.type === "result");

    // rock beats scissors → win; if paper were used it would lose
    expect(p1Result.result).toBe("win");
    expect(p1Result.myHand).toBe("rock");
  });
});

// --- server startup options ---

describe("server startup options", () => {
  let actionCallback;

  beforeAll(() => {
    actionCallback = jest
      .requireMock("commander")
      .getActionCallback();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const { existsSync } = require("fs");
    existsSync.mockReturnValue(false);
  });

  test("uses default port 3000 when --port and config are absent", () => {
    const { serve } = require("@hono/node-server");
    actionCallback({});
    expect(serve).toHaveBeenCalledWith(
      expect.objectContaining({ port: 3000 }),
      expect.any(Function),
    );
  });

  test("uses config.port when --port is absent", () => {
    const { serve } = require("@hono/node-server");
    const { existsSync, readFileSync } = require("fs");
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ port: 4000 }),
    );
    actionCallback({});
    expect(serve).toHaveBeenCalledWith(
      expect.objectContaining({ port: 4000 }),
      expect.any(Function),
    );
  });

  test("--port overrides config.port", () => {
    const { serve } = require("@hono/node-server");
    const { existsSync, readFileSync } = require("fs");
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ port: 4000 }),
    );
    actionCallback({ port: 5000 });
    expect(serve).toHaveBeenCalledWith(
      expect.objectContaining({ port: 5000 }),
      expect.any(Function),
    );
  });

  test("uses custom config path when --config is specified", () => {
    const { existsSync, readFileSync } = require("fs");
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ port: 3000 }),
    );
    actionCallback({ config: "custom-server.json" });
    expect(readFileSync).toHaveBeenCalledWith(
      expect.stringContaining("custom-server.json"),
      "utf-8",
    );
  });
});
