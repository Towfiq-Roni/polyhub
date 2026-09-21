export const meta = {
  name: 'hub-quality-chain',
  description: "Runs hub's Plan->Build->Review->Test->CodeReview->Gate pipeline for one task, looping REROUTEs back to Build (or Plan) automatically instead of the orchestrator manually calling each stage.",
  phases: [
    { title: 'Plan' },
    { title: 'Build' },
    { title: 'Gate' },
  ],
}

// DEC-058. Codifies Workflow.md's pipeline as a deterministic script instead of
// ad hoc orchestrator Task/Agent calls. UNEXERCISED against a real task as of
// authoring — read docs/agentic/RUNLOG.md after the first real run and fix
// this script rather than trusting it blindly. Still requires the user's
// per-run opt-in to invoke (this file existing does not bypass that).
//
// args: { taskDescription: string, maxCycles?: number }

const MAX_CYCLES = (args && args.maxCycles) || 3

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    specPath: { type: 'string' },
    objective: { type: 'string' },
    batches: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          files: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
        },
        required: ['files', 'description'],
      },
    },
  },
  required: ['specPath', 'batches'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    findings: { type: 'string' },
  },
  required: ['verdict'],
}

function batchLabel(batch) {
  return (batch.files && batch.files[0]) || 'batch'
}

phase('Plan')
const task = args && args.taskDescription
if (!task) throw new Error('args.taskDescription is required (the task text a hub-planner run would receive)')

let plan = await agent(
  `You are being run by the automated hub-quality-chain workflow, not the interactive orchestrator. ` +
  `Task: ${task}. Follow your normal procedure exactly (read requirements, write the spec file to docs/agentic/build-specs/, ` +
  `append one RUNLOG.md line). In ADDITION to your normal output, return structured JSON per the schema: specPath, ` +
  `objective, and batches (each with its file list and a self-contained description an implementer can execute with no other context).`,
  { agentType: 'hub-planner', phase: 'Plan', label: 'plan', schema: PLAN_SCHEMA }
)
if (!plan || !plan.batches || !plan.batches.length) {
  throw new Error('hub-planner produced no usable batch plan')
}

let cycle = 0
let gateVerdict = null

while (cycle < MAX_CYCLES) {
  cycle++
  log(`Cycle ${cycle}/${MAX_CYCLES}: building ${plan.batches.length} batch(es) from ${plan.specPath}`)

  const batchResults = await pipeline(
    plan.batches,
    async (_prev, batch) => {
      let passed = false
      let lastReason = ''
      for (let attempt = 1; attempt <= MAX_CYCLES && !passed; attempt++) {
        phase('Build')
        await agent(
          `Implement this batch end-to-end: ${batch.description}\nFiles: ${batch.files.join(', ')}\nSpec: ${plan.specPath}` +
          (lastReason ? `\nPrevious attempt was rejected: ${lastReason}` : ''),
          { agentType: 'hub-implementer', phase: 'Build', label: `build:${batchLabel(batch)}` }
        )

        const review = await agent(
          `Review the change just implemented for batch: ${batch.description} (files: ${batch.files.join(', ')}). Report PASS/FAIL per your standard checklist.`,
          { agentType: 'hub-reviewer', phase: 'Build', label: `reviewer:${batchLabel(batch)}`, schema: VERDICT_SCHEMA }
        )
        if (review && /FAIL/i.test(review.verdict || '')) {
          lastReason = `hub-reviewer FAIL: ${review.findings}`
          log(`Batch ${batchLabel(batch)}: ${lastReason} — rebuilding (attempt ${attempt}/${MAX_CYCLES})`)
          continue
        }

        const tested = await agent(
          `Empirically verify batch: ${batch.description} (files: ${batch.files.join(', ')}). Run the actual gates and task-relevant checks.`,
          { agentType: 'hub-tester', phase: 'Build', label: `tester:${batchLabel(batch)}`, schema: VERDICT_SCHEMA }
        )
        if (tested && /FAIL/i.test(tested.verdict || '')) {
          lastReason = `hub-tester FAIL: ${tested.findings}`
          log(`Batch ${batchLabel(batch)}: ${lastReason} — rebuilding (attempt ${attempt}/${MAX_CYCLES})`)
          continue
        }

        const codeReview = await agent(
          `Two-axis code review for batch: ${batch.description} (files: ${batch.files.join(', ')}).`,
          { agentType: 'hub-code-reviewer', phase: 'Build', label: `codereview:${batchLabel(batch)}`, schema: VERDICT_SCHEMA }
        )
        if (codeReview && /BLOCKER/i.test(codeReview.findings || '')) {
          lastReason = `hub-code-reviewer BLOCKER: ${codeReview.findings}`
          log(`Batch ${batchLabel(batch)}: ${lastReason} — rebuilding (attempt ${attempt}/${MAX_CYCLES})`)
          continue
        }

        passed = true
      }
      return { batch, passed, lastReason }
    }
  )

  const failed = batchResults.filter(Boolean).filter((r) => !r.passed)
  if (failed.length) {
    throw new Error(
      `Batch(es) failed Build/Review/Test/CodeReview after ${MAX_CYCLES} attempts: ` +
      failed.map((r) => `${batchLabel(r.batch)} (${r.lastReason})`).join('; ')
    )
  }

  phase('Gate')
  gateVerdict = await agent(
    `Standalone DoD audit for task: ${task}\nSpec: ${plan.specPath}`,
    { agentType: 'hub-gatekeeper', phase: 'Gate', label: 'gatekeeper', schema: VERDICT_SCHEMA }
  )

  if (gateVerdict && /PASS/i.test(gateVerdict.verdict || '')) {
    log('Gatekeeper PASS.')
    break
  }

  log(`Gatekeeper REROUTE (cycle ${cycle}/${MAX_CYCLES}): ${gateVerdict ? gateVerdict.findings : 'no verdict returned'}. Re-planning.`)
  if (cycle >= MAX_CYCLES) break

  phase('Plan')
  plan = await agent(
    `Previous cycle's hub-gatekeeper REROUTEd with: ${gateVerdict ? gateVerdict.findings : 'unknown'}\n` +
    `Original task: ${task}\nProduce a corrective spec (new or amended batches) addressing these findings.`,
    { agentType: 'hub-planner', phase: 'Plan', label: 're-plan', schema: PLAN_SCHEMA }
  )
  if (!plan || !plan.batches || !plan.batches.length) {
    throw new Error('hub-planner produced no usable corrective plan after gatekeeper REROUTE')
  }
}

return {
  cycles: cycle,
  gatePassed: !!(gateVerdict && /PASS/i.test(gateVerdict.verdict || '')),
  gateVerdict,
  specPath: plan.specPath,
}
