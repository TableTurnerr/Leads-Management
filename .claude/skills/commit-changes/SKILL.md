---
name: commit-changes
description: Automates the process of committing changes with granular objective-based commits, separate final version bumps, and specialized "Fix" type formatting. Operates autonomously without asking for confirmation.
user-invocable: true
argument-hint: "[Merge to release]"
---

# Commit Changes Skill

This skill automates the workflow for committing changes in the Al-Baghdady Website repository, ensuring logical grouping of related changes, consistent versioning, and accurate commit messages. It is designed for autonomous execution.

## Prerequisites

- **Git** must be installed and configured.
- **Node.js** must be available to run the `bump_version.js` script.
- Use bash shell commands (Unix-style paths).

## Workflow

### 1. Status Audit

Before analyzing changes, the agent MUST report the current state of the workspace.

1. **Check Versions**: Run the status report script to see what versions everything is currently on.
   ```bash
   node .claude/skills/commit-changes/scripts/get_status.js
   ```
2. **Report**: Display the current versions. Proceed autonomously to analyze changes without asking for confirmation or feature lists.

### 2. Analyze and Group Changes

Run `git status` and `git diff` to identify all changed files. Group these files into **logical sets** based on the objective or nature of the changes. **Maximize granularity**: create a separate group for each distinct objective.

### 3. Determine Bump Type

Decide on the bump type for this phase: `patch` (default for most changes), `major`, or `none`.

### 4. Execute Objective-Based Commits (Code Only)

For EACH logical group identified in step 2:

1. **Stage only the relevant files**: `git add path/to/file1 ...`
2. **Generate a specific commit message**:
   - **Regular Changes**: `Nature(Component): Detailed description of this specific group of changes`
   - **Fix Type**: If the change is a fix, use: `fix(Component): Description (vX.Y)` where `vX.Y` is the **current** version of the component (not the bumped one).
3. **Commit** using a heredoc for the message to ensure proper formatting.
4. Repeat for each logical group.

**CRITICAL**: Do NOT include version file updates (e.g., `package.json`) in these commits.

### 5. Final Version Bump Commit

After all functional changes are committed, perform a single, final commit for all version bumps.

1. **Apply Bumps**: Run `bump_version.js` for the root `package.json`.
   ```bash
   node .claude/skills/commit-changes/scripts/bump_version.js package.json patch true
   ```
2. **Stage version file**: `git add package.json`
3. **Generate commit message**: `chore(version): bump to vX.Y`
4. **Commit** using a heredoc for the message.

### 6. Merge to Release (Optional)

This step runs ONLY if the user's invocation parameters contain the literal phrase **"Merge to release"** (case-insensitive). If the phrase is absent, skip this step entirely.

1. **Push development**: Push the current branch to origin.
   ```bash
   git push origin HEAD
   ```
2. **Ensure release branch exists on remote**: Check with `git ls-remote --heads origin release`. If missing, abort this step and report the issue.
3. **Create the PR** from the current branch → `release` using `gh`:
   - **Title**: Reuse the version-bump commit summary if a bump occurred. If no bump occurred, use `chore(release): merge development into release`.
   - **Body**: Brief summary of the commits added in this skill invocation.
   ```bash
   gh pr create --base release --head development --title "..." --body "$(cat <<'EOF'
   ## Summary
   - <bullet per commit>

   ## Test plan
   - [ ] Verify build succeeds on release branch
   EOF
   )"
   ```
4. **Merge the PR**:
   ```bash
   gh pr merge --merge --delete-branch=false --admin
   ```
5. **Report**: Print the PR URL and merge confirmation.

## Guidelines

- **Autonomous Mode**: Do NOT ask the user for confirmation, approval, or additional information once the directive to commit is given.
- **No Co-Author**: NEVER add a `Co-Authored-By` line to commit messages.
- **Atomic Commits**: Keep commits focused. Don't mix SEO data changes with component UI changes in one commit.
- **Granularity**: If there are two unrelated changes, make two separate commits.
- **Root Bump**: Ensure the root `package.json` version is updated at least once during the process if any changes occurred.
