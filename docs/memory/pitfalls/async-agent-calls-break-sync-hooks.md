---
name: async-agent-calls-break-sync-hooks
description: Never write a hook that assumes the Agent tool call has finished; Agent calls run async, so PostToolUse fires before the subagent works.
type: pitfall
---
On 2026-09-07 DEC-058's RUNLOG-enforcement hook pair (checkpoint RUNLOG line count in PreToolUse, compare in PostToolUse on Agent|Task) blocked the very first real hub-planner delegation with a false positive. DEC-059 reverted both hooks; RUNLOG enforcement went back to prose-only (CLAUDE.md Delegation Rule 2). A correct check needs the `SubagentStop` event, deferred until its payload shape can be verified.

**Why:** Agent calls in this environment run in the background and return once launched, so PostToolUse fires before the subagent has done any work, not after it finishes.

**How to apply:** never write a hook that assumes Agent-tool completion. Pipe-test every new hook against real payload shapes, including allow cases (the case that should pass silently), before enabling it in settings.json.
