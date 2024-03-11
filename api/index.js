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
const axios = require('axios');
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
          sock.readMessages([messages[0].key]);
          const getBuffer = async (url, options) => {
           	try {
              options ? options : {}
              const res = await axios({
                method: "get",
                url,
                headers: {
                  'DNT': 1,
                  'Upgrade-Insecure-Request': 1
                },
                ...options,
                responseType: 'arraybuffer'
              })
              return res.data
           	} catch (err) {
           	  return err
           	}
          }
          const captureMessage = messages[0].message.extendedTextMessage.text;
          const numberWa = messages[0]?.key?.remoteJid;
          const args = captureMessage.trim().split(/ +/).slice(1);
          const compareMessage = captureMessage.toLowerCase().split(' ')[0] || '';

          switch (compareMessage) {
            case 'tiktok':
              const url = args.join(" ");
              const urlTiktok = url.split("|")[0];
              const captss = url.split("capt:")[1];
              if(!url) {
                await sock.sendMessage(numberWa, {text: "tautan tiktok dibutuhkan!"}, {quoted: messages[0]})
              } else {
                sock.sendMessage(numberWa, {text: "tunggu sebentar...\npermintaan anda sedang kami proses."}, {quoted: messages[0]})
                sock.sendPresenceUpdate('composing', numberWa);
                const ress = await fetch('https://tikdldtapi.vercel.app/download/json?url=' + url).then(res => res.json()).then(res => res.result);
                const audio = await getBuffer(ress.music);
                if (ress.type === "video") {
                  sock.sendMessage(numberWa, {
                    video: { url: ress.video1 },
                    mimetype: 'video/mp4',
                    jpegThumbnail: await getBuffer('https://blob.cloudcomputing.id/images/d4e9c208-77de-4a07-84ca-fb950b7b21cc/logo-tiktok-l-min.jpg'),
                    caption: captss,
                    contextInfo: {
                      externalAdReply: { showAdAttribution: true
                      }
                    }
                  })
                  sock.sendMessage(numberWa, { audio, mimetype: 'audio/mpeg'})
                } else {
                  ress.images.map((link, i) => {
                    const capt = i + 1;
                    sock.sendMessage(numberWa, { image: { url: link }, caption: `urutan ke : ${capt}`});
                  });
                  sock.sendMessage(numberWa, { audio, mimetype: 'audio/mpeg'})
                }
              }
              break;
            default:
              sock.sendPresenceUpdate('composing', numberWa) 
              sock.sendMessage(numberWa, {
                text: "Hai, mungkin kami bisa membantu anda untuk mengunduh media tiktok 😅,\nkirimkan perintah `tiktok<spasi>tautan_tiktok` untuk menggunakannya.\npowered by https://down-tik.vercel.app"
              }, {quoted: messages[0]});
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