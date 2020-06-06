require("dotenv").config();
const amqp = require("amqplib");
const fetch = require("node-fetch");
const { URLSearchParams } = require("url");
const { load } = require("./lib/load");
const {
  SOLA_MQ_URL,
  SOLA_MQ_LOAD,
  SOLA_DB_HOST,
  SOLA_DB_PORT,
  SOLA_DB_USER,
  SOLA_DB_PWD,
  SOLA_DB_NAME,
  SOLA_DISCORD_URL,
  SOLA_TELEGRAM_ID,
  SOLA_TELEGRAM_URL,
} = process.env;

var amqpConn = null;

(async () => {
  console.log("Connecting to amqp server");
  const connection = await amqp.connect(SOLA_MQ_URL);
  const channel = await connection.createChannel();
  await channel.assertQueue(SOLA_MQ_LOAD, { durable: false });
  await channel.prefetch(1);
  console.log(`Waiting for messages in ${SOLA_MQ_LOAD}. To exit press CTRL+C`);
  channel.consume(
    SOLA_MQ_LOAD,
    async (msg) => {
      const {
        SOLA_HASH_PATH,
        file,
        SOLA_SOLR_URL,
        SOLA_SOLR_CORE,
      } = JSON.parse(msg.content.toString());
      console.log(`Received ${SOLA_MQ_LOAD} job for ${file}`);
      console.log("Connecting to mariadb");
      const knex = require("knex")({
        client: "mysql",
        connection: {
          host: SOLA_DB_HOST,
          port: SOLA_DB_PORT,
          user: SOLA_DB_USER,
          password: SOLA_DB_PWD,
          database: SOLA_DB_NAME,
        },
      });

      const result = await knex("files").select("status").where("path", file);
      if (result[0].status === "HASHED") {
        await knex("files").where("path", file).update({ status: "LOADING" });
        try {
          await load(SOLA_HASH_PATH, file, SOLA_SOLR_URL, SOLA_SOLR_CORE);
        } catch (e) {
          await knex("files").where("path", file).update({ status: "HASHED" });
          await knex.destroy();
          return;
        }
        await knex("files").where("path", file).update({ status: "LOADED" });
        await knex.destroy();
        if (SOLA_TELEGRAM_ID && SOLA_TELEGRAM_URL) {
          console.log("Posting notification to telegram");
          await fetch(SOLA_TELEGRAM_URL, {
            method: "POST",
            body: new URLSearchParams([
              ["chat_id", SOLA_TELEGRAM_ID],
              ["parse_mode", "Markdown"],
              ["text", "`" + file.split("/")[1] + "`"],
            ]),
          });
        }
        if (SOLA_DISCORD_URL) {
          console.log("Posting notification to discord");
          await fetch(SOLA_DISCORD_URL, {
            method: "POST",
            body: new URLSearchParams([["content", file.split("/")[1]]]),
          });
        }
      } else {
        console.log(`File status is [${result[0].status}] , skip`);
      }
      await channel.ack(msg);
      console.log(`Completed ${SOLA_MQ_LOAD} job for ${file}`);
      await new Promise((resolve) => {
        setTimeout(resolve, 200); // let the bullets fly awhile
      });
      console.log("Completed");
    },
    { noAck: false }
  );
})();

function start() {
  amqp.connect(SOLA_MQ_URL, function(err, conn) {
    if (err) {
      console.error("[AMQP]", err.message);
      return setTimeout(start, 1000);
    }
    conn.on("error", function(err) {
      if (err.message !== "Connection closing") {
        console.error("[AMQP] conn error", err.message);
      }
    });
    conn.on("close", function() {
      console.error("[AMQP] reconnecting");
      return setTimeout(start, 1000);
    });
    console.log("[AMQP] connected");
    amqpConn = conn;
    whenConnected();
  });
}

function whenConnected() {
  startPublisher();
  publish("", "load_hash", "load_hash")
}

var pubChannel = null;
var offlinePubQueue = [];

function closeOnErr(err) {
  return err;
}

function startPublisher() {
  amqpConn.createConfirmChannel(function(err, ch) {
    if (closeOnErr(err)) return;
    ch.on("error", function(err) {
      console.error("[AMQP] channel error", err.message);
    });
    ch.on("close", function() {
      console.log("[AMQP] channel closed");
    });

    pubChannel = ch;
    var [exchange, routingKey, content] = offlinePubQueue.shift();
    publish(exchange, routingKey, content);
  });
}

function publish(exchange, routingKey, content) {
  try {
    pubChannel.publish(exchange, routingKey, content, { persistent: true },
        function(err, ok) {
          if (err) {
            console.error("[AMQP] publish", err);
            offlinePubQueue.push([exchange, routingKey, content]);
            pubChannel.connection.close();
          }
        });
  } catch (e) {
    console.error("[AMQP] publish", e.message);
    offlinePubQueue.push([exchange, routingKey, content]);
  }
}


//start();