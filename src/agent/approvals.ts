import { EventEmitter } from 'events';

export const approvalHandler = new EventEmitter();

export async function requestUserApproval(prompt: string, details: string): Promise<boolean> {
    const id = Date.now().toString() + "_" + Math.floor(Math.random() * 1000);
    
    return new Promise((resolve) => {
        // Broadcast the request so the Telegram integration can catch it and send a message
        approvalHandler.emit('request', { id, prompt, details });
        
        const onResolve = (approved: boolean) => {
            clearTimeout(timeoutId);
            resolve(approved);
        };

        approvalHandler.once(`resolve_${id}`, onResolve);
        
        // Timeout after 60 seconds (reject by default)
        const timeoutId = setTimeout(() => {
            approvalHandler.removeAllListeners(`resolve_${id}`);
            resolve(false);
        }, 60000);
    });
}
