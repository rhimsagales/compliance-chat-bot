const fs = require("fs");
const {PDFParse} = require("pdf-parse");
const { GoogleGenAI } = require("@google/genai");
const { Cerebras } = require('@cerebras/cerebras_cloud_sdk');
const { Pinecone } = require('@pinecone-database/pinecone');
const promptsUtil = require('./prompts-util');
const util = require('./utility.js')
const axios = require('axios')
const dotenv = require("dotenv");
dotenv.config();


const ai = new GoogleGenAI({
  vertexAI: false,
  apiKey: process.env.GEMINI_KEY,
});


const cerebras = new Cerebras({
  apiKey: process.env.CEREBRAS_KEY
});





function splitTextIntoChunks(text, maxWords = 4000) {
  const words = text.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}



// function splitTextIntoChunks(text, maxChunkSize = 1000) {
//     if (!text) return [];

//     // --- 1. CLEANUP AND NORMALIZATION ---
//     // 1. Normalize line endings to \n
//     // 2. Replace multiple spaces/tabs with a single space
//     // 3. Replace excessive newlines with exactly two (\n\n for paragraph break)
//     const cleanedText = text
//         .replace(/(\r\n|\r)/g, '\n') // Normalize all line endings
//         .replace(/[ \t]+/g, ' ')     // Replace multiple spaces/tabs with a single space
//         .replace(/\n\s*\n/g, '\n\n') // Consolidate multiple newlines into a standard paragraph break
//         .trim(); // Trim leading/trailing whitespace

//     if (!cleanedText) return [];

//     // --- 2. RECURSIVE CHUNKING LOGIC ---
//     const chunks = [];
//     // Delimiters now rely on the cleaned \n\n and . followed by a single space
//     const delimiters = ['\n\n', '\n', '. ']; // Prioritize paragraphs, then lines, then sentences. (Removed ' ' as a primary splitter)

//     function recursiveSplit(textToSplit, delimiterIndex) {
//         // Base case 1: Text is small enough OR Base case 2: Run out of delimiters
//         if (textToSplit.length <= maxChunkSize || delimiterIndex >= delimiters.length) {
//             const trimmed = textToSplit.trim();
//             if (trimmed.length > 0) {
//                 chunks.push(trimmed);
//             }
//             return;
//         }

//         const delimiter = delimiters[delimiterIndex];
//         const parts = textToSplit.split(delimiter);

//         for (const part of parts) {
//             // Re-add the delimiter to the segment if it's not the last part
//             const segment = part + (part !== parts[parts.length - 1] ? delimiter : '');

//             // Process the segment: If it's still too large, try the next, smaller delimiter.
//             // If it's small, push it to the queue to be stored (or pass to the next level to ensure all delimiters are checked).
//             if (segment.length > maxChunkSize) {
//                 // Too large: continue splitting with the next delimiter
//                 recursiveSplit(segment, delimiterIndex + 1);
//             } else {
//                  // Small enough: Process with the next delimiter to catch any smaller structural breaks
//                  // E.g., a short paragraph might be better split into sentences if it contains important structure
//                  recursiveSplit(segment, delimiterIndex + 1);
//             }
//         }
//     }

//     // Start splitting on the largest unit (double newlines/paragraphs)
//     recursiveSplit(cleanedText, 0);

//     // --- 3. FINAL FALLBACK SPLIT (Handles massive blocks with no natural delimiters) ---
//     let finalChunks = [];
//     chunks.forEach(chunk => {
//         if (chunk.length > maxChunkSize) {
//             // Force a split at the maximum size
//             for (let i = 0; i < chunk.length; i += maxChunkSize) {
//                 finalChunks.push(chunk.substring(i, i + maxChunkSize));
//             }
//         } else {
//             finalChunks.push(chunk);
//         }
//     });

//     return finalChunks;
// }


// async function pdfToEmbedding(filePath) {
//   if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

//   const dataBuffer = await fs.promises.readFile(filePath);
//   const typedArray = new Uint8Array(dataBuffer)
//   const pdfData = new PDFParse(typedArray);
//   const text = (await pdfData.getText()).text;

//   if (!text) throw new Error("No text found in PDF");

//   const chunks = splitTextIntoChunks(text, 100);
//   const embeddingsArray = [];
//     console.log(chunks.length)
//   for (let i = 0; i < chunks.length; i++) {
//     const chunk = chunks[i];
//     try {
//       const response = await ai.models.embedContent({
//         model: "gemini-embedding-001",  // example model name from docs
//         contents: chunk
//       });

//       embeddingsArray.push({
//         chunkText: chunk,
//         embedding: response.embeddings[0].values,
//         chunkIndex: i
//       });
//     } catch (error) {
//       console.error(`Error generating embedding for chunk ${i}:`, error.message);
//     }
//   }
//   console.log(embeddingsArray)
//   return embeddingsArray;
// }


