import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getAppContext } from "../core/appContext";
import { generateText } from "ai";

const SKILLS_DIR = join(process.cwd(), "data", "skills");

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  content: string;
  usage_count: number;
  last_used: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface SkillExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  improved_skill?: boolean;
}

export class SkillManager {
  private skillsCache: Map<string, Skill> = new Map();

  constructor() {
    this.ensureSkillsDirectory();
    this.loadSkills();
  }

  private ensureSkillsDirectory() {
    if (!existsSync(SKILLS_DIR)) {
      mkdirSync(SKILLS_DIR, { recursive: true });
    }
  }

  private loadSkills() {
    try {
      const files = require("fs").readdirSync(SKILLS_DIR);
      for (const file of files) {
        if (file.endsWith(".md")) {
          const skillId = file.slice(0, -3);
          const skill = this.loadSkillFromFile(skillId);
          if (skill) {
            this.skillsCache.set(skillId, skill);
          }
        }
      }
      console.log(`[Skills] Loaded ${this.skillsCache.size} skills from disk.`);
    } catch (error) {
      console.error("[Skills] Failed to load skills:", error);
    }
  }

  private loadSkillFromFile(skillId: string): Skill | null {
    try {
      const filePath = join(SKILLS_DIR, `${skillId}.md`);
      const content = readFileSync(filePath, "utf-8");
      
      // Parse frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) {
        console.warn(`[Skills] Invalid skill format: ${skillId}`);
        return null;
      }

      const frontmatter = frontmatterMatch[1];
      const skillContent = frontmatterMatch[2];
      
      const metadata: any = {};
      frontmatter.split("\n").forEach(line => {
        const [key, ...valueParts] = line.split(":");
        if (key && valueParts.length > 0) {
          const value = valueParts.join(":").trim();
          if (key === "tags") {
            metadata[key] = value.split(",").map(t => t.trim());
          } else if (key === "usage_count" || key === "version") {
            metadata[key] = parseInt(value, 10);
          } else {
            metadata[key] = value.replace(/^["']|["']$/g, "");
          }
        }
      });

      return {
        id: skillId,
        name: metadata.name || skillId,
        description: metadata.description || "",
        category: metadata.category || "general",
        tags: metadata.tags || [],
        content: skillContent.trim(),
        usage_count: metadata.usage_count || 0,
        last_used: metadata.last_used || null,
        created_at: metadata.created_at || new Date().toISOString(),
        updated_at: metadata.updated_at || new Date().toISOString(),
        version: metadata.version || 1,
      };
    } catch (error) {
      console.error(`[Skills] Failed to load skill ${skillId}:`, error);
      return null;
    }
  }

  private saveSkillToFile(skill: Skill) {
    try {
      const filePath = join(SKILLS_DIR, `${skill.id}.md`);
      
      const frontmatter = [
        `name: "${skill.name}"`,
        `description: "${skill.description}"`,
        `category: "${skill.category}"`,
        `tags: ${JSON.stringify(skill.tags)}`,
        `usage_count: ${skill.usage_count}`,
        `last_used: ${skill.last_used || "null"}`,
        `created_at: ${skill.created_at}`,
        `updated_at: ${skill.updated_at}`,
        `version: ${skill.version}`,
      ].join("\n");

      const content = `---\n${frontmatter}\n---\n\n${skill.content}`;
      writeFileSync(filePath, content, "utf-8");
    } catch (error) {
      console.error(`[Skills] Failed to save skill ${skill.id}:`, error);
    }
  }

  listSkills(category?: string): Skill[] {
    const skills = Array.from(this.skillsCache.values());
    return category 
      ? skills.filter(s => s.category === category)
      : skills;
  }

  getSkill(skillId: string): Skill | null {
    return this.skillsCache.get(skillId) || null;
  }

  searchSkills(query: string): Skill[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.skillsCache.values()).filter(skill =>
      skill.name.toLowerCase().includes(lowerQuery) ||
      skill.description.toLowerCase().includes(lowerQuery) ||
      skill.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
      skill.content.toLowerCase().includes(lowerQuery)
    );
  }

