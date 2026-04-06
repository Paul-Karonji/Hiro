import fs from 'fs/promises';
import { existsSync, statSync } from 'fs';
import path from 'path';
import { extractDocumentText } from "../documents/extract";

// Allowed root for file operations (to prevent escaping and touching system files)
const ALLOWED_ROOT = process.cwd();
const MAX_READABLE_FILE_BYTES = 15 * 1024 * 1024;

// Helper to sanitize and validate file paths
function resolveAndValidatePath(unsafePath: string): string {
    const resolvedPath = path.resolve(ALLOWED_ROOT, unsafePath);
    if (!resolvedPath.startsWith(ALLOWED_ROOT)) {
        throw new Error(`Path access denied: ${unsafePath}. You can only access files within ${ALLOWED_ROOT}`);
    }
    return resolvedPath;
}

export const fileToolsDefinitions = [
    {
        name: "read_file",
        description: "Read text from a local file. Supports plain-text files, PDFs, and DOCX documents.",
        parameters: {
            type: "OBJECT",
            properties: {
                filePath: { type: "STRING", description: "Relative path to the file (e.g., 'data/notes.txt')." }
            },
            required: ["filePath"]
        }
    },
    {
        name: "write_file",
        description: "Write content to a file. Overwrites if it exists.",
        parameters: {
            type: "OBJECT",
            properties: {
                filePath: { type: "STRING", description: "Relative path to the file." },
                content: { type: "STRING", description: "The content to write." }
            },
            required: ["filePath", "content"]
        }
    },
    {
        name: "list_directory",
        description: "List the contents of a directory.",
        parameters: {
            type: "OBJECT",
            properties: {
                dirPath: { type: "STRING", description: "Relative path to the directory (e.g., '.', 'data', 'src')." }
            },
            required: ["dirPath"]
        }
    },
    {
        name: "delete_file",
        description: "Delete a file. Cannot be undone.",
        parameters: {
            type: "OBJECT",
            properties: {
                filePath: { type: "STRING", description: "Relative path to the file." }
            },
            required: ["filePath"]
        }
    }
];

export async function readFile(args: Record<string, any>): Promise<string> {
    try {
        const filePath = args.filePath ?? args.path;
        if (!filePath || typeof filePath !== 'string') {
            return "Error: Missing or invalid 'filePath' argument.";
        }
        const target = resolveAndValidatePath(filePath);
        if (!existsSync(target)) return `Error: File not found at ${target}`;
        
        const stats = statSync(target);
        if (stats.size > MAX_READABLE_FILE_BYTES) {
            return `Error: File is too large to read (Max ${Math.floor(MAX_READABLE_FILE_BYTES / (1024 * 1024))}MB).`;
        }

        const buffer = await fs.readFile(target);
        const extracted = await extractDocumentText({
            data: buffer,
            filename: path.basename(target),
        });
        return extracted.text;
    } catch (e: any) {
        return `Error reading file: ${e.message}`;
    }
}

export async function writeFile(args: Record<string, any>): Promise<string> {
    try {
        const filePath = args.filePath ?? args.path;
        if (!filePath || typeof filePath !== 'string') {
            return "Error: Missing or invalid 'filePath' argument.";
        }
        const target = resolveAndValidatePath(filePath);
        
        // Ensure parent directory exists
        const dir = path.dirname(target);
        if (!existsSync(dir)) {
            await fs.mkdir(dir, { recursive: true });
        }

        await fs.writeFile(target, args.content, 'utf-8');
        return `Successfully wrote to ${args.filePath}`;
    } catch (e: any) {
        return `Error writing file: ${e.message}`;
    }
}

export async function listDirectory(args: Record<string, any>): Promise<string> {
    try {
        const dirPath = args.dirPath ?? args.path ?? '.';
        if (typeof dirPath !== 'string') {
            return "Error: 'dirPath' must be a string.";
        }
        const target = resolveAndValidatePath(dirPath);
        if (!existsSync(target)) return `Error: Directory not found at ${target}`;

        const items = await fs.readdir(target, { withFileTypes: true });
        const list = items.map(item => `${item.isDirectory() ? '[DIR] ' : '[FILE]'} ${item.name}`).join('\n');
        
        return list || "(Empty directory)";
    } catch (e: any) {
        return `Error listing directory: ${e.message}`;
    }
}

export async function deleteFile(args: Record<string, any>): Promise<string> {
    try {
        const filePath = args.filePath ?? args.path;
        if (!filePath || typeof filePath !== 'string') {
            return "Error: Missing or invalid 'filePath' argument.";
        }
        const target = resolveAndValidatePath(filePath);
        if (!existsSync(target)) return `Error: File not found at ${target}`;

        await fs.unlink(target);
        return `Successfully deleted ${args.filePath}`;
    } catch (e: any) {
        return `Error deleting file: ${e.message}`;
    }
}
