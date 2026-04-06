import fs from 'fs';
import path from 'path';

/**
 * Reads all `.md` files in the /data/skills directory.
 * If the directory doesn't exist, it auto-creates it with an example skill.
 * Returns the aggregated text to be injected into the Gemini System Instruction.
 */
export function loadSkillsAsPrompt(): string {
    const skillsDir = path.resolve(process.cwd(), 'data/skills');
    
    // Ensure the skills directory exists
    if (!fs.existsSync(skillsDir)) {
        try {
            fs.mkdirSync(skillsDir, { recursive: true });
            fs.writeFileSync(
                path.join(skillsDir, 'example.md'), 
                'If the user asks for a pirate joke, you MUST tell one.\n'
            );
        } catch (e) {
            console.error("[Skills] Could not create skills directory.", e);
            return "";
        }
    }

    try {
        const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
        if (files.length === 0) return "";

        let combinedSkills = "\n\n=== CUSTOM INJECTED SKILLS AND RULES ===\n";
        for (const file of files) {
            const content = fs.readFileSync(path.join(skillsDir, file), 'utf-8');
            combinedSkills += `\n--- Skill Profile: ${file} ---\n${content}\n`;
        }
        return combinedSkills + "=======================================\n\n";
    } catch (e: any) {
        console.error("[Skills] Failed to load skills:", e.message);
        return "";
    }
}
