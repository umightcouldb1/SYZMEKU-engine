const Task = require("../models/Task");
const AlertRecord = require("../models/AlertRecord");
const StrategicMemory = require("../models/StrategicMemory");
const ProtocolExecutionRecord = require("../models/ProtocolExecutionRecord");

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createToolRegistry = ({ runProtocolIfNeeded, generateReport }) => ({
  createTask: async ({ description, source = "action-kernel" }) => Task.create({ description, source }),
  completeTask: async ({ id }) => {
    const task = await Task.findById(id);
    if (!task) throw new Error(`Task not found: ${id}`);
    task.status = "done";
    task.completedAt = new Date();
    await task.save();
    return task;
  },
  createAlert: async ({ message, severity = "medium", source = "action-kernel" }) => {
    const fingerprint = normalizeText(message);
    const existing = await AlertRecord.findOne({ fingerprint });
    if (existing) {
      existing.count += 1;
      existing.last_seen_at = new Date();
      existing.status = "open";
      await existing.save();
      return existing;
    }

    return AlertRecord.create({ fingerprint, message, severity, source });
  },
  updateAlert: async ({ message, status = "resolved" }) => {
    const alert = await AlertRecord.findOne({ message: { $regex: `^${escapeRegex(message)}$`, $options: "i" } });
    if (!alert) throw new Error(`Alert not found: ${message}`);
    alert.status = status;
    alert.last_seen_at = new Date();
    await alert.save();
    return alert;
  },
  runProtocol: async ({ protocolName }) => runProtocolIfNeeded(protocolName),
  saveMemory: async ({ title, content, sourceCommand = "action kernel", tags = [] }) =>
    StrategicMemory.create({ title, category: "kernel", content, sourceCommand, tags }),
  generateReport: async ({ reasoningOutput, operatorState }) =>
    generateReport({ reasoningOutput, operatorState }),
});

const buildActionPolicy = ({ reasoningOutput, operatorState }) => {
  const urgency = Number(reasoningOutput?.urgency_score) || 0;
  const nextActions = Array.isArray(reasoningOutput?.next_actions) ? reasoningOutput.next_actions : [];
  const repeatedPattern = operatorState?.isRepeatedPattern;
  const shouldRunProtocol = Boolean(reasoningOutput?.should_run_protocol && reasoningOutput?.protocol_to_run);

  if (urgency < 4) {
    return { mode: "suggestion-only", queued: [] };
  }

  const queued = [];

  if (urgency >= 4 && urgency < 7) {
    queued.push(
      ...nextActions.slice(0, 2).map((description) => ({
        action_name: "createTask",
        input: { description, source: "action-kernel" },
      }))
    );
  }

  if (urgency >= 7) {
    queued.push({
      action_name: "createAlert",
      input: {
        message: `Urgency ${urgency}: immediate stabilization required.`,
        severity: urgency >= 8 ? "high" : "medium",
        source: "action-kernel",
      },
    });
  }

  if (repeatedPattern) {
    queued.push({
      action_name: "saveMemory",
      input: {
        title: `Pattern memory ${new Date().toISOString().slice(0, 19)}`,
        content: `${reasoningOutput.reasoning_summary} | next_actions=${nextActions.join("; ")}`,
        sourceCommand: reasoningOutput?.operator_context?.command_text || "action kernel",
        tags: ["pattern", "action-kernel", reasoningOutput?.dominant_mode || "general"],
      },
    });
  }

  if (shouldRunProtocol) {
    queued.push({ action_name: "runProtocol", input: { protocolName: reasoningOutput.protocol_to_run } });
  }

  queued.push({ action_name: "generateReport", input: { reasoningOutput, operatorState } });

  return { mode: "execute", queued };
};

const executeActionPlan = async ({ policy, toolRegistry }) => {
  const actions = [];

  for (const planned of policy.queued) {
    const startedAt = new Date();
    try {
      const tool = toolRegistry[planned.action_name];
      if (!tool) throw new Error(`Unknown tool: ${planned.action_name}`);
      const result = await tool(planned.input || {});
      actions.push({
        action_name: planned.action_name,
        input: planned.input || {},
        result,
        success: true,
        error: "",
        timestamp: startedAt.toISOString(),
        follow_up_needed: false,
      });
    } catch (error) {
      actions.push({
        action_name: planned.action_name,
        input: planned.input || {},
        result: null,
        success: false,
        error: String(error?.message || error),
        timestamp: startedAt.toISOString(),
        follow_up_needed: true,
      });
    }
  }

  return actions;
};

module.exports = {
  buildActionPolicy,
  createToolRegistry,
  executeActionPlan,
};
