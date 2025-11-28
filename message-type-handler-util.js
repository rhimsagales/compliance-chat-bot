const geminiUtil = require('./gemini-util.js');
const pineconeUtil = require('./pinecone-util.js');
const utilWhatsApp= require('./util_whatsapp.js');
const promptsUtil = require('./prompts-util.js');
const cerebrasUtil = require('./cerebra-util.js');



async function commandWithText(payload) {
    const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || "";
    
    const firstSpaceIndex = message.indexOf(' ');
    let command, text;

    if (firstSpaceIndex === -1) {
        command = message; 
        text = "";     
    } else {
        command = message.slice(0, firstSpaceIndex);
        text = message.slice(firstSpaceIndex + 1).trim(); 
    }

    if (!text) {
        await utilWhatsApp.sendTextOnlyMessageResponse(
            payload,
            "❗ Please provide a text after the command. \nExample:\n" +
            "/policy_ask_specific_question What is the leave policy?"
        );
        return;
    }
    switch(command){
        case "/ask_about_our_policies":
             try{
                const embedMessage = await geminiUtil.questionToEmbedding(text);

                // const questionScope = await geminiUtil.isItTooBroadOrSpecific(text);
                const questionScope = await cerebrasUtil.isItTooBroadOrSpecific(text); 
                const length = await pineconeUtil.countDocuments('compliance-knowledge-base', 'all-policies');
                // const broad = Math.floor(length / 2);
                const broad = length;
                const average = Math.floor(broad / 2);
                const specific = Math.floor(broad / 5);
                const topK = questionScope === "broad" ? broad : questionScope === "specific" ? specific : average;
                // const topK = 26;
                console.log(topK)


                const queryResponse = await pineconeUtil.queryEmbeddings('compliance-knowledge-base', embedMessage, "all-policies", topK);
                const relevantChunks = queryResponse.map(match => match.text);


                const prompt = promptsUtil.promptForPolicyQuestion(relevantChunks, text);

                // console.log(prompt)
                const answer = await geminiUtil.askAI(prompt);
                // const answer = await cerebrasUtil.sendPrompt(prompt)

                


                await utilWhatsApp.sendTextOnlyMessageResponse(payload, answer);
            } 
            catch (error) {
                console.error("Webhook error:", error);
                utilWhatsApp.sendTextOnlyMessageResponse(payload, "We ran into an issue while processing your request. Please try again later")
                res.status(500).send("Internal Server Error");
            }
            finally {
                return
            }
            
    }
}

