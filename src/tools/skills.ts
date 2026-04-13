import fs from 'fs';
import path from 'path';
import { skillManager, type Skill } from "../skills/skillManager";
import type { ToolDefinition, ToolExecutionContext } from "../core/types";

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

export const skillsTool: ToolDefinition = {
  name: "manage_skills",
  description: "Manage and execute AI skills - reusable patterns that improve with use",
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "search", "get", "execute", "create", "improve", "import"],
        description: "The action to perform on skills"
      },
      skill_id: {
        type: "string",
        description: "ID of the skill (for get, execute, improve actions)"
      },
      query: {
        type: "string",
        description: "Search query (for search action)"
      },
      category: {
        type: "string",
        description: "Filter by category (for list action)"
      },
      context: {
        type: "string",
        description: "Context for skill execution (for execute action)"
      },
      goal: {
        type: "string",
        description: "Goal for skill creation (for create action)"
      },
      execution: {
        type: "string",
        description: "Execution process for skill creation (for create action)"
      },
      result: {
        type: "string",
        description: "Result for skill creation (for create action)"
      },
      feedback: {
        type: "string",
        description: "Feedback for skill improvement (for improve action)"
      },
      source_path: {
        type: "string",
        description: "Path to a SKILL.md file or directory tree to import from (for import action). Defaults to artifacts/hermes-agent/skills/ when omitted."
      }
    },
    required: ["action"]
  }
};

export async function handleManageSkills(
  args: any,
  context: ToolExecutionContext
): Promise<string> {
  const { action } = args;

  switch (action) {
    case "list":
      return listSkills(args.category);
    
    case "search":
      if (!args.query) {
        return "Error: query parameter is required for search action";
      }
      return searchSkills(args.query);
    
    case "get":
      if (!args.skill_id) {
        return "Error: skill_id parameter is required for get action";
      }
      return getSkill(args.skill_id);
    
    case "execute":
      if (!args.skill_id || !args.context) {
        return "Error: skill_id and context parameters are required for execute action";
      }
      return executeSkill(args.skill_id, args.context, context);
    
    case "create":
      if (!args.goal || !args.execution || !args.result) {
        return "Error: goal, execution, and result parameters are required for create action";
      }
      return createSkill(args.goal, args.execution, args.result, args.category);
    
    case "improve":
      if (!args.skill_id || !args.feedback) {
        return "Error: skill_id and feedback parameters are required for improve action";
      }
      return improveSkill(args.skill_id, args.feedback);

    case "import":
      return importSkillsFromHermes(args.source_path);
    
    default:
      return `Error: Unknown action '${action}'`;
  }
}

function listSkills(category?: string): string {
  const skills = skillManager.listSkills(category);
  
  if (skills.length === 0) {
    return category 
      ? `No skills found in category '${category}'.`
      : "No skills available.";
  }

  const output = [
    `Found ${skills.length} skill${skills.length === 1 ? "" : "s"}${category ? ` in category '${category}'` : ""}:\n`,
  ];

  skills.forEach(skill => {
    output.push(`**${skill.name}** (ID: ${skill.id})`);
    output.push(`- Category: ${skill.category}`);
    output.push(`- Description: ${skill.description}`);
    output.push(`- Usage: ${skill.usage_count} time${skill.usage_count === 1 ? "" : "s"}`);
    if (skill.tags.length > 0) {
      output.push(`- Tags: ${skill.tags.join(", ")}`);
    }
    output.push("");
  });

  return output.join("\n");
}

function searchSkills(query: string): string {
  const skills = skillManager.searchSkills(query);
  
  if (skills.length === 0) {
    return `No skills found matching '${query}'.`;
  }

  const output = [
    `Found ${skills.length} skill${skills.length === 1 ? "" : "s"} matching '${query}':\n`,
  ];

  skills.forEach(skill => {
    output.push(`**${skill.name}** (ID: ${skill.id})`);
    output.push(`- Category: ${skill.category}`);
    output.push(`- Description: ${skill.description}`);
    output.push(`- Usage: ${skill.usage_count} time${skill.usage_count === 1 ? "" : "s"}`);
    output.push("");
  });

  return output.join("\n");
}

