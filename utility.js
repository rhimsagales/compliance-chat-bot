const { parsePhoneNumberFromString, isValidPhoneNumber } = require('libphonenumber-js');
const Database = require('better-sqlite3');
const DB_FILE = './message_id.db';



function checkPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return { shouldWeProcess: false, message: null };
    }

    const msg = payload.message || payload; 

    const get = (o, path) => path.split('.').reduce((a, k) => (a && a[k] !== undefined) ? a[k] : undefined, o);


    const mediaTypesWithCaption = [
        'imageMessage.caption',
        'videoMessage.caption',
        'documentMessage.caption',
        'audioMessage.caption',
        'stickerMessage.caption' 
    ];
    let caption = null;
    for (const p of mediaTypesWithCaption) {
        const c = get(msg, p);
        if (typeof c === 'string' && c.trim().length > 0) {
            caption = c;
            break;
        }
    }
    const isCaptionWithMedia = caption !== null;

    const textSources = [
        'conversation',
        'extendedTextMessage.text',
        'imageMessage.caption',
        'videoMessage.caption',
        'documentMessage.caption',
        'audioMessage.caption',
        'buttonsResponseMessage.selectedDisplayText',
        'buttonsResponseMessage.selectedButtonId',
        'listResponseMessage.singleSelectReply.selectedRowId',
        'listResponseMessage.title',
        'templateButtonReplyMessage.selectedId',
        'templateButtonReplyMessage.selectedDisplayText'
    ];
    let messageText = null;
    for (const p of textSources) {
        const v = get(msg, p);
        if (typeof v === 'string' && v.trim().length > 0) {
            messageText = v.trim();
            break;
        }
    }


    const isCommand = typeof messageText === 'string' && messageText.startsWith('/');

    const interactiveKeys = [
        'buttonsResponseMessage',
        'listResponseMessage',
        'templateButtonReplyMessage',
        'interactiveMessage',
        'singleSelectReply',
        'buttonReply'
    ];
    const isInteractive = interactiveKeys.some(k => {
        const v = get(msg, k);
        return v !== undefined && v !== null;
    });


    let returnedMessage;
    if (isCaptionWithMedia) returnedMessage = caption;
    else if (messageText) returnedMessage = messageText;
    else returnedMessage = msg; 

    const shouldWeProcess = isCaptionWithMedia || isCommand || isInteractive;

    return { shouldWeProcess, message: returnedMessage };
}


function parseWhatsappEvent(payload) {
    let event = { 
        type: "UNKNOWN", 
        process_status: "IGNORED",
        data: null 
    };
    const value = payload?.entry?.[0]?.changes?.[0]?.value;

    if (!value) {
        event.reason = "Invalid or empty payload structure";
        return event;
    }

    if (value.messages) {
        const message = value.messages[0];
        
        event.type = "INBOUND_MESSAGE";
        event.process_status = "PROCESSED";
        event.data = {
            sender_id: message.from,
            message_id: message.id,
            message_type: message.type,
            content: message.type === 'text' ? message.text.body : message[message.type]
        };
        return event;
    }


    if (value.statuses) {
        const status = value.statuses[0];
        
        event.type = "OUTBOUND_STATUS";

        event.process_status = "IGNORED"; 
        event.data = {
            message_id: status.id, 
            recipient_id: status.recipient_id,
            status: status.status, 
            timestamp: status.timestamp
        };
        return event;
    }
    

    if (payload.entry?.[0]?.changes?.[0]?.field) {
        event.type = payload.entry[0].changes[0].field.toUpperCase();
        event.process_status = "ACKNOWLEDGED";
        event.data = value;
    }

    return event;
}


