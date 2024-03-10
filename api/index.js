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
          const compareMessage = captureMessage.toLowerCase().split(' ')[0] || '';

          switch (compareMessage) {
            case 'ping':
              await sock.sendMessage(numberWa, {
                text: "Helo" + args.join("")
              })
              break;
            case 'ttdl':
              const url = args.join(" ");
              if(!url) {
                await sock.sendMessage(numberWa, {text: "url required!"})
              } else {
                const ress = await fetch('https://tikdldtapi.vercel.app/download/json?url=' + url).then(res => res.json()).then(res => res.result);
                if (ress.type === "video") {
                  await sock.sendMessage(numberWa, {text: "tunggu sebentar..."}, {quoted: messages})
                  await sock.sendMessage(numberWa, {
                    video: { url: ress.video1 },
                    mimetype: 'video/mp4',
                    jpegThumbnail: '',
                    caption: url.split('capt:')[0],
                    contextInfo: {
                      externalAdReply: { showAdAttribution: true
                      }
                    }
                  })
                } else {
                  await sock.sendMessage(numberWa, {text: "tunggu sebentar..."}, {quoted: messages})
                  ress.images.map(async(link, i) => {
                    await sock.sendMessage(numberWa, {
                      image: {
                        url: link
                      },
                      mimetype: "image/jpeg",
                      jpegThumbnail: link,
                      caption: "urutan ke : " + (i + 1),
                      contextInfo: {
                        externalAdReply:{
                          showAdAttribution: true
                        }
                      }
                    })
                  });
                }
              }
              break;
            /*default:
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
            }, {})*/
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