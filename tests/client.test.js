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

jest.mock("../src/userConfig.js", () => ({
  loadUserConfig: jest.fn(() => ({})),
  saveUserConfig: jest.fn(),
  getUserConfigPath: jest.fn(
    () => "/mock/config/janken-cli/config.json",
  ),
}));

jest.mock("commander", () => {
  let _savedCallback = null;
  let _setActionCallback = null;
  const mockSubCommand = {
    description: jest.fn().mockReturnThis(),
    action: jest.fn((cb) => {
      _setActionCallback = cb;
      return mockSubCommand;
    }),
  };
  const mockProgram = {
    name: jest.fn().mockReturnThis(),
    description: jest.fn().mockReturnThis(),
    option: jest.fn().mockReturnThis(),
    command: jest.fn(() => mockSubCommand),
    action: jest.fn((cb) => {
      _savedCallback = cb;
      return mockProgram;
    }),
    parse: jest.fn().mockReturnThis(),
  };
  return {
    Command: jest.fn(() => mockProgram),
    getActionCallback: () => _savedCallback,
    getSetActionCallback: () => _setActionCallback,
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
const userConfig = require("../src/userConfig.js");

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

  test('shows draw and re-prompts on "draw" message', async () => {
    consola.prompt.mockResolvedValue("paper");
    await getHandler("message")(
      Buffer.from(
        JSON.stringify({
          type: "draw",
          myHand: "rock",
          opponentHand: "rock",
        }),
      ),
    );
    await Promise.resolve();
    expect(consola.info).toHaveBeenCalledWith("Draw");
    expect(wsInstance.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "choice", hand: "paper" }),
    );
    expect(wsInstance.close).not.toHaveBeenCalled();
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

// --- set command ---

describe("set command", () => {
  let setActionCallback;

  beforeAll(() => {
    setActionCallback = jest
      .requireMock("commander")
      .getSetActionCallback();
  });

  beforeEach(() => jest.clearAllMocks());

  test("saves host via set command", () => {
    setActionCallback("host", "wss://example.com");
    expect(userConfig.saveUserConfig).toHaveBeenCalledWith({
      host: "wss://example.com",
    });
    expect(consola.success).toHaveBeenCalled();
  });

  test("saves name via set command", () => {
    setActionCallback("name", "Alice");
    expect(userConfig.saveUserConfig).toHaveBeenCalledWith({
      name: "Alice",
    });
    expect(consola.success).toHaveBeenCalled();
  });

  test("rejects unknown keys", () => {
    const exit = jest
      .spyOn(process, "exit")
      .mockImplementation(() => {
        throw new Error("process.exit");
      });
    expect(() =>
      setActionCallback("unknown", "value"),
    ).toThrow("process.exit");
    expect(consola.error).toHaveBeenCalled();
    expect(
      userConfig.saveUserConfig,
    ).not.toHaveBeenCalled();
    exit.mockRestore();
  });
});

// --- config loading mode ---

describe("config loading mode", () => {
  let actionCallback;

  beforeAll(() => {
    actionCallback = jest
      .requireMock("commander")
      .getActionCallback();
  });

  beforeEach(() => jest.clearAllMocks());

  test("uses userConfig when JANKEN_INSTALLED is set", async () => {
    process.env.JANKEN_INSTALLED = "1";
    userConfig.loadUserConfig.mockReturnValue({
      host: "wss://user-config.example.com",
      name: "UserConfigName",
    });
    consola.prompt = jest.fn().mockResolvedValue("rock");
    await actionCallback({ test: false });
    const ws = jest
      .requireMock("ws")
      .default.getLastInstance();
    ws.on.mock.calls.find(([e]) => e === "open")?.[1]();
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "join",
        name: "UserConfigName",
      }),
    );
    expect(
      jest.requireMock("ws").default,
    ).toHaveBeenCalledWith("wss://user-config.example.com");
    delete process.env.JANKEN_INSTALLED;
  });

  test("uses local config.json when JANKEN_INSTALLED is not set", async () => {
    delete process.env.JANKEN_INSTALLED;
    const { existsSync, readFileSync } = require("fs");
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue(
      JSON.stringify({
        host: "ws://local-config:3000",
        name: "LocalUser",
      }),
    );
    consola.prompt = jest.fn().mockResolvedValue("rock");
    await actionCallback({ test: false });
    const ws = jest
      .requireMock("ws")
      .default.getLastInstance();
    ws.on.mock.calls.find(([e]) => e === "open")?.[1]();
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "join", name: "LocalUser" }),
    );
    expect(
      userConfig.loadUserConfig,
    ).not.toHaveBeenCalled();
    existsSync.mockReturnValue(false);
  });
});