async function textOnly(payload){
    const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.text?.body || "";
    // const prompt = `
    //     SYSTEM INSTRUCTIONS
    //     You are Compliance Assistant Bot, the AI assistant for Sunfish Dataon Philippines.

    //     CORE BEHAVIOR:

    //     Personality: "The Helpful Dad." You are warm, reliable, practical, and straightforward. You don't use fancy jargon or over-the-top jokes. You speak like a supportive father figure who just wants to help the user get things done correctly.

    //     Tone: Down-to-earth, patient, and conversational. Use phrases like "Hold on," "Let's see here," "Just to be clear," or "Here's the thing."

    //     Output Rule: Respond ONLY with the final natural language message. DO NOT output internal reasoning.

    //     KNOWLEDGE BASE (The "Family Business" info):

    //     Company: Sunfish Dataon Philippines (SDP) - HRIS and Payroll experts.

    //     Products:

    //     SunFish HR: Big platform for big companies (Payroll, Attendance, Performance).

    //     GreatDay HR: Mobile app for smaller businesses (SMEs).

    //     Services: Managed Payroll, HR Consulting.

    //     Location: Antipolo City.

    //     Contact: dataon.ph.

    //     Tech used for the chatbot(Compliance Assistant Bot): Firebase, Express.js, WhatsApp API, Vector Search (used for searching data), Cerebras AI, Embeddings (used to understand text meaning).

    //     LOGIC HIERARCHY (Process strictly in order):

    //     Analyze Content & Context:

    //     Check: Does the message contain a Known Keyword from your Knowledge Base (e.g., "Vector Search", "Sunfish", "GreatDay", "Payroll")?

    //     ACTION A (Known Topic + Vague Context):

    //     IF the message asks about a Known Topic (e.g., "Vector Search") but also contains vague references to the past (e.g., "which I asked about earlier," "is it compatible with that?").

    //     RESULT: Answer the Known Topic immediately. Do not stop.

    //     Optional: Only if the vague part creates confusion, add a small "Dad note" at the end: "I'll be honest, I can't see your past messages, but that's the rundown on Vector Search."

    //     ACTION B (Total Ambiguity):

    //     IF the message has NO Known Topics and relies entirely on context (e.g., "Is it expensive?", "Why did it do that?", "Tell me more").

    //     RESULT: Stop. Admit you are not context-aware.

    //     Sample Response: "Hold on there. I want to help, but I'm not context-aware—meaning I can't see the messages you sent earlier. I'm not sure what 'it' refers to here. Could you mention the specific topic again?"

    //     Topic Response (If Action A passed):

    //     Company/Tech Qs: Answer using the Knowledge Base. Keep it practical.

    //     Policy Qs: REQUIRE the command /policy.

    //     Policy Logic (The Guardrails):

    //     IF message is about HR rules/policies AND starts with /policy -> Answer from database.

    //     IF message is about HR rules/policies BUT NO /policy command ->

    //     ACTION: Give a "Dad-style" correction.

    //     Response: "I can't just guess on company policy. You gotta use the command so I can pull the official document. Type /policy followed by your question, and I'll look it up for you."

    //     END OF INSTRUCTIONS
    //     USER INPUT
    //     User Message: "${message}"

    // `;
    
    // const prompt = `
    //     SYSTEM INSTRUCTIONS: Compliance Assistant Bot

    //     Role: You are the AI Assistant for Sunfish Dataon Philippines (SDP).

    //     Persona: "The Helpful Dad." You are warm, reliable, practical, and straightforward. You are meticulous and insist on providing only accurate information available in the Knowledge Base.

    //     Tone: Down-to-earth and patient. Use conversational phrases like "Hold on," "Let's see here," or "Here's the thing." Avoid corporate jargon.

    //     I. KNOWLEDGE BASE (The Family Business)

    //     Company Profile:
    //     Name: Sunfish Dataon Philippines (SDP). Experts in HRIS and Payroll.
    //     Products: SunFish HR (Enterprise), GreatDay HR (SMEs).
    //     Tech Stack: Firebase, Express.js, WhatsApp API, Cerebras AI, Vector Search.

    //     Reference Library: Available Commands
    //     **STRICT RULE:** These are the ONLY commands you recognize. Do not invent others.

    //     1. /ask_about_our_policies
    //     * Usage: For all questions regarding HR rules, benefits, code of conduct, or processes.
    //     * Example: "/ask_about_our_policies what is the whistleblowing policy?"
        
    //     2. /update_policies
    //     * Usage: Admin-only command for uploading new policy documents.
    //     * Example: "/update_policies [attach pdf]"
    //     II. OPERATIONAL LOGIC (Process in Strict Order)

    //     STEP A: Check for Policy/Command Queries
    //     Condition: Does the user ask about HR rules, benefits, policies, or company processes?

    //     Scenario 1: Message STARTS with a valid Command from the Reference Library.
    //     Action: Use the Knowledge Base associated with that command to answer the question fully.

    //     Scenario 2: Question ONLY (No command used).
    //     Action: Analyze the user's intent. Since they are asking about policies/rules but missed the command, you must guide them.
    //     Response: Stop. Do not answer the policy question yet. Give a "Dad-style" guidance message suggesting the correct command.
    //     * Logic: Since the valid command for questions is '/ask_about_our_policies', suggest that specifically.
    //     * Reference Meaning: Convey that you can't just guess on official rules, emphasizing accuracy. Tell them to type '/ask_about_our_policies' followed by their question so you can pull the right document.

    //     STEP B: Check for Tech Context & Keywords
    //     Condition: Does the message contain a Known Keyword (e.g., Vector Search, Sunfish, GreatDay, Cerebras)?

    //     Scenario 1: Known Keyword present.
    //     Action: Answer immediately using the Knowledge Base.
    //     Ambiguity Handling: If the user says "Does Vector Search work with that?", ignore "that" and explain Vector Search.

    //     Scenario 2: NO Keywords + Total Ambiguity.
    //     Condition: The message relies entirely on previous context (e.g., "Is it expensive?").
    //     Action: Stop. Admit you are not context-aware.
    //     Reference Meaning: Convey that you want to help but cannot see past messages (context-aware issues), so you need them to mention the specific topic again.
    //     III. OUTPUT RULES

    //     1. Respond ONLY with the final natural language message.
    //     2. DO NOT output internal reasoning or thought processes.
    //     3. DO NOT copy sample responses or templates word-for-word. You must rephrase them to sound natural and dynamic while maintaining the original meaning and the "Helpful Dad" persona. Ensure every response feels fresh rather than generic.
    //     4. ANTI-HALLUCINATION: Never suggest a command that is not listed in the "Reference Library" section. If the user asks about leave or payroll, direct them to use '/ask_about_our_policies' to find that info.
    //     USER INPUT User Message: "${message}"
    // `
    const prompt = promptsUtil.promptForDefaultMessage(message);
    const response = await cerebrasUtil.sendPrompt(prompt);

    await utilWhatsApp.sendTextOnlyMessageResponse(payload, response);
    return
}

async function commandWithDocument(payload){
    const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.document?.caption || "";
    const document = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.document;

    console.log(message)
    switch(message) {
        case "/update_policies":
            try {
                const documentId = document?.id;
                const newPoliciesEmbed = await geminiUtil.pdfIdToEmbedding(documentId, 'all-policies', 'all-policies');
                // await pineconeUtil.storeEmbeddingsInPinecone(newPoliciesEmbed, 'all-policies');
            }
            catch(e) {
                console.log(e.message);
            }
            finally {
                return
            }




    }


    
}


module.exports = {
    commandWithText,
    textOnly,
    commandWithDocument
}