const express = require("express");
const dotenv = require("dotenv");
const axios = require("axios");
const utility = require('./utility.js');
const utilWhatsApp = require('./util_whatsapp.js');
const customMiddleWare = require('./middle-ware.js');
const firebaseUtil = require('./firebase-utility.js')
const path = require('path');
const geminiUtil = require('./gemini-util.js');
const pineconeUtil = require('./pinecone-util.js');
const promptsUtil = require('./prompts-util.js');
const messageTypeHandler = require('./message-type-handler-util.js');


dotenv.config();
const app = express();


app.post(
  '/webhook',
  customMiddleWare.sendOkayResponse,
  customMiddleWare.captureRawBody,
  customMiddleWare.verifyWhatsappSignature,
  customMiddleWare.parseRequestBody,
  customMiddleWare.checkPayloadTypeReturnMessageType,
  async (req, res) => {
    const messageType = req.messageType;
    const payload = req.body;
    console.log(req.messageType)
    switch(messageType){
      case "command_only":
        break;
      case "command_with_text":
        messageTypeHandler.commandWithText(payload)
        break;
      case "quick_reply_btn":
        break;
      case "list_reply":
        break;
      case "button_reply":
        break;
      case "command_caption_with_document":
        messageTypeHandler.commandWithDocument(payload);
        break;
      case "text_only":
        messageTypeHandler.textOnly(payload);
        break
      default:
        return;

    }
  }
);

app.use(express.json());

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verified!");
    res.status(200).send(challenge);
  } else {
    console.error("❌ Webhook verification failed.");
    res.sendStatus(403);
  }
});


app.get('/', (req, res) => {
  res.status(200).send("Server is online")
})

app.listen(3000, () => console.log("🚀 Webhook running on port 3000"));
