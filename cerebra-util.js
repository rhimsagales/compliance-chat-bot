const { Cerebras } = require('@cerebras/cerebras_cloud_sdk');
const promptsUtil = require('./prompts-util.js');
const util = require('./utility.js')


const cerebras = new Cerebras({
    apiKey: process.env.CEREBRAS_KEY
});


async function sendPrompt(prompt){
    try {
        const funcSendPrompt = async () => {
            try {
                const sendPrompt = await cerebras.chat.completions.create({
                    model : 'llama-3.3-70b',
                    stream : false,
                    max_completion_tokens : 500,
                    temperature : 0.2,
                    top_p : 1,
                    messages : [{
                        role : 'assistant',
                        content : prompt
                    }]
                });
            
                const response = sendPrompt.choices[0].message.content;
                console.log(sendPrompt.usage)
                return response;
            }
            catch(e) {
                console.log(e.message)
                throw new Error(e.message);
            }
        }

        return await util.retryExponential(funcSendPrompt)
    }
    catch(e) {
        console.log(e.message)
        throw new Error();

    }
    
}


async function isItTooBroadOrSpecific(question) {
    try {
        const funcIsItTooBroadOrSpecific = async () => {
            try {
      
                const chatCompletion = await cerebras.chat.completions.create({
                  model : 'llama3.1-8b',
                  stream : false,
                  max_completion_tokens : 200,
                  temperature : 0.2,
                  top_p : 1,
                  messages : [{
                    role : 'user',
                    content : promptsUtil.promptBroadOrSpecific(question)
                  }]
                })
                const response = {
                  text : chatCompletion.choices[0].message.content
                }
            
                const answer = response.text.trim().toLowerCase();
            
                if (answer === "broad" || answer === "specific") {
                  return answer;
                }
                return "unknown";
            
            } catch (error) {
            console.error("❌ Error evaluating question:", error);
            throw new Error(error.message);
            }
        };
        return await util.retryExponential(funcIsItTooBroadOrSpecific);
    }
    catch(e){
        console.log(e.message);
        throw new Error();
    }
    
}

module.exports = {
    sendPrompt,
    isItTooBroadOrSpecific
}