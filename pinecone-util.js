// pineconeClient.js
const { Pinecone } = require('@pinecone-database/pinecone');
const dotenv = require('dotenv');
dotenv.config();

let pineconeInstance = null;
const indexName = "policy-embeddings";


function getPineconeClient() {
  if (!pineconeInstance) {
    pineconeInstance = new Pinecone({
      apiKey: process.env.PINECONE_KEY
    });
    // pineconeInstance.index('jkdas').namespace('sasasajs').describeIndexStats()
    
    console.log("✅ Pinecone client initialized");
  }
  return pineconeInstance;
}


function getPineconeIndex(indexName) {
  const client = getPineconeClient();
  return client.index(indexName);
}



async function storeEmbeddingsInPinecone(embeddingsArray, documentId) {
  if (!embeddingsArray || embeddingsArray.length === 0) {
    throw new Error("No embeddings to store");
  }

  const index = getPineconeIndex(indexName);


  const vectors = embeddingsArray.map((chunk) => ({
    id: `${documentId}-chunk-${chunk.chunkIndex}`,
    values: chunk.embedding,
    metadata: {
      text: chunk.chunkText,
      documentId,
      chunkIndex: chunk.chunkIndex,
    },
  }));

  try {

    console.log(`Removing existing vectors for documentId: ${documentId}...`);
    
    await index.deleteMany({
        filter: {
            documentId: { $eq: documentId }
        }
    });

    const batchSize = 50;
    for (let i = 0; i < vectors.length; i += batchSize) {
      const batch = vectors.slice(i, i + batchSize);
      await index.upsert(batch);
    }

    console.log(`Successfully stored ${vectors.length} embeddings in Pinecone.`);
  } catch (error) {
    console.error("Error storing embeddings in Pinecone:", error);
    throw error;
  }
}
  
  


async function queryEmbeddings(indexName, queryEmbedding, nameSpace, topK = 3) {
    // console.log(`QueryEmbddings: ${indexName}${queryEmbedding}`)
    try {
      const index = getPineconeIndex(indexName);
  
      const queryResponse = await index.namespace(nameSpace).query({
        topK: topK,
        vector: queryEmbedding,
        includeValues: true,      
        includeMetadata: true     
      });
  
      return queryResponse.matches.map(match => ({
        id: match.id,
        score: match.score,
        text: match.metadata.text,
        chunkIndex: match.metadata.chunkIndex,
        documentId: match.metadata.documentId
      }));
  
    } catch (error) {
      console.error("❌ Error querying Pinecone:", error.message);
      throw error;
    }
  }


async function countDocuments(indexName, nameSpace){
  const index = getPineconeIndex(indexName);
  const stats = await index.namespace(nameSpace).describeIndexStats();
  const length = stats.totalRecordCount


  return length;
}

module.exports = { 
    storeEmbeddingsInPinecone,
    queryEmbeddings,
    countDocuments
 };
// pineconeInstance.index('jkdas').namespace('sasasajs').describeIndexStats.length()