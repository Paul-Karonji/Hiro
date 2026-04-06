import { querySemanticMemory } from "../memory/pinecone";

export const searchMemoryDeclaration = {
    name: "search_memory",
    description: "Deep-search the user's semantic long-term memory. Use this for fuzzy recall of summarized history, extracted facts, and higher-level themes. For exact past wording or transcript lookup, prefer search_history instead.",
    parameters: {
        type: "OBJECT",
        properties: {
            query: {
                type: "STRING",
                description: "The semantic search query based on the user's question (e.g. 'game engine ideas' or 'conversations about books')."
            }
        },
        required: ["query"]
    }
};

export async function searchMemoryExecutor(args: any) {
    const { query } = args;
    console.log(`[Tools] Executing semantic search for: "${query}"...`);
    
    const results = await querySemanticMemory(query, 3);
    
    if (results.length === 0) {
        return "Search completed. No relevant historical memories were found for that query.";
    }
    
    return `HISTORICAL MEMORIES FOUND:\n` + results.map((r, i) => `${i + 1}. ${r}`).join('\n\n');
}
