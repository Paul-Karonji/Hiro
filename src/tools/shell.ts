import { exec } from 'child_process';
import { promisify } from 'util';
import { requestUserApproval } from '../agent/approvals';

const execAsync = promisify(exec);

export const shellToolDefinition = {
    name: "run_shell_command",
    description: "Execute a shell command on the host machine. Use ONLY for local automation tasks. Requires user approval before execution.",
    parameters: {
        type: "OBJECT",
        properties: {
            command: {
                type: "STRING",
                description: "The full shell command string to execute (e.g., 'ls -la', 'npm list', 'curl -I http://example.com')."
            },
            reason: {
                type: "STRING",
                description: "Short explanation of WHY you are running this command, to be reviewed by the user."
            }
        },
        required: ["command", "reason"]
    }
};

export async function runShellCommand(args: Record<string, any>): Promise<string> {
    const { command, reason } = args;

    if (!command) return "Error: No command provided.";

    console.log(`[Shell Tool] Requesting approval for: ${command}`);

    // Pause agent execution and request interactive Telegram approval
    const isApproved = await requestUserApproval(
        "🧠 Agent Wants to Run a Command:",
        `Reason: ${reason || 'Not provided'}\n\n$ ${command}`
    );

    if (!isApproved) {
        console.log(`[Shell Tool] Denied by user or timed out.`);
        return "ERROR: The user DENIED authorization for this command, or approval timed out. Do not attempt again automatically.";
    }

    console.log(`[Shell Tool] Approved. Executing: ${command}`);

    try {
        const { stdout, stderr } = await execAsync(command, { timeout: 15000 }); // strict 15s execution timeout

        let output = "";
        if (stdout) output += `STDOUT:\n${stdout}\n`;
        if (stderr) output += `STDERR:\n${stderr}\n`;

        if (!output) output = "[Command completed with no output]";

        // Truncate massively so we don't blow up the Gemini context
        if (output.length > 5000) {
            output = output.substring(0, 5000) + "\n\n...[OUTPUT TRUNCATED DUE TO LENGTH]...";
        }

        return output;
    } catch (error: any) {
        return `EXECUTION ERROR:\n${error.message || String(error)}`;
    }
}
