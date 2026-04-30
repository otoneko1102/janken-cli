// --- mocks (hoisted by babel-jest before any import/require) ---

jest.mock("ws", () => {
  let _lastInstance = null;
  const WsMock = jest.fn().mockImplementation(() => {
    _lastInstance = {
      on: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
    };
    return _lastInstance;
  });
  WsMock.getLastInstance = () => _lastInstance;
  return { __esModule: true, default: WsMock };
});

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

jest.mock("consola", () => ({
  consola: {
    log: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    fail: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    prompt: jest.fn(),
  },
}));

jest.mock("fs", () => ({
  readFileSync: jest.fn(),
  existsSync: jest.fn(() => false),
}));

// --- load module under test after mocks are set up ---

const { judge, showResult } = require("../src/client.js");
const { consola } = require("consola");
const WebSocket = require("ws").default;
const { Command } = require("commander");

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

// --- showResult() ---

describe("showResult()", () => {
  beforeEach(() => jest.clearAllMocks());

  test("draw → consola.info", () => {
    showResult("rock", "rock");
    expect(consola.info).toHaveBeenCalledWith("Draw");
  });

  test("win → consola.success", () => {
    showResult("rock", "scissors");
    expect(consola.success).toHaveBeenCalledWith(
      "You win!",
    );
  });

  test("lose → consola.fail", () => {
    showResult("rock", "paper");
    expect(consola.fail).toHaveBeenCalledWith(
      "You lose...",
    );
  });

  test("logs both hands", () => {
    showResult("paper", "rock");
    expect(consola.log).toHaveBeenCalledWith(
      "\nYou: paper  /  Opponent: rock",
    );
  });
});

// --- WebSocket client behaviour ---

describe("WebSocket client behaviour", () => {
  let actionCallback;
  let wsInstance;

  // Retrieve the action callback registered during module load
  beforeAll(() => {
    actionCallback = jest
      .requireMock("commander")
      .getActionCallback();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    consola.prompt.mockResolvedValue("rock");
    // Invoke the CLI action (non-test mode) to create the WebSocket
    await actionCallback({ test: false });
    wsInstance = jest
      .requireMock("ws")
      .default.getLastInstance();
  });

  function getHandler(event) {
    const call = wsInstance.on.mock.calls.find(
      ([e]) => e === event,
    );
    return call?.[1];
  }

  test("uses Anonymous when --name and config.name are absent", () => {
    getHandler("open")();
    expect(wsInstance.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "join", name: "Anonymous" }),
    );
  });

  test('logs waiting on "waiting" message', () => {
    getHandler("message")(
      Buffer.from(JSON.stringify({ type: "waiting" })),
    );
    expect(consola.info).toHaveBeenCalledWith(
      "Waiting for opponent...",
    );
  });

  test('prompts for hand and sends choice on "start" message', async () => {
    consola.prompt.mockResolvedValue("scissors");
    await getHandler("message")(
      Buffer.from(
        JSON.stringify({
          type: "start",
          opponent: "Player2",
        }),
      ),
    );
    // wait for the promptHand().then(...) microtask
    await Promise.resolve();
    expect(wsInstance.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "choice", hand: "scissors" }),
    );
  });

  test("uses name from config when --name is absent", async () => {
    const { existsSync, readFileSync } = require("fs");
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({
        host: "ws://localhost:3000",
        name: "ConfigUser",
      }),
    );
    jest.clearAllMocks();
    consola.prompt.mockResolvedValue("rock");
    await actionCallback({ test: false });
    const ws2 = jest
      .requireMock("ws")
      .default.getLastInstance();
    const openHandler = ws2.on.mock.calls.find(
      ([e]) => e === "open",
    )?.[1];
    openHandler();
    expect(ws2.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "join", name: "ConfigUser" }),
    );
    existsSync.mockReturnValue(false);
  });

  test("--name overrides config name", async () => {
    const { existsSync, readFileSync } = require("fs");
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({
        host: "ws://localhost:3000",
        name: "ConfigUser",
      }),
    );
    jest.clearAllMocks();
    consola.prompt.mockResolvedValue("rock");
    await actionCallback({
      test: false,
      name: "CLI_Alice",
    });
    const ws2 = jest
      .requireMock("ws")
      .default.getLastInstance();
    const openHandler = ws2.on.mock.calls.find(
      ([e]) => e === "open",
    )?.[1];
    openHandler();
    expect(ws2.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "join", name: "CLI_Alice" }),
    );
    existsSync.mockReturnValue(false);
  });

  test("sends specified name in join message", async () => {
    jest.clearAllMocks();
    consola.prompt.mockResolvedValue("rock");
    await actionCallback({ test: false, name: "Alice" });
    const ws2 = jest
      .requireMock("ws")
      .default.getLastInstance();
    const openHandler = ws2.on.mock.calls.find(
      ([e]) => e === "open",
    )?.[1];
    openHandler();
    expect(ws2.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "join", name: "Alice" }),
    );
  });

  test("uses custom config path when --config is specified", async () => {
    const { existsSync, readFileSync } = require("fs");
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ host: "ws://example.com:4000" }),
    );
    jest.clearAllMocks();
    consola.prompt.mockResolvedValue("rock");
    await actionCallback({
      test: false,
      name: "Anonymous",
      config: "custom.config.json",
    });
    expect(readFileSync).toHaveBeenCalledWith(
      expect.stringContaining("custom.config.json"),
      "utf-8",
    );
    existsSync.mockReturnValue(false);
  });

  test("uses default host when --host and config.host are absent", async () => {
    const WsMock = jest.requireMock("ws").default;
    jest.clearAllMocks();
    consola.prompt.mockResolvedValue("rock");
    await actionCallback({ test: false });
    expect(WsMock).toHaveBeenCalledWith(
      "ws://localhost:3000",
    );
  });

  test("uses config.host when --host is absent", async () => {
    const { existsSync, readFileSync } = require("fs");
    const WsMock = jest.requireMock("ws").default;
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ host: "ws://config-host:4000" }),
    );
    jest.clearAllMocks();
    consola.prompt.mockResolvedValue("rock");
    await actionCallback({ test: false });
    expect(WsMock).toHaveBeenCalledWith(
      "ws://config-host:4000",
    );
    existsSync.mockReturnValue(false);
  });

  test("--host overrides config.host", async () => {
    const { existsSync, readFileSync } = require("fs");
    const WsMock = jest.requireMock("ws").default;
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({ host: "ws://config-host:4000" }),
    );
    jest.clearAllMocks();
    consola.prompt.mockResolvedValue("rock");
    await actionCallback({
      test: false,
      host: "ws://cli-host:9000",
    });
    expect(WsMock).toHaveBeenCalledWith(
      "ws://cli-host:9000",
    );
    existsSync.mockReturnValue(false);
  });

  test('shows result and closes ws on "result" message', () => {
    getHandler("message")(
      Buffer.from(
        JSON.stringify({
          type: "result",
          myHand: "rock",
          opponentHand: "scissors",
        }),
      ),
    );
    expect(consola.success).toHaveBeenCalledWith(
      "You win!",
    );
    expect(wsInstance.close).toHaveBeenCalled();
  });
});
