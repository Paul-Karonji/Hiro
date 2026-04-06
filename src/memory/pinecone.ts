import { Pinecone } from '@pinecone-database/pinecone';
import { embed } from 'ai';
import { getActiveEmbeddingModelCandidates } from '../agent/engine';
import { config } from '../config';

const pc = new Pinecone({ apiKey: config.PINECONE_API_KEY });
const index = pc.index('hiro-memory');

/**
 * Helper to generate a 768-D vector natively using the active embedder
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
    const candidates = getActiveEmbeddingModelCandidates();

    for (const candidate of candidates) {
        try {
            const { embedding } = await embed({
                model: candidate.model,
                value: text
            });

            if (embedding) {
                return embedding;
            }

            console.warn(`[Pinecone] ${candidate.providerId} embedder returned an empty embedding payload.`);
        } catch (e) {
            console.error(`[Pinecone] Failed to generate embedding with ${candidate.providerId}:`, e);
        }
    }

    return null;
}

/**
 * Pushes a new summary into Pinecone with its semantic vector
 */
export async function storeSemanticMemory(id: string, textPayload: string) {
    if (!config.PINECONE_API_KEY) return;
    try {
        const vector = await generateEmbedding(textPayload);
        if (!vector) return;

        await index.upsert([
            {
                id: id,
                values: vector,
                metadata: { 
                  text: textPayload, 
                  timestamp: new Date().toISOString()
                }
            }
        ] as any);
        console.log(`[Pinecone] Successfully stored semantic memory: ${id}`);
    } catch (error) {
        // Failing gracefully
        console.error('[Pinecone] Failed to store memory (Swallowed gracefully).', error);
    }
}

/**
 * Searches historical memories based on semantic meaning
 */
export async function querySemanticMemory(query: string, topK: number = 3): Promise<string[]> {
    if (!config.PINECONE_API_KEY) return [];
    try {
        const queryVector = await generateEmbedding(query);
        if (!queryVector) return [];

        const results = await index.query({
            topK,
            vector: queryVector,
            includeMetadata: true
        });

        if (!results.matches || results.matches.length === 0) {
            return [];
        }

        const validMatches = results.matches.filter(match => match.metadata?.text);
        const texts = validMatches.map(match => (match.metadata as any).text as string);
        return texts;
    } catch (error) {
        console.error('[Pinecone] Query failed (Swallowed gracefully).', error);
        return [];
    }
}
