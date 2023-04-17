const path = require("path");
const { exit } = require("process");
const app = require("express")();
const _ws = require("express-ws")(app);
const uuid = require("uuid").v4;
const compression = require("compression");
const winston = require("winston");
const serveStatic = require("serve-static");

const PORT = 3000;

const STATIC_PATH_VIEW = path.join(__dirname, "./view");
const STATIC_PATH_MASTER = path.join(__dirname, "../clients/master");
const STATIC_PATH_SLAVE = path.join(__dirname, "../clients/slave");

const clients = new Map();

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

const broadcast = async (msg) => {
  const sendPromises = new Set();
  for (const [client, metaData] of clients) {
    if (client.readyState === 1) {
      sendPromises.add(
        new Promise((resolve) => {
          client.send(msg, resolve);
        })
      );
    }
  }

  if (sendPromises.size > 0) {
    await Promise.all(sendPromises);
    logger.info(
      `[WebSocket] Broadcasted message to ${sendPromises.size} clients`
    );
    sendPromises.clear();
  }
};

app.disable("x-powered-by");

app.use(compression());

app.use("/", serveStatic(STATIC_PATH_VIEW));
app.use("/master", serveStatic(STATIC_PATH_MASTER));
app.use("/slave", serveStatic(STATIC_PATH_SLAVE));

app.ws("/", (s, req) => {
  try {
    let metaData = {};

    if (!clients.has(s)) {
      const id = uuid();
      metaData = { id, type: null };
      clients.set(s, metaData);
    } else {
      metaData = clients.get(s);
    }

    s.on("message", (msg) => {
      try {
        const data = JSON.parse(msg);

        if (data.action === "register") {
          const { id } = metaData;
          clients.set(s, { id, type: data.type });
          metaData = { id, type: data.type };
          logger.info(
            `[WebSocket] new client registered ${JSON.stringify({
              id,
              type: data.type,
            })}`
          );
        }

        if (data.action === "interaction") {
          if (data.target === "change-background-color") {
            const value = Math.floor(Math.random() * 16777215).toString(16);
            logger.info(
              `[WebSocket] ${JSON.stringify({
                client: metaData.id,
                action: data.action,
                target: data.target,
                value,
              })}`
            );

            broadcast(
              JSON.stringify({
                action: data.action,
                target: data.target,
                value,
              })
            );
          }

          if (data.target === "") {
          }
        }
      } catch (err) {
        logger.error(
          `[WebSocket] Error - ${err.message} - ${JSON.stringify(err)}`
        );
        s.send(`[WebSocket] Error: ${err.message} - ${JSON.stringify(err)}`);
      }
    });

    s.on("close", () => {
      const { id } = metaData;
      logger.info(`[WebSocket] closing connection for ${id}`);
      clients.delete(s);
    });
  } catch (err) {
    logger.error(`[WebSocket] Error - ${err.message} - ${JSON.stringify(err)}`);
  }
});

app.listen(PORT, (err) => {
  if (err) {
    logger.error(err);
    exit(0);
  }
  logger.info(`[WebServer] listening on port ${PORT}`);
  logger.info(`[WebSocket] listening on port ${PORT}`);
});
