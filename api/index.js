const {
  DisconnectReason,
  useMultiFileAuthState,
  MessageType,
  MessageOptions,
  Mimetype
} = require("@whiskeysockets/baileys");

const makeWASocket = require("@whiskeysockets/baileys").default;
const { MongoClient } = require("mongodb");
const express = require('express');
const path = require('path');
const pathToDb = path.join(process.cwd(), 'api', 'MongoAuth.js');
const useMongoDBAuthState = require(pathToDb);
require('dotenv').config();

const mongoURL = process.env.MONGO_CONNECT;
const app = express();



app.use(express.json());
app.use(express.urlencoded());

let sock;
const mongoClient = new MongoClient(mongoURL);

async function connectionLogic() {
  await mongoClient.connect();
  const collection = mongoClient
    .db("databun")
    .collection("bundata");
  const { state, saveCreds } = await useMongoDBAuthState(collection);
  sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
  });
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update || {};

    if (qr) {
      console.log(qr);
    }

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) {
        connectionLogic();
      }
    }
  });
  sock.ev.on("messages.update", (messageInfo) => {
    console.log("receiving message!");
  });
  sock.ev.on("messages.upsert", async({messages, type}) => {
    try {
      if (type === "notify") {
        if (!messages[0]?.key.fromMe) {
          const captureMessage = messages[0].message.extendedTextMessage.text;
          const numberWa = messages[0]?.key?.remoteJid;
          const args = captureMessage.trim().split(/ +/).slice(1);

          const compareMessage = captureMessage.toLowerCase();

          switch (compareMessage) {
            case 'ping':
              await sock.sendMessage(numberWa, {
                text: "Helo"
              })
              break;
            case 'ttdl':
              const url = args.join(" ");
              await fetch('https://tikdldtapi.vercel.app/download/json?url=' + url)
              .then(res => res.json)
              .then(async(res) => {
                await sock.sendMessage(numberWa, { video: { url: res.result.video1 }, mimetype: 'video/mp4', jpegThumbnail: '', caption: url.split("|")[1], contextInfo: { externalAdReply: { showAdAttribution: true}}}, {quoted: messages})
              })
              break;
            default:
              await sock.relayMessage(numberWa,  {
                requestPaymentMessage: {
                  currencyCodeIso4217: 'IDR',
                  amount1000: `100000000`,
                  requestFrom: "0@s.whatsapp.net",
                  noteMessage: {
                    extendedTextMessage: {
                      text: args.join(" "),
                      mentions: numberWa,
                      contextInfo: {
                        externalAdReply: {
                        showAdAttribution: true
                      }
                    }
                  }
                }
              }
            }, {})
          }
        }
      }
    } catch (error) {
      console.log("error ", error);
    }
  });
  sock.ev.on("creds.update", saveCreds);
}

app.get('/', async(req, res) => {
  
  const number = req.query.number + "@s.whatsapp.net";
  const mess = req.query.mess;
  try {
    if(number) {
      const isConnected = () => sock?.user ? true : false;
      if(isConnected()) {
        await sock.sendMessage(number, {
          text: mess
        })
        res.json({status: "sended"});
      }
    } 
  } catch (e) {
    res.json(e);
  } finally {
    await mongoClient.close();
  }
})

app.listen(3000, () => {
  console.log('legacy server listening!');
})

connectionLogic();