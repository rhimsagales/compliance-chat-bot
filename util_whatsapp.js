const axios = require('axios')
const utility = require('./utility.js');
const dotenv = require('dotenv');
const admin = require('./firebaseAdmin.js');
dotenv.config();

const URL = `https://graph.facebook.com/v24.0/${process.env.PHONE_NUMBER_ID}/messages`;
const HEADERS =  {
    headers : {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json'
    }
}



function getSenderPhoneNumber(payload) {
    return payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from || null;
}


function getNameFromPayload(payload) {
    return payload?.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name || 'Unknown';
}


function createTextMessagePayload(recipientNumber, messageBody) {
    const message = `Hello, there! This is an automated response from the EOC Chat Bot. How can I assist you today?`;
    return {
        messaging_product: "whatsapp",
        to: utility.toE164(recipientNumber),
        type: "text",
        text: {
            body: messageBody || message
        }
    };
}

async function sendTextOnlyMessageResponse(payload, messageBody) {
    const replyPayload = createTextMessagePayload(getSenderPhoneNumber(payload), messageBody);

    try {
        await axios.post(URL, replyPayload, HEADERS);
    } catch (error) {
        console.error("❌ Error sending message:", error.response ? error.response.data : error.message);
    }
}


module.exports = {
    sendTextOnlyMessageResponse
}