function getSimplePhilippineTime() {
    const now = new Date();
    const options = {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false 
    };
    
    const formatter = new Intl.DateTimeFormat('en-PH', options);
    const parts = formatter.formatToParts(now);
    

    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    const hour = parts.find(p => p.type === 'hour').value;
    const minute = parts.find(p => p.type === 'minute').value;
    const second = parts.find(p => p.type === 'second').value;

    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function createMainSeperator(func) {
    console.log('====================================================================================================');
    console.log(`---- START: New Payload Receive - ${getSimplePhilippineTime()}  ----`);

    func();

    console.log(`---- END: New Payload Receive - ${getSimplePhilippineTime()} ----`);
    console.log('====================================================================================================');
}

function createSubSeperator(func, process) {
    console.log('==================================================');
    console.log(`---- START: ${process} ----`);
    const result = func();
    console.log(`---- END: ${process} ----`);
    console.log('==================================================');
    return result;
}





function processMessagePayload(payload) {
    const deduplication = () =>{
        const messageId = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id;
        if (!messageId || typeof messageId !== 'string') {
            console.error("❌ Invalid payload: Could not extract message ID from the expected path.");
            return { status: 'error', message: 'Could not find a valid message ID in payload.' };
        }

        let db;
        
        try {
            db = new Database(DB_FILE);
            console.log(`Checking ID: ${messageId}`);
            
            const checkSql = 'SELECT message_id FROM messages WHERE message_id = ?';
            const existingRow = db.prepare(checkSql).get(messageId);

            if (existingRow) {
                console.log(`✅ Result: DUPLICATE! ID "${messageId}" already logged.`);
                return { status: 'duplicate', message: `ID "${messageId}" already processed.` };
            }

            const insertSql = 'INSERT INTO messages (message_id) VALUES (?)';
            db.prepare(insertSql).run(messageId);
            console.log(`✅ Result: PROCESSED! ID "${messageId}" logged to DB.`);
            return { status: 'processed', message: `ID "${messageId}" successfully processed and logged.` };

        } catch (error) {

            
            console.error(`❌ UNEXPECTED DATABASE ERROR for ID ${messageId}: ${error.message}`);
            return { status: 'error', message: `Database error during processing: ${error.message}` };
            
        } finally {
            if (db) {
                db.close();
            }
        
        }
    }
    const result = createSubSeperator(deduplication, "Duplicate Check");
    return result;
}


function toE164(number, defaultCountry = 'PH') {
    
    const isValid = isValidPhoneNumber(number, defaultCountry);

    if (!isValid) {
        return null;
    }

    const phoneNumber = parsePhoneNumberFromString(number, defaultCountry);

    if (phoneNumber && phoneNumber.number) {
        return phoneNumber.number; 
    }
    
    return null; 
}


function generateWhatsAppCommandLink(phoneNumber, commandText) {
    const encodedText = encodeURIComponent(commandText);
    const finalLink = `https://wa.me/${phoneNumber}/?text=${encodedText}`;
    
    return finalLink;
}



function checkWhatsAppMessageType(payload) {
    const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
        return { isRelevant: false, type: 'none' };
    }


    const isCommand = (text) => text && typeof text === 'string' && text.startsWith('/');


    if (message.type === 'interactive' && message.interactive) {
        const interactiveType = message.interactive.type;
        if (interactiveType === 'button_reply') {
        return { isRelevant: true, type: 'interactive_button' };
        }
        if (interactiveType === 'list_reply') {
        return { isRelevant: true, type: 'interactive_list' };
        }

        return { isRelevant: true, type: 'interactive' };
    }


    if (message.type === 'text' && message.text?.body) {
        const body = String(message.text.body).trim();
        if (isCommand(body)) {
            const isBareCommand = /^\/\S+$/.test(body); 
            if (isBareCommand) {
                return { isRelevant: true, type: 'command_only' };
            }
            return { isRelevant: true, type: 'command_text' }; 
        }
    }


    const mediaTypes = ['image', 'video', 'document'];

    for (const mediaType of mediaTypes) {
        if (message.type === mediaType && message[mediaType]?.caption) {
        if (isCommand(message[mediaType].caption)) {
            return { isRelevant: true, type: `command_caption_media` };
        }
        }
    }

    


    return { isRelevant: false, type: 'none' };
}




function extractBetweenOfSlashAndFirstUnderscore(inputString) {
    const startDelimiterIndex = inputString.indexOf('/');

    const endDelimiterIndex = inputString.indexOf('_');


    if (
        startDelimiterIndex === -1 ||
        endDelimiterIndex === -1 ||
        endDelimiterIndex <= startDelimiterIndex + 1
    ) {
        return null; 
    }


    return inputString.slice(startDelimiterIndex + 1, endDelimiterIndex);
}


function extractListReplyIdDescription(payload) {
    try {
        
        const listReplyId = payload
            ?.entry?.[0]
            ?.changes?.[0]
            ?.value
            ?.messages?.[0]
            ?.interactive
            ?.list_reply
            ?.id;
        const listDescription = payload
            ?.entry?.[0]
            ?.changes?.[0]
            ?.value
            ?.messages?.[0]
            ?.interactive
            ?.list_reply
            ?.description;
        console.log(listReplyId)
        console.log(listDescription)
        return {listReplyId, listDescription} || null;

    } catch (error) {
        console.error("Error processing payload to extract list reply ID:", error);
        return null;
    }
}

function extractDepartmentAndCommand(idString) {

    const parts = idString.split('_');

    if (parts.length >= 2) {
        const departmentCode = parts[0];
        const commandId = parts.slice(1).join('_');
        
        return { departmentCode, commandId };
    }
    return { departmentCode: null, commandId: null };
}


function getCurrentMonth() {
    return new Date().toLocaleString('default', { month: 'long' }).toLowerCase();
}


function objectValuesToArray  (obj) {
    if (typeof obj !== 'object' || obj === null) {
        return [];
    }


    return Object.values(obj);
};

function getPhilippineDateString() {
    const now = new Date();


    const options = {
        year: 'numeric',
        month: '2-digit', 
        day: '2-digit',   
        timeZone: 'Asia/Manila',
    };

   
    const dateString = now.toLocaleString('en-US', options);


    return dateString.replace(/\//g, '-');
}

// 1. A simple utility to pause execution
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


const retryExponential = async (fn, retries = 5, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === retries - 1) throw error;

      const waitTime = delay * Math.pow(2, i);

      await wait(waitTime);
    }
  }
};


module.exports = { 
    checkPayload, 
    parseWhatsappEvent, 
    processMessagePayload, 
    toE164, 
    createMainSeperator, 
    createSubSeperator, 
    generateWhatsAppCommandLink, 
    checkWhatsAppMessageType, 
    extractBetweenOfSlashAndFirstUnderscore, 
    extractListReplyIdDescription, 
    extractDepartmentAndCommand, 
    getCurrentMonth, 
    objectValuesToArray, 
    getPhilippineDateString,
    retryExponential
};
