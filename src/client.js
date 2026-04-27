import { Command } from "commander";
import WebSocket from "ws";
import { createInterface } from "readline";
import {
  readFileSync,
  existsSync,
} from "fs";
import { resolve } from "path";
import { consola } from "consola";

const program = new Command();

program
  .name("Janken")
  .description("Janken for CLI")
  .argument("<name>", "player name")
  .action((name) => {
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
          name,
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
        consola.info(
          `Opponent: ${msg.opponent}`,
        );
        promptHand((hand) => {
          ws.send(
            JSON.stringify({
              type: "choice",
              hand,
            }),
          );
        });
      }

      if (msg.type === "result") {
        consola.log(
          `\nYou: ${msg.myHand}  /  Opponent: ${msg.opponentHand}`,
        );
        if (msg.result === "draw") {
          consola.info("Draw");
        } else if (
          msg.result === "win"
        ) {
          consola.success("You win!");
        } else {
          consola.fail("You lose...");
        }
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

function promptHand(cb) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question(
    "Choose your hand: ",
    (answer) => {
      rl.close();
      const valid = [
        "rock",
        "scissors",
        "paper",
      ];
      if (
        valid.includes(
          answer.trim().toLowerCase(),
        )
      ) {
        cb(answer.trim().toLowerCase());
      } else {
        consola.warn("Please choose.");
        promptHand(cb);
      }
    },
  );
}
