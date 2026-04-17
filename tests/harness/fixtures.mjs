/**
 * Factories for common test inputs (specs, configs, etc.).
 * Keeps tests concise and ensures consistent fixtures across suites.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function makeTempWorkspace(prefix = "orbit-test-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(root, "brand-kit"), { recursive: true });
  fs.mkdirSync(path.join(root, "library"), { recursive: true });
  fs.mkdirSync(path.join(root, "outputs"), { recursive: true });
  fs.mkdirSync(path.join(root, "imports"), { recursive: true });
  return root;
}

export function makeSampleLifecycleSpec() {
  return {
    type: "lifecycle_diagram",
    id: "test-welcome",
    title: "Test Welcome Program",
    platform: "braze",
    diagram_type: "braze-canvas-flow",
    lanes: [{ id: "main", label: "Flow" }],
    nodes: [
      {
        id: "entry",
        type: "entry",
        lane: "main",
        label: "Trial Signup",
        subtitle: "Entry trigger",
        metadata: { node_role: "entry", trigger: "trial_signup_completed" }
      },
      {
        id: "welcome",
        type: "message",
        lane: "main",
        label: "Welcome Email",
        subtitle: "Day 0",
        metadata: { channel: "email", send_condition: "on_entry" }
      },
      {
        id: "wait",
        type: "delay",
        lane: "main",
        label: "Wait 2 days",
        subtitle: "",
        metadata: { delay: "2 days" }
      },
      {
        id: "nudge",
        type: "message",
        lane: "main",
        label: "Activation Nudge",
        subtitle: "Day 2",
        metadata: { channel: "email", filter: "NOT activated" }
      }
    ],
    edges: [
      { from: "entry", to: "welcome", label: "on signup" },
      { from: "welcome", to: "wait", label: "continue" },
      { from: "wait", to: "nudge", label: "continue" }
    ],
    mermaid: "flowchart TD\nentry-->welcome-->wait-->nudge"
  };
}

export function makeSampleMessagePlan() {
  return {
    type: "message_plan",
    id: "test-plan",
    program_name: "Welcome",
    audience: "Trial signups",
    channels: ["email"],
    messages: [
      {
        id: "m1",
        step: 1,
        channel: "email",
        send_day: 0,
        subject: "Welcome",
        body_outline: "Get started guide",
        audience: "All entries"
      }
    ]
  };
}

export function makeSampleProgramBrief() {
  return {
    type: "program_brief",
    id: "test-brief",
    program_name: "Test Welcome",
    objective: "Drive trial-to-paid activation",
    audience: "New trial signups",
    kpis: ["activation_rate", "d7_retention"],
    entry_trigger: "trial_signup_completed",
    exit_condition: "activation_complete OR trial_ended"
  };
}
