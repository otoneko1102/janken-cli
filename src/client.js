import { Command } from "commander";
import WebSocket from "ws";
import {
  readFileSync,
  existsSync,
} from "fs";
import { resolve } from "path";
import { consola } from "consola";

const program = new Command();

const HANDS = ["rock", "scissors", "paper"];

function judge(a, b) {
  if (a === b) return "draw";
  return (HANDS.indexOf(a) - HANDS.indexOf(b) + 3) % 3 === 2 ? "win" : "lose";
}

function showResult(myHand, opponentHand) {
  const result = judge(myHand, opponentHand);
  consola.log(`\nYou: ${myHand}  /  Opponent: ${opponentHand}`);
  if (result === "draw") consola.info("Draw");
  else if (result === "win") consola.success("You win!");
  else consola.fail("You lose...");
}

program
  .name("Janken")
  .description("Janken for CLI")
  .option("--test", "test mode (no server needed)")
  .action(async (options) => {
    if (options.test) {
      const hand = await promptHand();
      const cpuHand = HANDS[Math.floor(Math.random() * HANDS.length)];
      showResult(hand, cpuHand);
      return;
    }

    const configPath = resolve(
      process.cwd(),
      "config.json",
    );
    let config = {
      host: "ws://localhost:3000",
    };
    if (existsSync(configPath)) {
      try {
        config = JSON.parse(
          readFileSync(
            configPath,
            "utf-8",
          ),
        );
      } catch {
        consola.warn(
          "Failed to load config. Using default settings.",
        );
      }
    }

    const ws = new WebSocket(
      config.host,
    );

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "join",
        }),
      );
    });

    ws.on("message", (raw) => {
      const msg = JSON.parse(
        raw.toString(),
      );

      if (msg.type === "waiting") {
        consola.info(
          "Waiting for opponent...",
        );
      }

      if (msg.type === "start") {
        consola.info(`Opponent: ${msg.opponent}`);
        promptHand().then((hand) => {
          ws.send(
            JSON.stringify({
              type: "choice",
              hand,
            }),
          );
        });
      }

      if (msg.type === "result") {
        showResult(msg.myHand, msg.opponentHand);
        ws.close();
      }
    });

    ws.on("error", (err) => {
      consola.error(
        "Connection error:",
        err.message,
      );
      process.exit(1);
    });
  });

program.parse();

async function promptHand() {
  return await consola.prompt("Choose your hand:", {
    type: "select",
    options: ["rock", "scissors", "paper"],
  });
}
