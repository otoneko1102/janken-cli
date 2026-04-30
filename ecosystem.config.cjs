const { createRequire } = require("module");
const require_ = createRequire(__filename);
const config = require_("./config.json");

module.exports = {
  apps: [
    {
      name: "janken-cli",
      script: "src/host.js",
      interpreter: "node",
      interpreter_args: "--experimental-vm-modules",
      env: {
        PORT: config.port,
        HOST: config.host,
      },
      watch: false,
      autorestart: true,
    },
  ],
};
