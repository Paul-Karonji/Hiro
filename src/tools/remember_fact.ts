import { dbQueries } from "../memory/sqlite";

export const rememberFactDeclaration = {
    name: "remember_fact",
    description: "Explicitly store a durable fact about the user into core memory. Use this when the user directly asks you to remember something specific.",
    parameters: {
        type: "OBJECT",
        properties: {
            fact: {
                type: "STRING",
                description: "The concise fact to remember (e.g., 'User lives in Paris', 'User loves Python')."
            }
        },
        required: ["fact"]
    }
};

export async function rememberFactExecutor(args: any) {
    const { fact } = args;
    dbQueries.addCoreFact(fact);
    return `Successfully memorized fact: ${fact}`;
}
