/**
 * Test fixture for orbit_create_braze_canvas.
 *
 * Verifies that the mapping logic produces a valid Canvas payload structure
 * from a minimal Orbit braze pack and message plan.
 *
 * Run: node evals/braze-canvas-test.js
 */

import { createBrazeCanvas } from "../server/braze-canvas.js";

// --- Minimal Orbit message plan fixture ---
const messagePlan = {
  version: "1.0.0",
  type: "message_plan",
  program_name: "Onboarding Welcome",
  platform: "braze",
  objective: "Activate new users within 7 days of signup",
  audience: "New signups who have not completed setup",
  primary_kpi: "setup_completion_rate",
  messages: [
    {
      id: "msg-1",
      sequence_order: 1,
      channel: "email",
      name: "Welcome Email",
      timing: "immediately",
      send_condition: null,
      goal: "Welcome the user and explain first steps",
      cta: "Complete your profile"
    },
    {
      id: "msg-2",
      sequence_order: 2,
      channel: "push",
      name: "Setup Reminder Push",
      timing: "2 days after previous",
      send_condition: "User has not completed setup",
      goal: "Nudge user to finish setup",
      cta: "Finish setup"
    },
    {
      id: "msg-3",
      sequence_order: 3,
      channel: "email",
      name: "Value Highlight Email",
      timing: "4 days after entry",
      send_condition: null,
      goal: "Show key features and social proof",
      cta: "Explore features"
    },
    {
      id: "msg-4",
      sequence_order: 4,
      channel: "sms",
      name: "Final Nudge SMS",
      timing: "1 week later",
      send_condition: "User still inactive",
      goal: "Last-chance activation nudge",
      cta: "Open the app"
    }
  ]
};

// --- Minimal Orbit braze pack fixture ---
const brazePack = {
  version: "1.0.0",
  type: "braze_build_pack",
  program_name: "Onboarding Welcome",
  platform: "braze",
  naming_convention: {
    canvas: "onboarding_welcome_canvas_v1",
    campaign_prefix: "onboarding_welcome_email",
    content_block_prefix: "onboarding_welcome_cb"
  },
  content_blocks: [],
  liquid_snippets: [
    { field: "first_name", snippet: '{{ ${first_name} | default: "there" }}' }
  ],
  artifacts: {}
};

// --- Fake config (API won't be called in dry-run) ---
const config = {
  brazeApiKey: "test-key-not-real",
  brazeRestEndpoint: "https://rest.iad-01.braze.com"
};

// --- Test runner ---
async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, name) {
    if (condition) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.error(`  ✗ ${name}`);
      failed++;
    }
  }

  console.log("=== orbit_create_braze_canvas test suite ===\n");

  // Test 1: Dry-run produces valid payload
  console.log("Test 1: Dry-run produces a valid Canvas payload");
  const result = await createBrazeCanvas({
    config,
    brazePack,
    messagePlan,
    workspace: null,
    dryRun: true
  });

  assert(result.status === "dry_run", "Status is dry_run");
  assert(result.payload != null, "Payload is present");
  assert(result.payload.name === "onboarding_welcome_canvas_v1", "Canvas name from pack naming convention");
  assert(Array.isArray(result.payload.steps), "Steps is an array");
  assert(result.payload.steps.length > 0, "At least one step exists");
  assert(result.payload.entry_schedule != null, "Entry schedule is present");
  assert(result.payload.entry_audience != null, "Entry audience is present");
  assert(Array.isArray(result.payload.tags), "Tags is an array");
  assert(result.payload.tags.includes("orbit-generated"), "Tags include orbit-generated");

  // Test 2: Message steps are mapped correctly
  console.log("\nTest 2: Message steps mapped correctly");
  const messageSteps = result.payload.steps.filter((s) => s.type === "message");
  const delaySteps = result.payload.steps.filter((s) => s.type === "delay");

  assert(messageSteps.length === 4, `4 message steps created (got ${messageSteps.length})`);
  assert(delaySteps.length >= 2, `At least 2 delay steps created (got ${delaySteps.length})`);

  // Test 3: Channel mapping
  console.log("\nTest 3: Channel mapping");
  const welcomeEmail = messageSteps.find((s) => s.name === "Welcome Email");
  const pushStep = messageSteps.find((s) => s.name === "Setup Reminder Push");
  const smsStep = messageSteps.find((s) => s.name === "Final Nudge SMS");

  assert(welcomeEmail != null, "Welcome Email step exists");
  assert(welcomeEmail?.channels?.email != null, "Welcome Email has email channel");
  assert(pushStep?.channels?.push != null, "Setup Reminder has push channel");
  assert(smsStep?.channels?.sms != null, "Final Nudge has SMS channel");

  // Test 4: Delay parsing
  console.log("\nTest 4: Delay parsing");
  const twoDayDelay = delaySteps.find((s) => s.delay?.duration === 2);
  const weekDelay = delaySteps.find((s) => s.delay?.duration === 7);

  assert(twoDayDelay != null, "2-day delay step exists");
  assert(weekDelay != null, "7-day (1 week) delay step exists");

  // Test 5: Step linking
  console.log("\nTest 5: Step linking (next_step_id)");
  const allSteps = result.payload.steps;
  const lastStep = allSteps[allSteps.length - 1];
  assert(lastStep.next_step_id === null, "Last step has null next_step_id");
  // Non-last steps should point to something
  const linkedSteps = allSteps.slice(0, -1).filter((s) => s.next_step_id != null);
  assert(linkedSteps.length === allSteps.length - 1, "All non-last steps have a next_step_id");

  // Test 6: Immediate timing means no delay before first message
  console.log("\nTest 6: No delay before immediately-timed first message");
  const firstStep = allSteps[0];
  assert(firstStep.type === "message", "First step is a message (not a delay)");

  // Test 7: Entry schedule defaults
  console.log("\nTest 7: Entry schedule defaults");
  assert(result.payload.entry_schedule.type === "scheduled", "Default entry schedule is 'scheduled'");

  // Test 8: Validation warnings for missing audience
  console.log("\nTest 8: Validation warnings");
  assert(Array.isArray(result.warnings), "Warnings is an array");
  const audienceWarning = result.warnings.find((w) => w.includes("audience"));
  assert(audienceWarning != null, "Warning about missing entry audience");

  // Test 9: Empty message plan returns error
  console.log("\nTest 9: Empty message plan returns error");
  const emptyResult = await createBrazeCanvas({
    config,
    brazePack,
    messagePlan: { messages: [] },
    dryRun: true
  });
  assert(emptyResult.status === "needs_inputs", "Empty plan returns needs_inputs");

  // Test 10: Action-based entry schedule
  console.log("\nTest 10: Action-based entry schedule");
  const actionResult = await createBrazeCanvas({
    config,
    brazePack,
    messagePlan,
    entryScheduleType: "action_based",
    dryRun: true
  });
  assert(actionResult.payload.entry_schedule.type === "action_based", "Action-based schedule type set");

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
