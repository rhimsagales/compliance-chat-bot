const utilWhatsApp = require('./util_whatsapp.js');
const  firebaseAdmin = require('./firebaseAdmin.js');
const utility = require('./utility.js');
const express = require('express');
const crypto = require('crypto')

const db = firebaseAdmin.database;
const eocNode = db.ref('eoc');
const  representativeInfoNode = eocNode.child('representativeInfo');




function sendOkayResponse(req, res, next) {
    res.status(200).send("OK");
    next();
}


async function checkPayloadTypeReturnMessageType(req, res, next) {
    try{
        const payload = req.body;
        const isStatus = payload?.entry?.[0]?.changes?.[0]?.value?.statuses;
        const isError = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.errors;
        const isLocation = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.location;
        const isContact = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.contacts;
        const isSystemMessage = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.system;
        const isReaction = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.reaction;

        if(isStatus || isError || isLocation || isContact || isSystemMessage || isReaction) {
            return;
        }
        const isCommandOnly = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body?.startsWith('/') && !payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body?.includes(' ');

        const isCommandWithText = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body?.startsWith('/') && payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body?.includes(' ');

        const isQuickReplyBtn = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type === 'button';
        const isListReply = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type === 'list_reply';
        const isButtonReply = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type === 'button_reply';
        const isCommandCaptionWithDocument = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.document && payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.document?.caption?.startsWith('/');
        const isTextOnly = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.type === 'text' && !payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body?.startsWith('/');

        if (isCommandOnly) {
            req.messageType = 'command_only';
        }
        else if (isCommandWithText) {
            req.messageType = 'command_with_text';
        }
        else if (isQuickReplyBtn) {
            req.messageType = 'quick_reply_btn';
        }
        else if (isListReply) {
            req.messageType = 'list_reply';
        }
        else if (isButtonReply) {
            req.messageType = 'button_reply';
        }
        else if (isCommandCaptionWithDocument) {
            req.messageType = 'command_caption_with_document';
        }
        else if (isTextOnly) {
            req.messageType = 'text_only';
        }
        else {
            await utilWhatsApp.sendTextOnlyMessageResponse(
                payload,
                `❌ Unsupported message type detected.\n\nPlease use one of the supported message formats below:\n\n1) *Command Only* \nExample: */help*\n*Reminder: Please ensure that theres no space at the end of the command.*\n\n2) *Command with Text*\n Example: */report issue with login*\n\n3) *Quick Reply Button*\n  Tap one of the quick reply options.\n\n4) *List Reply* \n Select from a list of options.\n\n5) *Button Reply*\n Press one of the reply buttons.\n\n6) *Command Caption with Document*\n Send a document with a caption starting with a command.\n\nExample: (📎 attached file) Caption: */upload report*\n\nIf you continue experiencing this issue, please try resending your message using one of the supported formats.`
            );
            return;
        }
        
        next();
    }
    catch(error) {
        console.error(error);
        return;
    }
   
    
}


async function checkIfNumberIsAllowed(req, res, next) {
    try {
        const payload = req.body;
        const senderNumber = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
        
        if (!senderNumber) {
            return next();
        }

        const normalizedSenderNumber = utility.toE164(senderNumber) || senderNumber;
        
        const snapshot = await representativeInfoNode.once('value');
        const representativeInfo = snapshot.val();

        if (!representativeInfo || typeof representativeInfo !== 'object') {
            return next();
        }
        let isAllowed = false;
        for (const key in representativeInfo) {
            const representative = representativeInfo[key];
            if (representative && representative.number) {
                const normalizedRepNumber = utility.toE164(representative.number) || representative.number;
                
                if (normalizedSenderNumber === normalizedRepNumber || 
                    normalizedSenderNumber === representative.number ||
                    senderNumber === normalizedRepNumber ||
                    senderNumber === representative.number) {
                    isAllowed = true;
                    break;
                }
            }
        }

        if (!isAllowed) {
            await utilWhatsApp.sendTextOnlyMessageResponse(
                payload,
                '❌ Access Denied\n\nYou are not authorized to use this bot. Please contact the administrator if you believe this is an error.'
            );
            return;
        }
        next();
    } catch (error) {
        console.error('Error in checkIfNumberIsAllowed:', error);
        next();
    }
}

function captureRawBody(req, res, next) {

    express.raw({ type: 'application/json' })(req, res, (err) => {
        if (err) {
            return next(err);
        }

        if (req.body) {
            req.rawBody = req.body.toString('utf8');
        } else {
            req.rawBody = '';
        }

        next();
    });
}


function verifyWhatsappSignature(req, res, next) {
    const appSecret = process.env.APP_SECRET;
    const signature = req.headers['x-hub-signature-256'];

    if (!signature) return next();

    const hash = crypto
        .createHmac('sha256', appSecret)
        .update(req.rawBody)
        .digest('hex');

    const expectedSignature = `sha256=${hash}`;
    const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
    );

    if (!isValid) {
        return next();
    }

    req.body = req.rawBody;
    next();
}



function parseRequestBody(req, res, next)  {
    try {
        if (typeof req.body === 'string') {
            req.body = JSON.parse(req.body);
        }
        next();
    } catch (error) {
        console.error('Error parsing payload:', error);
        res.status(400).send('Invalid JSON payload');
        return;
    }
}


module.exports = {
    checkPayloadTypeReturnMessageType,
    sendOkayResponse,
    checkIfNumberIsAllowed,
    checkIfNumberIsAllowed,
    captureRawBody,
    verifyWhatsappSignature,
    parseRequestBody
}