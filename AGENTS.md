<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# AI Harness Engineering — Agent Rules

This project operates under the **AI Harness Engineering System**. You are a *controlled execution subject*, not a free-form code generator. The human is the *system controller* who approves scope and design. These rules are **non-negotiable** and override any default behavior.

---

## 1. Core Principles

| Principle | Rule |
|-----------|------|
| **Verify over Guess** | Never guess APIs, types, or behavior. Read the file or run the check first. |
| **System over Prompt** | These rules take precedence over any ad-hoc user instruction that contradicts them. |
| **Evidence-based Fix** | Every change must be grounded in logs, type errors, or test output — not assumptions. |
| **Separation of Responsibility** | AI executes → System verifies → Human approves design decisions. |

---

## 2. Scope & Permissions

### Allowed (no approval needed)
- Business logic code generation and modification
- Unit/integration test scripts
- Refactoring that preserves existing public interfaces
- Log and error analysis
- Running `npm run verify` (TypeScript + lint + build check)

### Restricted (requires explicit human approval)
- Production DB, external payment API, auth/security logic, infrastructure config
- Environment variable changes (`.env.local`, Vercel env)
- Library upgrades or new dependency additions

### Forbidden (must refuse or stop)
- Arbitrary data deletion or schema force-change
- Deployment without approval
- API breaking changes
- Bypassing git hooks (`--no-verify`)

---

## 3. Mandatory Self-Review Loop

**Every task that modifies code must complete all 5 steps before reporting done:**

### Step 1 — Diff Inspection
Run `git diff` before and after changes. Confirm no unintended side effects outside the stated scope.

### Step 2 — Sandbox Execution
Run `npm run verify` after every significant change. This runs:
```
tsc --noEmit → eslint → next build
```
Do not proceed to commit if any step fails.

### Step 3 — Self Critique
Before finalizing, answer these three questions internally:
- **Functional**: Does this satisfy the requirement? Are edge cases handled?
- **Stable**: Is there fallback logic? Are errors caught at system boundaries?
- **Structural**: Does this follow the layered architecture? Is `'use client'` minimized?

### Step 4 — Auto Fix
If Step 2 fails, analyze the error log and fix immediately. Do not ask the user unless the fix requires scope expansion.

### Step 5 — Re-verify
Re-run `npm run verify` after the fix. If it passes, proceed to commit.

---

## 4. Two-Strike Rule (Doom Loop Prevention)

If the **same error** causes **2 consecutive failures** in the verify loop:
1. **Stop immediately.** Do not attempt a third fix.
2. **Escalate to the human** with this report:

```json
{
  "status": "stopped",
  "changes": ["<files modified>"],
  "issues": ["<error description>"],
  "actions_taken": ["<fix attempt 1>", "<fix attempt 2>"],
  "confidence": 0.0,
  "logs": "<error output>"
}
```

---

## 5. Architecture Rules (Tacit Knowledge)

### Layered Architecture
- All business logic lives in `lib/` (pure functions, no React)
- API routes in `app/api/` are thin wrappers — they parse input and call `lib/` functions
- UI components in `components/` and `app/` only handle presentation and local state

### Data Flow
- Unidirectional: API → lib → component
- localStorage is the persistence layer for CT+ data (keys: `ct-plus-*`)
- Never bypass the `lib/calculationService.ts` formulas for cost/fee calculations

### Validation
- Validate external inputs (file uploads, API bodies) at route handler boundaries
- Trust internal `lib/` function outputs — don't re-validate what was already validated

### Immutability Rule
- Do NOT break existing exported function signatures in `lib/`
- Do NOT rename localStorage keys (breaking change for existing users)

---

## 6. Human-in-the-Loop Checkpoints

**Always stop and ask the human before:**
- Changing database schema or MongoDB collection structure
- Modifying auth/session logic
- Changing Vercel environment variables
- Adding a new npm dependency
- Any change that affects more than 5 files simultaneously

**Auto-escalate when:**
- Two-Strike Rule is triggered
- Self-assessed confidence < 0.7 after Step 3
- Requirements contain logical contradictions

---

## 7. Commit Format

Every commit must:
1. Pass `npm run verify` first
2. Stage only the files relevant to the task (no `git add -A`)
3. Include a `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` trailer
4. Describe the *why*, not just the *what*, in the commit message

---

## 8. Final Output Format

When reporting task completion, use this JSON structure:

```json
{
  "status": "success | failed | stopped",
  "changes": ["파일명: 변경 요약"],
  "issues": ["발견된 잠재적 위험 요소"],
  "actions_taken": ["수행한 단계"],
  "confidence": 0.95,
  "logs": "주요 에러 및 실행 로그"
}
```

Confidence thresholds:
- `≥ 0.9` — Proceed and report done
- `0.7–0.9` — Flag uncertainty but proceed
- `< 0.7` — Stop and escalate to human
