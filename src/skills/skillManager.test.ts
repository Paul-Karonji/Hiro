import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { SkillManager } from "./skillManager";

const TMP_DIR = join(process.cwd(), "data", "_test_skills_tmp");
const HERMES_SKILL_CONTENT = `---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior.
version: 1.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [debugging, troubleshooting, root-cause]
    related_skills: [test-driven-development]
---

# Systematic Debugging

Random fixes waste time. Always find root cause before fixing.
`;

function setupTmpSkillFile(dir: string, filename: string, content: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), content, "utf-8");
}

test("importHermesSkill parses Hermes SKILL.md frontmatter correctly", () => {
  const skillDir = join(TMP_DIR, "hermes-import-single");
  const skillPath = join(skillDir, "SKILL.md");
  setupTmpSkillFile(skillDir, "SKILL.md", HERMES_SKILL_CONTENT);

  const manager = new SkillManager();
  const skill = manager.importHermesSkill(skillPath, "software-development");

  assert.ok(skill, "importHermesSkill should return a skill object");
  assert.equal(skill!.name, "systematic-debugging");
  assert.equal(skill!.description, "Use when encountering any bug, test failure, or unexpected behavior.");
  assert.equal(skill!.category, "software-development");
  assert.equal(skill!.version, 1);
  assert.ok(skill!.tags.includes("debugging"), "tags should include 'debugging'");
  assert.ok(skill!.tags.includes("troubleshooting"), "tags should include 'troubleshooting'");
  assert.ok(skill!.id.startsWith("hermes-"), "id should be prefixed with 'hermes-'");
  assert.equal(skill!.usage_count, 0);
  assert.equal(skill!.last_used, null);

  rmSync(TMP_DIR, { recursive: true, force: true });
});

test("importHermesSkill returns null for files without frontmatter", () => {
  const skillDir = join(TMP_DIR, "hermes-bad");
  setupTmpSkillFile(skillDir, "SKILL.md", "# No frontmatter here\nJust content.");

  const manager = new SkillManager();
  const skill = manager.importHermesSkill(join(skillDir, "SKILL.md"), "general");

  assert.equal(skill, null);
  rmSync(TMP_DIR, { recursive: true, force: true });
});

test("scanAndImportFromDirectory returns 0 for non-existent path", () => {
  const manager = new SkillManager();
  const count = manager.scanAndImportFromDirectory(join(TMP_DIR, "does-not-exist"));
  assert.equal(count, 0);
});

test("scanAndImportFromDirectory finds SKILL.md files recursively and imports them", () => {
  const rootDir = join(TMP_DIR, "hermes-scan");
  const subDir1 = join(rootDir, "software-development", "systematic-debugging");
  const subDir2 = join(rootDir, "research", "arxiv");

  setupTmpSkillFile(subDir1, "SKILL.md", HERMES_SKILL_CONTENT);
  setupTmpSkillFile(
    subDir2,
    "SKILL.md",
    `---
name: arxiv-search
description: Search and retrieve academic papers from arXiv.
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [research, papers, arxiv]
---

# arXiv Search Skill

Use the arXiv API to find relevant academic papers.
`,
  );

  const manager = new SkillManager();
  const count = manager.scanAndImportFromDirectory(rootDir);

  assert.equal(count, 2, "should import exactly 2 skills");

  const skills = manager.listSkills();
  const names = skills.map((s) => s.name);
  assert.ok(names.includes("systematic-debugging"), "should include systematic-debugging");
  assert.ok(names.includes("arxiv-search"), "should include arxiv-search");

  rmSync(TMP_DIR, { recursive: true, force: true });
});

test("importHermesSkill skips already-imported skills without overwriting", () => {
  const skillDir = join(TMP_DIR, "hermes-dedup");
  setupTmpSkillFile(skillDir, "SKILL.md", HERMES_SKILL_CONTENT);

  const manager = new SkillManager();
  const first = manager.importHermesSkill(join(skillDir, "SKILL.md"), "general");
  const second = manager.importHermesSkill(join(skillDir, "SKILL.md"), "general");

  assert.ok(first);
  assert.ok(second);
  assert.equal(first!.id, second!.id, "same id should be returned on duplicate import");

  rmSync(TMP_DIR, { recursive: true, force: true });
});