function getSkill(skillId: string): string {
  const skill = skillManager.getSkill(skillId);
  
  if (!skill) {
    return `Skill not found: ${skillId}`;
  }

  return [
    `**${skill.name}** (ID: ${skill.id})`,
    `- Category: ${skill.category}`,
    `- Description: ${skill.description}`,
    `- Usage: ${skill.usage_count} time${skill.usage_count === 1 ? "" : "s"}`,
    `- Version: ${skill.version}`,
    `- Created: ${skill.created_at}`,
    skill.last_used ? `- Last used: ${skill.last_used}` : "",
    skill.tags.length > 0 ? `- Tags: ${skill.tags.join(", ")}` : "",
    "",
    "**Skill Content:**",
    skill.content
  ].filter(Boolean).join("\n");
}

async function executeSkill(
  skillId: string, 
  context: string, 
  toolContext: ToolExecutionContext
): Promise<string> {
  const result = await skillManager.executeSkill(skillId, context);
  
  if (!result.success) {
    return `Failed to execute skill: ${result.error}`;
  }

  let output = `Executed skill '${skillId}' successfully.\n\n`;
  output += `${result.output}`;
  
  if (result.improved_skill) {
    output += "\n\n*Note: This skill has been marked for potential improvement based on usage patterns.*";
  }

  return output;
}

async function createSkill(
  goal: string,
  execution: string,
  result: string,
  category?: string
): Promise<string> {
  try {
    const skillName = goal.split(" ").slice(0, 5).join(" ");
    const skill = await skillManager.createSkillFromExecution(
      skillName,
      goal,
      execution,
      result,
      category || "general"
    );

    return [
      `Created new skill '${skill.name}' (ID: ${skill.id})`,
      `- Category: ${skill.category}`,
      `- Description: ${skill.description}`,
      "",
      "The skill has been saved and can be used in future conversations."
    ].join("\n");
  } catch (error) {
    return `Failed to create skill: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
}

async function improveSkill(skillId: string, feedback: string): Promise<string> {
  const improved = await skillManager.improveSkill(skillId, feedback);
  
  if (!improved) {
    return `Failed to improve skill: ${skillId}`;
  }

  return [
    `Improved skill '${improved.name}' (ID: ${improved.id})`,
    `- Version: ${improved.version}`,
    `- Updated: ${improved.updated_at}`,
    "",
    "The skill has been updated with the feedback."
  ].join("\n");
}

function importSkillsFromHermes(sourcePath?: string): string {
  const defaultPath = path.resolve(process.cwd(), "artifacts", "hermes-agent", "skills");
  const resolvedPath = sourcePath ? path.resolve(process.cwd(), sourcePath) : defaultPath;

  if (!fs.existsSync(resolvedPath)) {
    return `Error: Path not found: ${resolvedPath}`;
  }

  const stat = fs.statSync(resolvedPath);
  if (stat.isFile()) {
    const category = path.basename(path.dirname(resolvedPath));
    const skill = skillManager.importHermesSkill(resolvedPath, category);
    if (!skill) {
      return `Failed to import skill from ${resolvedPath}. Check that the file has valid YAML frontmatter.`;
    }
    return `Imported skill '${skill.name}' (ID: ${skill.id}) in category '${skill.category}'.`;
  }

  const count = skillManager.scanAndImportFromDirectory(resolvedPath);
  if (count === 0) {
    return `No SKILL.md files found in ${resolvedPath}. The directory may already be up to date or contains no importable skills.`;
  }
  return `Successfully imported ${count} skill${count === 1 ? "" : "s"} from ${resolvedPath}. Use 'list' to see all available skills.`;
}

// Auto-skill creation hook for complex tasks
export async function considerSkillCreation(
  goal: string,
  steps: any[],
  result: string,
  sessionId: string
): Promise<void> {
  // Only create skills for complex, successful tasks
  if (steps.length < 3 || !result || result.includes("error") || result.includes("failed")) {
    return;
  }

  // Check if similar skill already exists
  const existingSkills = skillManager.searchSkills(goal);
  if (existingSkills.length > 0) {
    return;
  }

  try {
    const execution = steps.map(step => 
      `${step.tool || 'step'}: ${step.input || step.description || ''}`
    ).join("\n");

    await skillManager.createSkillFromExecution(
      goal,
      execution,
      result,
      "auto-generated"
    );

    console.log(`[Skills] Auto-created skill for: ${goal}`);
  } catch (error) {
    console.error("[Skills] Auto-creation failed:", error);
  }
}