async function pdfIdToEmbedding(mediaId, policyId, nameSpace = "all-policies") {
  const CHUNK_SIZE = 1000;
  const INDEX_NAME = "compliance-knowledge-base";
  const NAMESPACE = String(nameSpace);
  let parser;
  let pdfBuffer;

  const MAX_REQUESTS_PER_WINDOW = 8;
  const PAUSE_TIME_MS = 4 * 60 * 1000;

  try {
      const metaUrl = `https://graph.facebook.com/v24.0/${mediaId}`;
      console.log(`[PROCESS] Fetching metadata from: ${metaUrl}`);

      const metaResponse = await axios.get(metaUrl, {
          headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}` },
      });

      const downloadUrl = metaResponse.data.url;
      if (!downloadUrl) throw new Error("Missing 'url' field in metadata response.");

      console.log(`[PROCESS] Downloading PDF...`);
      const fileResponse = await axios.get(downloadUrl, {
          headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}` },
          responseType: 'arraybuffer',
      });

      pdfBuffer = Buffer.from(fileResponse.data);

      if (!pdfBuffer.toString("utf-8", 0, 5).startsWith("%PDF")) {
          throw new Error("Downloaded file is not a valid PDF.");
      }
      console.log(`[STATUS] PDF downloaded successfully.`);


      parser = new PDFParse({ data: pdfBuffer });
      const result = await parser.getText();
      const text = result.text;

      if (!text) throw new Error("PDF contains no extractable text.");
      console.log(`[STATUS] Extracted ${text.length} characters.`);


      const chunks = splitTextIntoChunks(text, CHUNK_SIZE);
      console.log(`[STATUS] Document split into ${chunks.length} chunks.`);


      const pinecone = new Pinecone({ apiKey: process.env.PINECONE_KEY });
      const index = pinecone.index(INDEX_NAME);


      console.log(`[PINECONE] Deleting all vectors in namespace '${NAMESPACE}' (optional)`);

      try {
          await index.namespace(NAMESPACE).deleteAll();
          console.log(`[PINECONE] Namespace '${NAMESPACE}' cleared.`);
      } catch (err) {
          console.error(`[PINECONE] Error deleting namespace '${NAMESPACE}':`, err.message);
      }


      let requestCounter = 0;

      for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];


          if (requestCounter >= MAX_REQUESTS_PER_WINDOW) {
              console.log(`--- RATE LIMIT: Sleeping for ${PAUSE_TIME_MS / 60000} minutes ---`);
              await new Promise(r => setTimeout(r, PAUSE_TIME_MS));
              requestCounter = 0;
          }

          console.log(`[EMBED] Chunk ${i + 1}/${chunks.length}`);

          let embeddingResponse;
          try {
              embeddingResponse = await ai.models.embedContent({
                  model: "gemini-embedding-001",
                  contents: chunk,
              });
              requestCounter++;
          } catch (err) {
              console.error(`[ERROR] Failed embedding chunk ${i}: ${err.message}`);
              continue; 
          }

          const vector = embeddingResponse.embeddings[0].values;
          // console.log(vector)
          // Upsert to Pinecone
          try {
              await index.namespace(NAMESPACE).upsert([{
                id: `${policyId}-chunk-${i}`,
                values: vector,
                metadata: {
                    text: chunk,
                    chunk: i,
                    policyId
                }
            }]);
              console.log(`[UPSERT] Stored vector ${policyId}-chunk-${i}`);
          } catch (err) {
              console.error(`[ERROR] Failed to upsert chunk ${i}: ${err.message}`);
          }
      }

      console.log(`[FINAL] Successfully processed and stored all chunks.`);
      return { chunks: chunks.length, policyId, namespace: NAMESPACE };

  } catch (err) {
      console.error("Error in pdfIdToEmbedding:", err.message);
      throw err;

  } finally {
      if (parser?.destroy) {
          await parser.destroy();
          console.log("[CLEANUP] PDF parser destroyed.");
      }
  }
}










async function questionToEmbedding(question) {
  try {
    const funcQuestionToEmbedding = async () => {
      if (!question || question.trim() === "") throw new Error("Question is empty");
  
      try {
        const response = await ai.models.embedContent({
          model: "gemini-embedding-001",
          contents: question
        });
  
        return response.embeddings[0].values;
      } catch (error) {
        console.log(error.message)
        throw new Error("Error generating question embedding from Gemini API");
      }
    };

    return await util.retryExponential(funcQuestionToEmbedding);
  }
  catch(e){
    console.log(e.message);
    throw new Error();
  }
  
}


async function askAI(prompt) {
    try {
      const funcAskAI = async () => {
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-lite',
            contents : prompt
          });
          console.log(response.usageMetadata.totalTokenCount)
          return response.text
        }
        catch(e){
          console.log(e.message);
          throw new Error();
          
        }
      };

      return await util.retryExponential(funcAskAI)
    }
    catch(e) {
      console.log(e.message);
      throw new Error();
    }
    
}


module.exports = { pdfIdToEmbedding, questionToEmbedding, askAI };
