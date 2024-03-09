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
}

app.get('/', async(req, res) => {
  
  const number = req.query.number + "@s.whatsapp.net";
  const mess = req.query.mess;
  try {
    if(number) {
      connectionLogic();
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