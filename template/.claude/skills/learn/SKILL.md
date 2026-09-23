---
name: learn
description: Close the learning loop at the end of a session. Records durable facts, lessons with evidence, and new or corrected skills, then promotes general ones to the template. Use when a session changed files, when the user corrected you, when a multi-step task succeeded, or when the Stop hook asks for it.
---

# Learn

Turn this session into knowledge the next session starts with. Keep the
conclusions and drop the journey.

## 1. Review

List what changed (`git status`, `git diff --stat`). Then list what cost
time: failed attempts, user corrections, and wrong assumptions. Quote the
evidence, such as an error line, a user message, or a command that failed.
If nothing cost time and nothing new was decided, say "nothing to learn"
and stop.

## 2. Memory

Write each new decision, constraint, or gotcha to `learning/MEMORY.md`.
Use one dated line per fact. Before you add a line, update or delete any
line it replaces. Skip anything the code, git history, or `AGENTS.md`
already records.

## 3. Lessons

Write one line to `learning/LESSONS.md` for each thing that went wrong:
`- YYYY-MM-DD [project|general] Lesson. Evidence: ... Do instead: ...`
A lesson without evidence is an opinion. Leave it out.

## 4. Skills

- If you worked out a multi-step procedure you will need again, or did the
  same steps a second time, write `.claude/skills/<name>/SKILL.md`. Give it
  frontmatter (`name`, `description`) and numbered steps with the exact
  commands.
- If you used an existing skill and had to deviate from it, patch the skill
  so the deviation becomes the new procedure.
- A rule that applies to every task goes in `AGENTS.md`, not in a skill.

## 5. Promote

If the path `../../template` exists, you are inside the monorepo. Apply
each `[general]` lesson or skill to the matching file under
`../../template/`. Then add `(promoted)` to the end of the lesson line.
Keep the template stack-agnostic, so leave out project names, stacks, and
paths. If `../../template` does not exist, do not promote anything.

## 6. Report

Tell the user in three lines or fewer: what you recorded, what you
promoted, and which skill you created or patched.