  async createSkillFromExecution(
    name: string,
    goal: string,
    execution: string,
    result: string,
    category: string = "general"
  ): Promise<Skill> {
    const skillId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    
    // Use LLM to extract and format the skill
    const app = getAppContext();
    const response = await generateText({
      model: app.providerRouter.resolveChatModel(app.modelState.getCurrentModel()),
      system: `You are an AI skill extraction expert. Create a reusable skill from a successful task execution.
      
The skill should be:
1. General enough to apply to similar situations
2. Specific enough to be useful
3. Include clear steps or patterns
4. Capture the key insight or approach that made it successful`,
      messages: [
        {
          role: "user",
          content: `Create a skill based on this successful execution:

Goal: ${goal}

Execution Process:
${execution}

Result: ${result}

Extract the core pattern or approach into a reusable skill. Format your response as markdown with:
- Clear description of when to use this skill
- Step-by-step process
- Key considerations or tips
- Example usage if helpful`
        }
      ]
    });

    const content = response.text || "Skill extraction failed.";
    
    const skill: Skill = {
      id: skillId,
      name,
      description: `Auto-generated skill for: ${goal}`,
      category,
      tags: this.extractTags(goal, content),
      content,
      usage_count: 0,
      last_used: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1,
    };

    this.skillsCache.set(skillId, skill);
    this.saveSkillToFile(skill);
    
    console.log(`[Skills] Created new skill: ${skillId}`);
    return skill;
  }

  private extractTags(goal: string, content: string): string[] {
    const tags = new Set<string>();
    
    // Extract from goal
    const goalWords = goal.toLowerCase().match(/\b\w{3,}\b/g) || [];
    goalWords.forEach(word => {
      if (["create", "build", "implement", "design", "analyze", "optimize"].includes(word)) {
        tags.add(word);
      }
    });
    
    // Add category-based tags
    if (content.includes("code") || content.includes("programming")) {
      tags.add("coding");
    }
    if (content.includes("data") || content.includes("analysis")) {
      tags.add("data");
    }
    if (content.includes("write") || content.includes("document")) {
      tags.add("writing");
    }
    
    return Array.from(tags).slice(0, 5);
  }

  async executeSkill(skillId: string, context: string): Promise<SkillExecutionResult> {
    const skill = this.getSkill(skillId);
    if (!skill) {
      return { success: false, error: `Skill not found: ${skillId}` };
    }

    try {
      const app = getAppContext();
      
      // Build prompt with skill and context
      const response = await generateText({
        model: app.providerRouter.resolveChatModel(app.modelState.getCurrentModel()),
        system: `You are executing a pre-defined skill. Apply this skill pattern to the user's context.
        
Skill: ${skill.name}
Description: ${skill.description}

${skill.content}

Apply this skill pattern to the user's situation. Adapt as needed but follow the core approach.`,
        messages: [
          {
            role: "user",
            content: `Context: ${context}`
          }
        ]
      });

      // Update usage statistics
      skill.usage_count += 1;
      skill.last_used = new Date().toISOString();
      skill.updated_at = new Date().toISOString();
      
      this.saveSkillToFile(skill);

      // Check if skill should be improved
      const shouldImprove = await this.shouldImproveSkill(skill, context, response.text || "");
      
      return {
        success: true,
        output: response.text || "",
        improved_skill: shouldImprove,
      };
    } catch (error) {
      console.error(`[Skills] Failed to execute skill ${skillId}:`, error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }

  private async shouldImproveSkill(
    skill: Skill, 
    context: string, 
    result: string
  ): Promise<boolean> {
    // Simple heuristic: if skill has been used many times, consider improvement
    if (skill.usage_count > 10 && skill.version < 3) {
      return true;
    }
    
    // Could add more sophisticated logic here
    return false;
  }

  async improveSkill(skillId: string, feedback: string): Promise<Skill | null> {
    const skill = this.getSkill(skillId);
    if (!skill) {
      return null;
    }

    try {
      const app = getAppContext();
      
      const response = await generateText({
        model: app.providerRouter.resolveChatModel(app.modelState.getCurrentModel()),
        system: `You are improving an existing AI skill based on usage feedback.
        
Current skill:
${skill.content}

Feedback: ${feedback}

Improve the skill by:
1. Addressing the feedback
2. Making it more robust
3. Adding edge case handling
4. Improving clarity

Return the improved skill content only.`,
        messages: [
          {
            role: "user",
            content: "Please improve this skill based on the feedback provided."
          }
        ]
      });

      skill.content = response.text || skill.content;
      skill.version += 1;
      skill.updated_at = new Date().toISOString();
      
      this.saveSkillToFile(skill);
      this.skillsCache.set(skillId, skill);
      
      console.log(`[Skills] Improved skill: ${skillId} (v${skill.version})`);
      return skill;
    } catch (error) {
      console.error(`[Skills] Failed to improve skill ${skillId}:`, error);
      return null;
    }
  }
}

// Singleton instance
export const skillManager = new SkillManager();
