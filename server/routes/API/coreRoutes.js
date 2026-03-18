const router = require("express").Router();
const System = require("../../models/System");
const SignalEntry = require("../../models/SignalEntry");
const SystemExecution = require("../../models/SystemExecution");
const Task = require("../../models/Task");
const StrategicMemory = require("../../models/StrategicMemory");
const AgentLoopState = require("../../models/AgentLoopState");
const KernelSnapshot = require("../../models/KernelSnapshot");
const KernelCycle = require("../../models/KernelCycle");
const ProtocolExecutionRecord = require("../../models/ProtocolExecutionRecord");
const AlertRecord = require("../../models/AlertRecord");
const ActionExecution = require("../../models/ActionExecution");
const { buildActionPolicy, createToolRegistry, executeActionPlan } = require("../../logic/actionKernel");
const mongoose = require("mongoose");
const { protect } = require("../../middleware/authMiddleware");
const DataRequest = require("../../models/DataRequest");
const User = require("../../models/User");
const { requestModelJson, getModelRoutingConfig } = require("../../services/modelRouter");
const { getHealthIntegrationMeta, parseSleepPayload } = require("../../services/healthDataService");
const { logAuditEvent } = require("../../utils/audit");



router.use(protect);

const OPERATOR_ROLES = ["founder", "admin"];

const parseRoleEmails = (value = "") =>
  new Set(
    String(value)
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );

const founderEmails = parseRoleEmails(process.env.FOUNDER_EMAILS);
const adminEmails = parseRoleEmails(process.env.ADMIN_EMAILS);

const resolveOperatorVisibility = (user = {}) => {
  const role = String(user?.role || "user").toLowerCase();
  const email = String(user?.email || "").trim().toLowerCase();
  const matchedEmailRole = founderEmails.has(email) ? "founder" : adminEmails.has(email) ? "admin" : "";
  const canAccessOperatorMode = OPERATOR_ROLES.includes(role) || Boolean(matchedEmailRole);
  const effectiveRole = OPERATOR_ROLES.includes(role) ? role : matchedEmailRole || role;
  const accessSource = OPERATOR_ROLES.includes(role) ? "role" : matchedEmailRole ? "email_allowlist" : "none";

  return {
    canAccessOperatorMode,
    role,
    email,
    effectiveRole,
    matchedEmailRole,
    accessSource,
    requiredRoles: OPERATOR_ROLES,
  };
};

const requireOperatorRole = async (req, res, next) => {
  const visibility = resolveOperatorVisibility(req.user);

  if (!visibility.canAccessOperatorMode) {
    await logAuditEvent({
      category: 'access',
      event: 'role_access_denied',
      req,
      userId: req.user?._id || null,
      role: req.user?.role || '',
      success: false,
      details: { allowedRoles: OPERATOR_ROLES, email: visibility.email },
    });
    return res.status(403).json({ message: 'Access denied' });
  }

  req.operatorVisibility = visibility;
  return next();
};

const auditCoreAction = async (req, event, details = {}) => {
  await logAuditEvent({
    category: "core-action",
    event,
    req,
    userId: req.user?._id || null,
    role: req.user?.role || "",
    success: true,
    details,
  });
};

const buildDistressEscalation = (latestSignals = [], anomalies = []) => {
  const latest = latestSignals[0] || {};
  const stress = Number(latest?.stress || 0);
  const lowSleep = Number(latest?.sleep || 0) <= 3;
  const riskDetected = anomalies.length > 0 || stress >= 9 || lowSleep;
  if (!riskDetected) {
    return {
      escalated: false,
      level: "none",
      reason: "No high-risk distress pattern detected.",
      guidance: [],
      disclaimer: "Non-diagnostic support signal only.",
    };
  }

  return {
    escalated: true,
    level: stress >= 9 ? "high" : "moderate",
    reason: anomalies[0] || "Concerning stress/sleep pattern detected.",
    guidance: [
      "Pause high-risk tasks and shift to immediate stabilization steps.",
      "Contact a trusted human support person now.",
      "If you may be in immediate danger, call local emergency services now.",
    ],
    disclaimer: "This is not a diagnosis or treatment plan.",
  };
};

router.use([
  "/systems",
  "/systems/map",
  "/systems/run",
  "/systems/automate",
  "/systems/disable",
  "/protocol/status",
  "/sentinel/status",
  "/sentinel/scan",
  "/sentinel/report",
  "/loop/status",
  "/loop/start",
  "/loop/stop",
  "/actions",
  "/monitor/run",
  "/autonomy/status",
], requireOperatorRole);

const REQUIRED_ANALYSIS_KEYS = ["objectives", "constraints", "risks", "leverage", "next_actions"];
const LINKABLE_SIGNAL_KEYS = ["sleep", "stress", "symptoms", "notes"];

const FALLBACK_ANALYSIS = {
  objectives: ["Gemini JSON missing required keys."],
  constraints: [],
  risks: [],
  leverage: [],
  next_actions: ["Adjust model prompt to always return the required schema."],
};

const autonomyState = {
  monitoringEnabled: true,
  lastRunAt: null,
  activeAlerts: [],
};

const KERNEL_MODES = ["general", "strategic", "health", "build", "signal", "mentor", "recommend"];
const KERNEL_NODES = ["sentinel", "mentor", "planner", "protocol", "recommend"];

const LOOP_INTERVAL_MS = Number(process.env.AGENT_LOOP_INTERVAL_MS) > 0 ? Number(process.env.AGENT_LOOP_INTERVAL_MS) : 120000;
const DEV_DEFAULT_ACTIVE =
  process.env.NODE_ENV === "development" && String(process.env.AGENT_LOOP_DEFAULT_ACTIVE || "false").toLowerCase() === "true";
const loopState = {
  active: false,
  intervalMs: LOOP_INTERVAL_MS,
  timer: null,
  startedAt: null,
  lastRunAt: null,
  runCount: 0,
  lastReport: null,
  latestAgentSummary: "",
  latestAgentMode: "",
  latestAgentNextActions: [],
  latestActionExecutions: [],
  eventLog: [],
  lastError: null,
};

const appendLoopEvent = (event) => {
  loopState.eventLog = [{ recordedAt: new Date().toISOString(), ...event }, ...loopState.eventLog].slice(0, 50);
};

const getLoopStateRecord = async () => {
  let record = await AgentLoopState.findOne({ singletonKey: "primary" });
  if (record) return record;

  record = await AgentLoopState.create({
    singletonKey: "primary",
    active: DEV_DEFAULT_ACTIVE,
    interval_ms: LOOP_INTERVAL_MS,
    run_count: 0,
    last_error: "",
    latest_agent_summary: "",
    latest_agent_mode: "",
    latest_agent_next_actions: [],
  });

  return record;
};

const syncLoopStateFromRecord = (record) => {
  if (!record) return;
  loopState.active = Boolean(record.active);
  loopState.intervalMs = Number(record.interval_ms) > 0 ? Number(record.interval_ms) : LOOP_INTERVAL_MS;
  loopState.lastRunAt = record.last_run_at || null;
  loopState.runCount = Number(record.run_count) || 0;
  loopState.lastError = record.last_error || "";
  loopState.latestAgentSummary = record.latest_agent_summary || "";
  loopState.latestAgentMode = record.latest_agent_mode || "";
  loopState.latestAgentNextActions = Array.isArray(record.latest_agent_next_actions) ? record.latest_agent_next_actions : [];
};

const buildKernelReport = ({ reasoningOutput, operatorState }) => ({
  summary: `mode=${reasoningOutput?.dominant_mode || "general"} urgency=${reasoningOutput?.urgency_score ?? 0} tasks=${operatorState?.openTasksCount ?? 0}`,
  recommendations: Array.isArray(reasoningOutput?.next_actions) ? reasoningOutput.next_actions.slice(0, 3) : [],
  generated_at: new Date().toISOString(),
});

const persistLoopState = async (patch = {}) => {
  const nextPatch = { ...patch };
  if (typeof nextPatch.intervalMs !== "undefined") {
    nextPatch.interval_ms = nextPatch.intervalMs;
    delete nextPatch.intervalMs;
  }

  const payload = {
    ...(typeof nextPatch.active === "boolean" ? { active: nextPatch.active } : {}),
    ...(typeof nextPatch.interval_ms === "number" && nextPatch.interval_ms > 0 ? { interval_ms: nextPatch.interval_ms } : {}),
    ...(Object.prototype.hasOwnProperty.call(nextPatch, "last_run_at") ? { last_run_at: nextPatch.last_run_at } : {}),
    ...(typeof nextPatch.run_count === "number" ? { run_count: nextPatch.run_count } : {}),
    ...(typeof nextPatch.last_error === "string" ? { last_error: nextPatch.last_error } : {}),
    ...(typeof nextPatch.latest_agent_summary === "string" ? { latest_agent_summary: nextPatch.latest_agent_summary } : {}),
    ...(typeof nextPatch.latest_agent_mode === "string" ? { latest_agent_mode: nextPatch.latest_agent_mode } : {}),
    ...(Array.isArray(nextPatch.latest_agent_next_actions) ? { latest_agent_next_actions: nextPatch.latest_agent_next_actions } : {}),
  };

  const record = await AgentLoopState.findOneAndUpdate(
    { singletonKey: "primary" },
    {
      $set: payload,
      $setOnInsert: {
        singletonKey: "primary",
      },
    },
    { new: true, upsert: true }
  );
  if (record) syncLoopStateFromRecord(record);
  return record;
};

const buildLoopStartErrorDetails = (error) => {
  if (!error) return "Unknown loop start error.";

  if (error?.name === "ValidationError" && error?.errors && typeof error.errors === "object") {
    const validationMessages = Object.entries(error.errors)
      .map(([field, detail]) => {
        const detailMessage = detail?.message || detail?.reason?.message || detail?.properties?.message;
        return detailMessage ? `${field}: ${detailMessage}` : "";
      })
      .filter(Boolean);
    if (validationMessages.length) return `Validation failed: ${validationMessages.join("; ")}`;
  }

  if (Array.isArray(error?.writeErrors) && error.writeErrors.length) {
    const mongoWriteMessage = error.writeErrors
      .map((item) => item?.errmsg || item?.message || item?.err?.message)
      .filter(Boolean)
      .join("; ");
    if (mongoWriteMessage) return mongoWriteMessage;
  }

  if (typeof error?.errmsg === "string" && error.errmsg.trim()) return error.errmsg;
  if (typeof error?.reason?.message === "string" && error.reason.message.trim()) return error.reason.message;
  if (typeof error?.cause?.message === "string" && error.cause.message.trim()) return error.cause.message;
  if (typeof error?.message === "string" && error.message.trim()) return error.message;

  return String(error);
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeRecentCommands = (rawContext) =>
  Array.isArray(rawContext?.recentCommands)
    ? rawContext.recentCommands
        .map((command) => {
          if (typeof command === "string") return command.trim();
          if (command && typeof command === "object") {
            const normalized =
              typeof command.text === "string" ? command.text : typeof command.command === "string" ? command.command : "";
            return normalized.trim();
          }
          return "";
        })
        .filter(Boolean)
        .slice(0, 20)
    : [];

const toContextLines = (entries, keys) =>
  entries.map((entry, index) => {
    const line = keys
      .map((key) => {
        const value = entry?.[key];
        if (typeof value === "string" && value.trim()) return `${key}: ${value.trim()}`;
        if (typeof value === "number" || typeof value === "boolean") return `${key}: ${String(value)}`;
        if (Array.isArray(value) && value.length) {
          return `${key}: ${value
            .map((item) => (typeof item === "string" ? item.trim() : ""))
            .filter(Boolean)
            .join(", ")}`;
        }
        return "";
      })
      .filter(Boolean)
      .join(" | ");

    return line ? `${index + 1}. ${line}` : `${index + 1}. ${JSON.stringify(entry)}`;
  });

const fetchStrategicContext = async () => {
  try {
    const [latestSignals, latestSystems, latestTasks, strategicMemory] = await Promise.all([
      SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean(),
      System.find().sort({ createdAt: -1 }).limit(5).lean(),
      Task.find().sort({ createdAt: -1 }).limit(10).lean(),
      StrategicMemory.find().sort({ updatedAt: -1 }).limit(5).lean(),
    ]);

    return { latestSignals, latestSystems, latestTasks, strategicMemory };
  } catch (dbError) {
    console.warn("Failed to fetch strategic context:", dbError?.message || dbError);
    return { latestSignals: [], latestSystems: [], latestTasks: [], strategicMemory: [] };
  }
};

const mapSystemRecord = (system) => {
  const inputs = Array.isArray(system?.inputs) ? system.inputs.filter(Boolean) : [];
  const outputs = Array.isArray(system?.outputs) ? system.outputs.filter(Boolean) : [];
  const routines = Array.isArray(system?.routines) ? system.routines.filter(Boolean) : [];

  const relationshipText = [...inputs, ...outputs, ...routines, system?.purpose, system?.name]
    .filter(Boolean)
    .map(normalizeText)
    .join(" ");

  const linkedSignals = LINKABLE_SIGNAL_KEYS.filter((signalKey) => relationshipText.includes(signalKey));

  return {
    id: String(system?._id || ""),
    name: system?.name || "Unnamed System",
    purpose: system?.purpose || "",
    protocolType: system?.protocolType || "generic",
    protocolRules: Array.isArray(system?.protocolRules) ? system.protocolRules.filter(Boolean) : [],
    recommendedActions: Array.isArray(system?.recommendedActions) ? system.recommendedActions.filter(Boolean) : [],
    triggerConditions: Array.isArray(system?.triggerConditions) ? system.triggerConditions.filter(Boolean) : [],
    automationEnabled: Boolean(system?.automationEnabled),
    escalationLevel: system?.escalationLevel || "low",
    inputs,
    outputs,
    routines,
    linkedSignals,
  };
};

const describeNumericTrend = (values) => {
  if (!Array.isArray(values) || values.length < 2) return { direction: "insufficient-data", delta: 0, latest: null, previous: null };
  const latest = values[0];
  const previous = values[values.length - 1];
  const delta = Number((latest - previous).toFixed(2));
  if (delta > 0) return { direction: "increasing", delta, latest, previous };
  if (delta < 0) return { direction: "decreasing", delta, latest, previous };
  return { direction: "stable", delta, latest, previous };
};

const describeSymptomsTrend = (entries) => {
  const normalized = entries.map((entry) => normalizeText(entry?.symptoms)).filter(Boolean);
  if (!normalized.length) return { direction: "insufficient-data", latest: null };
  if (normalized.length === 1) return { direction: "single-entry", latest: normalized[0] };
  const uniqueRecent = new Set(normalized.slice(0, 3));
  return { direction: uniqueRecent.size === 1 ? "stable" : "mixed", latest: normalized[0] };
};

const toDirectionalState = (trendDirection, increaseMeansImproving = false) => {
  if (trendDirection === "stable") return "stable";
  if (trendDirection === "insufficient-data" || trendDirection === "single-entry") return "insufficient-data";
  if (increaseMeansImproving) return trendDirection === "increasing" ? "improving" : "worsening";
  return trendDirection === "decreasing" ? "improving" : "worsening";
};

const computeSignalTrendBundle = (entries) => {
  const latestFive = entries.slice(0, 5);
  const sleepValues = latestFive.map((entry) => entry?.sleep).filter((value) => typeof value === "number");
  const stressValues = latestFive.map((entry) => entry?.stress).filter((value) => typeof value === "number");
  const sleepTrend = describeNumericTrend(sleepValues);
  const stressTrend = describeNumericTrend(stressValues);
  const symptomTrend = describeSymptomsTrend(latestFive);

  return {
    sampleSize: latestFive.length,
    sleep: { ...sleepTrend, state: toDirectionalState(sleepTrend.direction, true) },
    stress: { ...stressTrend, state: toDirectionalState(stressTrend.direction, false) },
    symptoms: {
      ...symptomTrend,
      state: symptomTrend.direction === "stable" ? "stable" : symptomTrend.direction === "mixed" ? "worsening" : "insufficient-data",
    },
  };
};

const detectSignalAnomalies = (entries) => {
  const latestFive = entries.slice(0, 5);
  const anomalies = [];
  for (let index = 0; index < latestFive.length - 1; index += 1) {
    const current = latestFive[index];
    const previous = latestFive[index + 1];

    if (typeof current?.stress === "number" && typeof previous?.stress === "number") {
      const deltaStress = current.stress - previous.stress;
      if (deltaStress >= 3) anomalies.push(`Stress spike detected (${previous.stress} -> ${current.stress}).`);
    }

    if (typeof current?.sleep === "number" && typeof previous?.sleep === "number") {
      const deltaSleep = previous.sleep - current.sleep;
      if (deltaSleep >= 2) anomalies.push(`Sleep drop detected (${previous.sleep} -> ${current.sleep}).`);
    }

    const currentSymptoms = normalizeText(current?.symptoms);
    const previousSymptoms = normalizeText(previous?.symptoms);
    if (currentSymptoms && previousSymptoms && currentSymptoms !== previousSymptoms) {
      anomalies.push(`Symptom shift detected (${previousSymptoms} -> ${currentSymptoms}).`);
    }
  }
  return anomalies;
};

const buildExecutionPlan = (system, latestSignals) => {
  const routines = Array.isArray(system?.routines) ? system.routines.filter(Boolean) : [];
  const stressValues = latestSignals.map((entry) => entry?.stress).filter((value) => typeof value === "number");
  const sleepValues = latestSignals.map((entry) => entry?.sleep).filter((value) => typeof value === "number");
  const stressTrend = describeNumericTrend(stressValues);
  const sleepTrend = describeNumericTrend(sleepValues);

  const objectives = [`Execute ${system?.name || "selected system"} as an actionable protocol.`];
  const constraints = [];
  const risks = [];
  const leverage = [];

  if (stressTrend.direction === "increasing") {
    risks.push("Stress is increasing across recent signals.");
    constraints.push("Favor lower-intensity steps until stress stabilizes.");
  }

  if (sleepTrend.direction === "decreasing") {
    risks.push("Sleep is declining across recent signals.");
    constraints.push("Avoid high-load actions during low-recovery periods.");
  }

  if ((system?.name || "").toLowerCase().includes("recovery")) leverage.push("Recovery system detected; prioritize stabilization and pacing.");
  if (!leverage.length) leverage.push("Use routine sequencing to create momentum.");

  const next_actions = routines.length
    ? routines.slice(0, 5).map((routine, index) => `Step ${index + 1}: ${routine}`)
    : [
        "Step 1: Review the latest signal profile.",
        "Step 2: Execute one high-leverage routine for this system.",
        "Step 3: Record a follow-up signal and reassess.",
      ];

  return { objectives, constraints, risks, leverage, next_actions };
};

const requestModelAnalysisJson = async ({ mode, prompt }) => {
  const modelResult = await requestModelJson({ mode, prompt });
  if (modelResult?.error) return modelResult;

  if (modelResult?.providerError) {
    return {
      error: {
        objectives: ["Model provider HTTP error"],
        constraints: [`HTTP status: ${modelResult.providerError.status}`],
        risks: [String(modelResult.providerError.message || "").slice(0, 300)],
        leverage: [`Check provider key and model alias mapping for ${modelResult.providerError.model}.`],
        next_actions: ["Fix the reported model provider error and retry command."],
      },
    };
  }

  const data = modelResult?.data || {};
  const modelText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  let parsed;
  try {
    parsed = JSON.parse(modelText);
  } catch {
    return {
      error: {
        objectives: ["Model returned non-JSON output."],
        constraints: [],
        risks: [String(modelText || "").slice(0, 300)],
        leverage: [],
        next_actions: ["Tighten the prompt or parsing logic."],
      },
    };
  }

  const hasAllRequiredKeys = parsed && typeof parsed === "object" && !Array.isArray(parsed) && REQUIRED_ANALYSIS_KEYS.every((key) => Object.prototype.hasOwnProperty.call(parsed, key));
  if (!hasAllRequiredKeys) return { result: FALLBACK_ANALYSIS };

  const normalized = REQUIRED_ANALYSIS_KEYS.reduce((acc, key) => {
    const value = parsed[key];
    acc[key] = Array.isArray(value)
      ? value.map((item) => (typeof item === "string" ? item.trim() : String(item || "").trim())).filter(Boolean)
      : [];
    return acc;
  }, {});

  return { result: normalized };
};

const buildSharedPromptContext = ({
  commandText,
  recentCommands,
  activeRouteType,
  lastOverlayResult,
  latestSignals,
  latestSystems,
  latestTasks,
  strategicMemory,
}) => {
  const signalContextLines = toContextLines(latestSignals, ["sleep", "stress", "symptoms", "notes"]);
  const systemContextLines = toContextLines(latestSystems, ["name", "purpose", "protocolType", "inputs", "outputs", "routines"]);
  const taskContextLines = toContextLines(latestTasks, ["description", "status", "source"]);
  const memoryContextLines = toContextLines(strategicMemory, ["title", "category", "content", "tags"]);
  const hasLastOverlayResult = lastOverlayResult && typeof lastOverlayResult === "object";

  return [
    `Current user command: ${commandText}`,
    `Active route type: ${activeRouteType || "(none provided)"}`,
    `Recent command history: ${recentCommands.length ? JSON.stringify(recentCommands) : "(none provided)"}`,
    "Latest signals (newest first, max 5):",
    ...(signalContextLines.length ? signalContextLines : ["(none found)"]),
    "Latest systems (newest first, max 5):",
    ...(systemContextLines.length ? systemContextLines : ["(none found)"]),
    "Latest tasks (newest first, max 10):",
    ...(taskContextLines.length ? taskContextLines : ["(none found)"]),
    "Latest strategic memory (newest first, max 5):",
    ...(memoryContextLines.length ? memoryContextLines : ["(none found)"]),
    hasLastOverlayResult ? `Last overlay result summary: ${JSON.stringify(lastOverlayResult)}` : "Last overlay result summary: (none provided)",
  ];
};

const buildAnalysisPrompt = ({ text, mode, modeInstruction, rawContext, latestSignals, latestSystems, latestTasks, strategicMemory }) => {
  const recentCommands = normalizeRecentCommands(rawContext);
  const activeRouteType = typeof rawContext?.activeRouteType === "string" ? rawContext.activeRouteType.trim() : "";

  return [
    "Reason like a strategic operating system.",
    "Treat emotions as indicators for pattern detection, not commands for reactive behavior.",
    "Read emotional/symptom data as signal context and produce empathetic, practical guidance.",
    "Synthesize command + systems + signals + task queue + strategic memory + recent session context.",
    "Return ONLY valid JSON.",
    "No markdown.",
    "No explanation outside JSON.",
    "No code fences.",
    "Each field must be an array of concise strings.",
    "Use this exact shape:",
    '{"objectives":[],"constraints":[],"risks":[],"leverage":[],"next_actions":[]}',
    "",
    `Analyze mode: ${mode}`,
    `Mode guidance: ${modeInstruction}`,
    ...buildSharedPromptContext({
      commandText: text,
      recentCommands,
      activeRouteType,
      lastOverlayResult: rawContext?.lastOverlayResult,
      latestSignals,
      latestSystems,
      latestTasks,
      strategicMemory,
    }),
  ].join("\n");
};

const selectAgentMode = (goalText, latestSignals) => {
  const normalizedGoal = normalizeText(goalText);
  if (["strategy", "priorit", "roadmap", "plan"].some((token) => normalizedGoal.includes(token))) return "strategic";
  if (["build", "architect", "deploy", "code", "product"].some((token) => normalizedGoal.includes(token))) return "build";
  if (["signal", "anomaly", "trend", "state"].some((token) => normalizedGoal.includes(token))) return "signal";
  if (["health", "stress", "sleep", "symptom", "recovery"].some((token) => normalizedGoal.includes(token))) return "health";
  const latestStress = typeof latestSignals?.[0]?.stress === "number" ? latestSignals[0].stress : null;
  if (latestStress !== null && latestStress >= 7) return "health";
  return "recommend";
};

const evaluateMonitorState = async () => {
  const [latestSignals, latestTasks, enabledProtocols] = await Promise.all([
    SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean(),
    Task.find({ status: "open" }).sort({ createdAt: -1 }).limit(50).lean(),
    System.find({ automationEnabled: true }).sort({ updatedAt: -1 }).lean(),
  ]);

  const trends = computeSignalTrendBundle(latestSignals);
  const anomalies = detectSignalAnomalies(latestSignals);
  const alerts = [];
  const risks = [];
  const recommended_actions = [];

  if (trends.stress.direction === "increasing") {
    alerts.push("Stress is increasing across recent entries.");
    risks.push("Operational strain may reduce execution quality.");
    recommended_actions.push("Prioritize recovery protocol and reduce concurrent tasks.");
  }

  if (trends.sleep.direction === "decreasing") {
    alerts.push("Sleep trend is declining.");
    risks.push("Recovery deficit can cause compounding performance issues.");
    recommended_actions.push("Run recovery-oriented system protocol and simplify commitments.");
  }

  if (latestTasks.length >= 8) {
    alerts.push(`Task backlog elevated (${latestTasks.length} open tasks).`);
    risks.push("Backlog may reduce focus and throughput.");
    recommended_actions.push("Sequence top 3 tasks and defer low-leverage items.");
  }

  if (enabledProtocols.length) {
    recommended_actions.push(`Review ${enabledProtocols.length} enabled protocol(s) for trigger alignment.`);
  }

  anomalies.forEach((anomaly) => alerts.push(anomaly));

  const state_summary = `Signals=${latestSignals.length}, openTasks=${latestTasks.length}, enabledProtocols=${enabledProtocols.length}, alerts=${alerts.length}.`;
  autonomyState.lastRunAt = new Date();
  autonomyState.activeAlerts = alerts;

  return {
    alerts,
    risks,
    recommended_actions,
    state_summary,
    trends,
    openTaskCount: latestTasks.length,
    enabledProtocolCount: enabledProtocols.length,
  };
};

const inferDominantMode = ({ latestSignals, openTasks, activeAlerts, recentCommands = [] }) => {
  const recent = (recentCommands || []).map((item) => normalizeText(item));
  if (recent.some((item) => /mentor|reflect|reframe/.test(item))) return "mentor";
  if (activeAlerts.length >= 2) return "signal";
  const stressValues = latestSignals.map((entry) => entry?.stress).filter((value) => typeof value === "number");
  const avgStress = stressValues.length ? stressValues.reduce((sum, value) => sum + value, 0) / stressValues.length : 0;
  if (avgStress >= 7) return "health";
  if (openTasks.length >= 8) return "strategic";
  if (recent.some((item) => /build|plan|architect/.test(item))) return "build";
  if (recent.some((item) => /recommend/.test(item))) return "recommend";
  return "general";
};

const chooseNodeFromMode = ({ dominantMode, shouldRunProtocol }) => {
  if (shouldRunProtocol) return "protocol";
  if (["health", "signal"].includes(dominantMode)) return "sentinel";
  if (dominantMode === "mentor") return "mentor";
  if (["strategic", "build"].includes(dominantMode)) return "planner";
  return "recommend";
};

const runSelectedNode = async ({ node, dominantMode, context }) => {
  const latestSignal = context.latestSignals[0];
  if (node === "sentinel") {
    return {
      reasoningSummary: context.activeAlerts.length
        ? `Sentinel review found ${context.activeAlerts.length} active alert(s) requiring stabilization.`
        : "Sentinel review found stable conditions with no active alert pressure.",
      nextActions: context.activeAlerts.length
        ? ["Stabilize highest severity alert", "Recheck latest signal trend", "Reduce system load until trend stabilizes"]
        : ["Continue baseline monitoring", "Log next signal checkpoint"],
    };
  }

  if (node === "mentor") {
    return {
      reasoningSummary: "Mentor node selected to reinforce alignment, reflection, and focused execution.",
      nextActions: ["Capture one reflection on current objective", "Choose one aligned action for the next block", "Record confidence signal after execution"],
    };
  }

  if (node === "planner") {
    return {
      reasoningSummary: `Planner node selected to sequence ${context.openTasks.length} open task(s) with strategic priority.`,
      nextActions: [
        "Rank top 3 high-leverage tasks",
        "Convert one strategic action into an execution task",
        "Review unresolved risks before next cycle",
      ],
    };
  }

  if (node === "protocol") {
    const protocolTarget = context.latestSystems.find((system) => system?.automationEnabled) || context.latestSystems[0];
    return {
      reasoningSummary: protocolTarget
        ? `Protocol node selected to run ${protocolTarget.name}.`
        : "Protocol node selected but no system was available for execution.",
      nextActions: protocolTarget ? [`Run protocol: ${protocolTarget.name}`, "Store protocol result", "Re-evaluate task priority after protocol run"] : ["Register at least one system protocol"],
      protocolToRun: protocolTarget?.name || null,
    };
  }

  const stress = typeof latestSignal?.stress === "number" ? latestSignal.stress : "n/a";
  return {
    reasoningSummary: `Recommend node selected for ${dominantMode} mode. Latest stress=${stress}.`,
    nextActions: ["Advance one actionable next step", "Keep alert and task pressure visible", "Save concise strategic memory"],
  };
};

const runProtocolIfNeeded = async (protocolName) => {
  if (!protocolName) return null;
  try {
    const system = await System.findOne({ name: { $regex: `^${escapeRegex(protocolName)}$`, $options: "i" } }).lean();
    if (!system) {
      return await ProtocolExecutionRecord.create({ protocol_name: protocolName, status: "failed", details: "System not found." });
    }

    const latestSignals = await SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean();
    const executionPlan = buildExecutionPlan(system, latestSignals);
    await SystemExecution.create({
      systemId: system._id,
      systemName: system.name,
      readiness: executionPlan.risks.length ? "guarded" : "ready",
      riskFlags: executionPlan.risks,
      actions: executionPlan.next_actions,
      signalSnapshot: latestSignals[0] || null,
    });

    return await ProtocolExecutionRecord.create({ protocol_name: system.name, status: "executed", details: executionPlan.next_actions.join(" | ") });
  } catch (error) {
    return await ProtocolExecutionRecord.create({ protocol_name: protocolName, status: "failed", details: String(error?.message || error) });
  }
};

const runAutonomousReasoningKernel = async ({ trigger = "loop", text = "kernel evaluate", rawContext = {} } = {}) => {
  const [latestSignals, latestSystems, openTasks, currentAlerts, strategicMemory, recentKernelCycles] = await Promise.all([
    SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean(),
    System.find().sort({ updatedAt: -1 }).limit(10).lean(),
    Task.find({ status: "open" }).sort({ createdAt: -1 }).limit(50).lean(),
    AlertRecord.find({ status: "open" }).sort({ updatedAt: -1 }).limit(25).lean(),
    StrategicMemory.find().sort({ updatedAt: -1 }).limit(10).lean(),
    KernelCycle.find({ error_summary: "" }).sort({ createdAt: -1 }).limit(1).lean(),
  ]);

  const recentCommands = normalizeRecentCommands(rawContext);
  const lastOverlayResult = rawContext?.lastOverlayResult || null;
  const operatorContext = {
    latestSignals,
    latestSystems,
    openTasks,
    currentAlerts,
    strategicMemory,
    recentCommands,
    lastOverlayResult,
    priorKernel: recentKernelCycles[0]?.output || null,
  };

  const urgency_score = Math.min(10, Math.max(0, currentAlerts.length * 2 + Math.min(openTasks.length, 6) + (latestSignals[0]?.stress || 0) / 2));
  const dominant_mode = inferDominantMode({ latestSignals, openTasks, activeAlerts: currentAlerts, recentCommands });
  const should_run_protocol = latestSystems.some((system) => system?.automationEnabled && (currentAlerts.length > 0 || dominant_mode === "build"));
  const selected_node = chooseNodeFromMode({ dominantMode: dominant_mode, shouldRunProtocol: should_run_protocol });
  const nodeResult = await runSelectedNode({ node: selected_node, dominantMode: dominant_mode, context: { ...operatorContext, activeAlerts: currentAlerts } });
  const next_actions = (nodeResult.nextActions || []).slice(0, 5);
  const should_create_task = next_actions.length > 0 && openTasks.length < 20;
  const should_create_alert = currentAlerts.length === 0 && urgency_score >= 7;
  const protocol_to_run = should_run_protocol ? nodeResult.protocolToRun || latestSystems.find((system) => system?.automationEnabled)?.name || null : null;

  const result = {
    operator_state_summary: `signals=${latestSignals.length}, open_tasks=${openTasks.length}, active_alerts=${currentAlerts.length}, memory_entries=${strategicMemory.length}`,
    urgency_score,
    dominant_mode: KERNEL_MODES.includes(dominant_mode) ? dominant_mode : "general",
    selected_node: KERNEL_NODES.includes(selected_node) ? selected_node : "recommend",
    reasoning_summary: nodeResult.reasoningSummary || "Kernel completed cycle without additional reasoning detail.",
    next_actions,
    should_create_task,
    should_create_alert,
    should_run_protocol,
    protocol_to_run,
    tasks_created: [],
    alerts_created: [],
    protocol_run: null,
    memory_saved: false,
    action_policy: null,
    action_results: [],
    timestamp: new Date().toISOString(),
    operator_context: {
      command_history_count: recentCommands.length,
      has_last_overlay: Boolean(lastOverlayResult),
      trigger,
      command_text: text,
    },
  };

  const repeatedPattern = strategicMemory.some((entry) => {
    if (!entry?.content) return false;
    const memoryText = normalizeText(entry.content);
    return next_actions.some((action) => action && memoryText.includes(normalizeText(action)));
  });

  const actionPolicy = buildActionPolicy({
    reasoningOutput: result,
    operatorState: {
      openTasksCount: openTasks.length,
      alertCount: currentAlerts.length,
      strategicMemoryCount: strategicMemory.length,
      isRepeatedPattern: repeatedPattern,
    },
  });

  const toolRegistry = createToolRegistry({
    runProtocolIfNeeded,
    generateReport: ({ reasoningOutput, operatorState }) => buildKernelReport({ reasoningOutput, operatorState }),
  });

  const actionResults = await executeActionPlan({ policy: actionPolicy, toolRegistry });

  result.action_policy = actionPolicy.mode;
  result.action_results = actionResults;
  result.tasks_created = actionResults
    .filter((entry) => entry.action_name === "createTask" && entry.success && entry.result)
    .map((entry) => ({ id: entry.result._id, description: entry.result.description }));
  result.alerts_created = actionResults
    .filter((entry) => entry.action_name === "createAlert" && entry.success && entry.result)
    .map((entry) => ({ id: entry.result._id, message: entry.result.message, status: entry.result.status || "open" }));

  const protocolAction = actionResults.find((entry) => entry.action_name === "runProtocol");
  result.protocol_run = protocolAction?.success
    ? {
        id: protocolAction?.result?._id || null,
        protocol_name: protocolAction?.result?.protocol_name || protocol_to_run,
        status: protocolAction?.result?.status || "executed",
      }
    : null;
  result.memory_saved = actionResults.some((entry) => entry.action_name === "saveMemory" && entry.success);

  const cycleRecord = await KernelCycle.create({ trigger, output: result, error_summary: "" });

  await Promise.all(
    actionResults.map((entry) =>
      ActionExecution.create({
        ...entry,
        source: "action-kernel",
        reasoning_cycle_id: cycleRecord._id,
        timestamp: entry.timestamp ? new Date(entry.timestamp) : new Date(),
      })
    )
  );

  await KernelSnapshot.findOneAndUpdate(
    { singletonKey: "primary" },
    { $set: { latest_output: result }, $setOnInsert: { singletonKey: "primary" } },
    { upsert: true, new: true }
  );

  return { result, cycleRecord };
};

const runAgentLoopCycle = async () => {
  const { result } = await runAutonomousReasoningKernel({ trigger: "loop", text: "loop autonomous cycle", rawContext: { source: "agent-loop" } });

  const event = {
    type: "loop-cycle",
    state_summary: result.operator_state_summary,
    agent_summary: result.reasoning_summary,
    agent_mode: result.dominant_mode,
    agent_next_actions: result.next_actions,
    tasks_created: result.tasks_created.length,
    alerts_created: result.alerts_created.length,
    action_count: Array.isArray(result.action_results) ? result.action_results.length : 0,
    urgency_score: result.urgency_score,
    selected_node: result.selected_node,
  };

  loopState.lastRunAt = new Date();
  loopState.runCount += 1;
  loopState.lastError = "";
  loopState.lastReport = event;
  loopState.latestAgentSummary = event.agent_summary || "";
  loopState.latestAgentMode = event.agent_mode || "";
  loopState.latestAgentNextActions = event.agent_next_actions || [];
  loopState.latestActionExecutions = (result.action_results || []).slice(0, 5);
  appendLoopEvent(event);
  await persistLoopState({
    last_run_at: loopState.lastRunAt,
    run_count: loopState.runCount,
    last_error: "",
    latest_agent_summary: loopState.latestAgentSummary,
    latest_agent_mode: loopState.latestAgentMode,
    latest_agent_next_actions: loopState.latestAgentNextActions,
  });
  console.log(`Agent loop cycle completed | mode=${event.agent_mode} node=${event.selected_node} urgency=${event.urgency_score}`);

  return event;
};

const runAgentKernelEvaluation = async ({ text, rawContext, allowTaskExecution = true }) => {
  const [latestSignals, latestSystems, latestTasks, strategicMemory] = await Promise.all([
    SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean(),
    System.find().sort({ createdAt: -1 }).limit(5).lean(),
    Task.find().sort({ createdAt: -1 }).limit(10).lean(),
    StrategicMemory.find().sort({ updatedAt: -1 }).limit(5).lean(),
  ]);

  const mode_selected = selectAgentMode(text, latestSignals);
  const recentCommands = normalizeRecentCommands(rawContext);
  const actions_taken = [];
  const recommended_tasks = [];
  let objectives = [];
  let constraints = [];
  let risks = [];
  let leverage = [];
  let next_actions = [];

  if (process.env.Gemini_API_Key) {
    const prompt = buildAnalysisPrompt({
      text,
      mode: mode_selected,
      modeInstruction: "Generate tactical objectives and next actions for execution planning.",
      rawContext,
      latestSignals,
      latestSystems,
      latestTasks,
      strategicMemory,
    });

    const { error, result } = await requestModelAnalysisJson({ mode: analyzeMode, prompt });
    const usedResult = result || error || FALLBACK_ANALYSIS;
    objectives = usedResult.objectives || [];
    constraints = usedResult.constraints || [];
    risks = usedResult.risks || [];
    leverage = usedResult.leverage || [];
    next_actions = usedResult.next_actions || [];
    actions_taken.push(mode_selected === "recommend" ? "recommend" : "analyze");
  } else {
    objectives = ["Gemini_API_Key is missing on the server."];
    next_actions = ["Add Gemini_API_Key to enable full agent reasoning."];
  }

  if (/\b(execute|orchestrate|agent)\b/i.test(text) || /\b(task|todo|plan)\b/i.test(text)) {
    recommended_tasks.push(...next_actions.slice(0, 3));
  }

  if (/\bexecute\b/i.test(text) && recommended_tasks.length && allowTaskExecution) {
    const created = await Promise.all(
      recommended_tasks.map((description) => Task.create({ description, source: "agent-kernel" }))
    );
    actions_taken.push("create_tasks");
    recommended_tasks.splice(0, recommended_tasks.length, ...created.map((task) => task.description));
  }

  const matchedSystem = latestSystems.find((system) => normalizeText(text).includes(normalizeText(system?.name)));
  if (matchedSystem && /\b(run|execute|orchestrate|protocol)\b/i.test(text)) {
    actions_taken.push("run_system_protocol");
  }

  if (!actions_taken.length) actions_taken.push("strategic_plan");

  const summary = objectives[0] || `Agent reviewed ${latestSignals.length} signals, ${latestSystems.length} systems, and ${latestTasks.length} tasks.`;

  return {
    summary,
    mode_selected,
    actions_taken,
    recommended_tasks,
    objectives,
    constraints,
    risks,
    leverage,
    next_actions,
    context_scanned: {
      signals: latestSignals.length,
      systems: latestSystems.length,
      tasks: latestTasks.length,
      recent_commands: recentCommands,
      has_last_overlay: Boolean(rawContext?.lastOverlayResult),
    },
  };
};

const startAgentLoop = async ({ intervalMs } = {}) => {
  const resolvedInterval = Number(intervalMs) > 0 ? Number(intervalMs) : loopState.intervalMs;
  const shouldRestartTimer = Boolean(loopState.timer) && loopState.intervalMs !== resolvedInterval;
  if (loopState.active && loopState.timer && !shouldRestartTimer) return loopState;

  if (shouldRestartTimer) {
    clearInterval(loopState.timer);
    loopState.timer = null;
  }

  loopState.active = true;
  loopState.intervalMs = resolvedInterval;
  loopState.startedAt = new Date();
  loopState.lastError = "";

  await persistLoopState({ active: true, interval_ms: loopState.intervalMs, last_error: "" });

  try {
    await runAgentLoopCycle();
  } catch (error) {
    loopState.lastError = String(error?.message || error);
    await KernelCycle.create({ trigger: "loop", output: null, error_summary: loopState.lastError });
    appendLoopEvent({ type: "loop-cycle-error", error: loopState.lastError });
    await persistLoopState({ last_error: loopState.lastError });
  }

  loopState.timer = setInterval(async () => {
    try {
      await runAgentLoopCycle();
    } catch (error) {
      loopState.lastError = String(error?.message || error);
      await KernelCycle.create({ trigger: "loop", output: null, error_summary: loopState.lastError });
      appendLoopEvent({ type: "loop-cycle-error", error: loopState.lastError });
      await persistLoopState({ last_error: loopState.lastError });
    }
  }, loopState.intervalMs);

  console.log("Agent loop started");
  appendLoopEvent({ type: "loop-started", interval_ms: loopState.intervalMs });

  return loopState;
};

const stopAgentLoop = async () => {
  if (loopState.timer) {
    clearInterval(loopState.timer);
    loopState.timer = null;
  }
  loopState.active = false;
  loopState.lastError = "";
  appendLoopEvent({ type: "loop-stopped" });
  await persistLoopState({ active: false, last_error: "" });
  console.log("Agent loop stopped");
  return loopState;
};

const loopStatusPayload = () => ({
  active: loopState.active,
  interval_ms: loopState.intervalMs,
  started_at: loopState.startedAt,
  last_run_at: loopState.lastRunAt,
  run_count: loopState.runCount,
  last_error: loopState.lastError,
  latest_agent_summary: loopState.latestAgentSummary,
  latest_agent_mode: loopState.latestAgentMode,
  latest_agent_next_actions: loopState.latestAgentNextActions,
  latest_action_executions: loopState.latestActionExecutions,
  last_report: loopState.lastReport,
  recent_events: loopState.eventLog.slice(0, 10),
});

const restoreAgentLoopOnBoot = async () => {
  if (mongoose.connection.readyState !== 1) return;
  const record = await getLoopStateRecord();
  syncLoopStateFromRecord(record);
  appendLoopEvent({ type: "loop-restored", active: loopState.active, interval_ms: loopState.intervalMs });
  console.log("Agent loop restored on boot");
  if (record.active) {
    await startAgentLoop({ intervalMs: record.interval_ms });
  }
};

if (mongoose.connection.readyState === 1) {
  restoreAgentLoopOnBoot().catch((error) => {
    console.warn("Failed to restore agent loop on boot:", error?.message || error);
  });
} else {
  mongoose.connection.once("connected", () => {
    restoreAgentLoopOnBoot().catch((error) => {
      console.warn("Failed to restore agent loop on boot:", error?.message || error);
    });
  });
}

/* CORE REASONING */
router.post("/analyze", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  const analyzeModeInstructions = {
    general: "Balance strategic and practical reasoning using signals, systems, and recent context.",
    strategic: "Emphasize priorities, leverage, sequencing, and decision quality.",
    health: "Emphasize signals, stability, recovery, and stress patterns.",
    build: "Emphasize product design, architecture, engineering execution, and UX quality.",
    signal: "Emphasize trends, anomalies, and recent state changes in the signal stream.",
  };

  const modeMatch = text.match(/^(strategic|health|build|signal)\b\s*(.*)$/i);
  const analyzeMode = modeMatch ? modeMatch[1].toLowerCase() : "general";
  const modeSpecificCommand = modeMatch ? modeMatch[2].trim() : text;
  const effectiveCommand = modeSpecificCommand || text;

  if (!text) return res.status(400).json({ message: "Command text is required." });

  const rawContext = req.body?.context;
  const { latestSignals, latestSystems, latestTasks, strategicMemory } = await fetchStrategicContext();

  const prompt = buildAnalysisPrompt({
    text: effectiveCommand,
    mode: analyzeMode,
    modeInstruction: analyzeModeInstructions[analyzeMode] || analyzeModeInstructions.general,
    rawContext,
    latestSignals,
    latestSystems,
    latestTasks,
    strategicMemory,
  });

  try {
    const { error, result } = await requestModelAnalysisJson({ mode: analyzeMode, prompt });
    if (error) return res.json(error);
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ message: "Gemini request failed.", details: String(error?.message || error).slice(0, 500) });
  }
});

router.post("/recommend", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ message: "Command text is required." });

  const rawContext = req.body?.context;
  const { latestSignals, latestSystems, latestTasks, strategicMemory } = await fetchStrategicContext();

  const prompt = buildAnalysisPrompt({
    text,
    mode: "recommend",
    modeInstruction: "Prioritize decisive, high-leverage next actions based on current state.",
    rawContext,
    latestSignals,
    latestSystems,
    latestTasks,
    strategicMemory,
  });

  try {
    const { error, result } = await requestModelAnalysisJson({ mode: "recommend", prompt });
    if (error) return res.json(error);
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ message: "Gemini request failed.", details: String(error?.message || error).slice(0, 500) });
  }
});

router.post("/mentor", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ message: "Mentor prompt text is required." });

  const rawContext = req.body?.context;
  const { latestSignals, latestSystems, latestTasks, strategicMemory } = await fetchStrategicContext();

  const prompt = [
    "You are Mentor Node: a high-trust AI mentor embedded in SYZMEKU.",
    "Prioritize clarity, self-mastery, emotional intelligence, strategic reflection, and aligned action.",
    "Apply emotional intelligence policy: emotions are indicators, not commands.",
    "Use the response flow: acknowledge -> interpret -> guide.",
    "Acknowledge emotion without making diagnosis or treatment claims.",
    "Do not escalate harmful behavior and do not provide self-harm instructions.",
    "Provide coaching-style guidance, not diagnosis.",
    "Do not imitate therapy.",
    "Keep guidance concise, practical, and specific.",
    "Respond using the exact JSON schema and no extra keys.",
    "",
    buildAnalysisPrompt({
      text,
      mode: "mentor",
      modeInstruction:
        "Deliver reflection, reframing, motivational clarity, and one internal alignment step grounded in the provided context.",
      rawContext,
      latestSignals,
      latestSystems,
      latestTasks,
      strategicMemory,
    }),
  ].join("\n");

  try {
    const { error, result } = await requestModelAnalysisJson({ mode: "mentor", prompt });
    if (error) return res.json(error);
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ message: "Gemini request failed.", details: String(error?.message || error).slice(0, 500) });
  }
});

router.post("/agent", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ message: "Agent goal is required." });

  const rawContext = req.body?.context;
  const result = await runAgentKernelEvaluation({ text, rawContext, allowTaskExecution: true });
  return res.json(result);
});

router.post("/agent/evaluate", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "agent evaluate";
  const rawContext = req.body?.context || {};
  const { result } = await runAutonomousReasoningKernel({ trigger: "manual", text, rawContext });
  return res.json(result);
});

router.get("/kernel/status", async (_req, res) => {
  const snapshot = await KernelSnapshot.findOne({ singletonKey: "primary" }).lean();
  return res.json({ latest: snapshot?.latest_output || null, loop: loopStatusPayload() });
});

router.get("/kernel/inspect", async (_req, res) => {
  const cycles = await KernelCycle.find().sort({ createdAt: -1 }).limit(20).lean();
  const protocols = await ProtocolExecutionRecord.find().sort({ createdAt: -1 }).limit(20).lean();
  return res.json({ cycles, protocols });
});

router.get("/actions", async (_req, res) => {
  const actions = await ActionExecution.find().sort({ timestamp: -1 }).limit(25).lean();
  return res.json({ actions });
});

/* SYSTEM BUILDER */
router.post("/systems", async (req, res) => {
  const system = await System.create(req.body);
  res.json(system);
});

router.get("/systems", async (req, res) => {
  const systems = await System.find().sort({ createdAt: -1 });
  res.json(systems);
});

router.put("/systems/:id", async (req, res) => {
  const system = await System.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(system);
});

router.delete("/systems/:id", async (req, res) => {
  await System.findByIdAndDelete(req.params.id);
  res.json({ message: "System removed" });
});

router.get("/systems/map", async (req, res) => {
  const systems = await System.find().sort({ createdAt: -1 }).lean();
  const latestSignals = await SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean();
  const mappedSystems = systems.map((system) => {
    const mapped = mapSystemRecord(system);
    const keywordSet = new Set([
      normalizeText(mapped.name),
      normalizeText(mapped.purpose),
      normalizeText(mapped.protocolType),
      ...mapped.inputs.map(normalizeText),
      ...mapped.outputs.map(normalizeText),
      ...mapped.routines.map(normalizeText),
    ]);

    const relatedSignals = latestSignals.filter((signal) => {
      const signalText = normalizeText(`${signal?.symptoms || ""} ${signal?.notes || ""}`);
      return mapped.linkedSignals.some((key) => signalText.includes(key)) || [...keywordSet].some((keyword) => keyword && signalText.includes(keyword));
    });

    return {
      ...mapped,
      relatedSignals: relatedSignals.map((signal) => ({
        sleep: signal.sleep,
        stress: signal.stress,
        symptoms: signal.symptoms,
        createdAt: signal.createdAt,
      })),
    };
  });

  res.json({ count: mappedSystems.length, systems: mappedSystems });
});

router.post("/systems/run", async (req, res) => {
  const rawName = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!rawName) return res.status(400).json({ message: "System name is required." });

  const system = await System.findOne({ name: { $regex: `^${escapeRegex(rawName)}$`, $options: "i" } }).lean();
  if (!system) return res.status(404).json({ message: `System not found: ${rawName}` });

  const latestSignals = await SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean();
  const executionPlan = buildExecutionPlan(system, latestSignals);

  const executionRecord = await SystemExecution.create({
    systemId: system._id,
    systemName: system.name,
    readiness: executionPlan.risks.length ? "guarded" : "ready",
    riskFlags: executionPlan.risks,
    actions: executionPlan.next_actions,
    signalSnapshot: latestSignals[0]
      ? {
          sleep: latestSignals[0].sleep,
          stress: latestSignals[0].stress,
          symptoms: latestSignals[0].symptoms,
          notes: latestSignals[0].notes,
          createdAt: latestSignals[0].createdAt,
        }
      : null,
  });

  return res.json({
    system: mapSystemRecord(system),
    execution: {
      id: executionRecord._id,
      readiness: executionRecord.readiness,
      riskFlags: executionRecord.riskFlags,
      actions: executionRecord.actions,
      createdAt: executionRecord.createdAt,
    },
    ...executionPlan,
  });
});

router.post("/systems/automate", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) return res.status(400).json({ message: "System name is required." });

  const system = await System.findOneAndUpdate(
    { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } },
    { automationEnabled: true },
    { new: true }
  );

  if (!system) return res.status(404).json({ message: `System not found: ${name}` });
  return res.json({ message: `Automation enabled for ${system.name}.`, system: mapSystemRecord(system) });
});

router.post("/systems/disable", async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name) return res.status(400).json({ message: "System name is required." });

  const system = await System.findOneAndUpdate(
    { name: { $regex: `^${escapeRegex(name)}$`, $options: "i" } },
    { automationEnabled: false },
    { new: true }
  );

  if (!system) return res.status(404).json({ message: `System not found: ${name}` });
  return res.json({ message: `Automation disabled for ${system.name}.`, system: mapSystemRecord(system) });
});

router.get("/protocol/status", async (req, res) => {
  const systems = await System.find().sort({ name: 1 }).lean();
  await auditCoreAction(req, "protocol_status_viewed", { protocolCount: systems.length });
  return res.json({
    protocols: systems.map((system) => ({
      system_name: system.name,
      status: system.automationEnabled ? "enabled" : "disabled",
      trigger_conditions: Array.isArray(system.triggerConditions) ? system.triggerConditions : [],
      escalation_level: system.escalationLevel || "low",
    })),
  });
});

/* SIGNAL LOG */
router.post("/signals", async (req, res) => {
  const entry = await SignalEntry.create(req.body);
  await auditCoreAction(req, "signal_logged", { signalId: entry._id });
  res.json(entry);
});

router.get("/signals", async (req, res) => {
  const signals = await SignalEntry.find().sort({ createdAt: -1 });
  res.json({ entries: signals });
});

router.get("/signals/trends", async (req, res) => {
  const latestSignals = await SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean();
  res.json(computeSignalTrendBundle(latestSignals));
});

router.get("/signals/anomalies", async (req, res) => {
  const latestSignals = await SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean();
  const anomalies = detectSignalAnomalies(latestSignals);
  res.json({ sampleSize: latestSignals.length, anomalies });
});

router.get("/signals/report", async (req, res) => {
  const latestSignals = await SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean();
  const trends = computeSignalTrendBundle(latestSignals);
  const anomalies = detectSignalAnomalies(latestSignals);

  res.json({
    objectives: ["Maintain operational stability based on current signal trajectory."],
    constraints: [
      trends.sleep.state === "worsening" ? "Sleep trajectory is worsening." : "Sleep trajectory has no hard constraint.",
      trends.stress.state === "worsening" ? "Stress trajectory is worsening." : "Stress trajectory has no hard constraint.",
    ].filter(Boolean),
    risks: anomalies.length ? anomalies : ["No acute anomalies detected in latest sample."],
    leverage: [
      trends.sleep.state === "improving" ? "Sleep trend is improving; use as momentum." : "Use consistent recovery routines.",
      trends.stress.state === "improving" ? "Stress trend is improving; expand execution window." : "Reduce complexity while stress is unstable.",
    ],
    next_actions: ["Log one additional signal after the next critical work block.", "Run recommend next step to refresh tactical execution."],
  });
});

router.get("/sentinel/status", async (req, res) => {
  const [latestSignals, openAlerts, latestKernel] = await Promise.all([
    SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean(),
    AlertRecord.find({ status: "open" }).sort({ updatedAt: -1 }).limit(50).lean(),
    KernelSnapshot.findOne({ singletonKey: "primary" }).lean(),
  ]);

  const trends = computeSignalTrendBundle(latestSignals);
  const anomalies = detectSignalAnomalies(latestSignals);
  const escalation = buildDistressEscalation(latestSignals, anomalies);
  await auditCoreAction(req, "sentinel_status_viewed", { anomalyCount: anomalies.length, escalated: escalation.escalated });

  return res.json({
    node: "Axiom Sentinel",
    status: "active",
    latest_kernel_node: latestKernel?.latest_output?.selected_node || "recommend",
    latest_kernel_mode: latestKernel?.latest_output?.dominant_mode || "general",
    open_alert_count: openAlerts.length,
    anomaly_count: anomalies.length,
    trend_states: {
      sleep: trends.sleep?.state || "insufficient-data",
      stress: trends.stress?.state || "insufficient-data",
      symptoms: trends.symptoms?.state || "insufficient-data",
    },
    last_monitor_run: autonomyState.lastRunAt,
    distress_escalation: escalation,
  });
});

router.get("/sentinel/scan", async (req, res) => {
  const [monitorReport, anomaliesPayload, signalReport] = await Promise.all([
    evaluateMonitorState(),
    (async () => {
      const latestSignals = await SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean();
      return { sampleSize: latestSignals.length, anomalies: detectSignalAnomalies(latestSignals) };
    })(),
    (async () => {
      const latestSignals = await SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean();
      const trends = computeSignalTrendBundle(latestSignals);
      return {
        trends,
        summary: `Sentinel scan completed on ${latestSignals.length} recent signal entries.`,
      };
    })(),
  ]);

  const escalation = buildDistressEscalation([], anomaliesPayload.anomalies || []);
  await auditCoreAction(req, "sentinel_scan", { anomalyCount: anomaliesPayload.anomalies?.length || 0, escalated: escalation.escalated });

  return res.json({
    node: "Axiom Sentinel",
    scan_completed_at: new Date().toISOString(),
    monitor: monitorReport,
    anomalies: anomaliesPayload,
    signals: signalReport,
    distress_escalation: escalation,
  });
});

router.get("/sentinel/report", async (req, res) => {
  const [monitorReport, alerts, latestActions] = await Promise.all([
    evaluateMonitorState(),
    AlertRecord.find({ status: "open" }).sort({ updatedAt: -1 }).limit(10).lean(),
    ActionExecution.find().sort({ timestamp: -1 }).limit(10).lean(),
  ]);

  await auditCoreAction(req, "sentinel_report", { openAlertCount: alerts.length });

  return res.json({
    sentinel: "Axiom Sentinel",
    generated_at: new Date().toISOString(),
    risk_summary: monitorReport.risks,
    active_alerts: alerts,
    recommended_actions: monitorReport.recommended_actions,
    recent_action_history: latestActions,
    state_summary: monitorReport.state_summary,
  });
});

router.post("/monitor/run", async (req, res) => {
  const report = await evaluateMonitorState();
  await auditCoreAction(req, "sentinel_monitor_run", { alertCount: report.alerts?.length || 0 });
  return res.json({
    alerts: report.alerts,
    risks: report.risks,
    recommended_actions: report.recommended_actions,
    state_summary: report.state_summary,
  });
});

router.get("/alerts", async (req, res) => {
  const alerts = await AlertRecord.find({ status: "open" }).sort({ updatedAt: -1 }).limit(50).lean();
  if (alerts.length) return res.json({ alerts });
  if (!autonomyState.lastRunAt) await evaluateMonitorState();
  return res.json({ alerts: autonomyState.activeAlerts.length ? autonomyState.activeAlerts : [] });
});

router.get("/autonomy/status", async (_req, res) => {
  const [alertCount, latestKernel] = await Promise.all([
    AlertRecord.countDocuments({ status: "open" }),
    KernelSnapshot.findOne({ singletonKey: "primary" }).lean(),
  ]);
  return res.json({
    monitoring_enabled: autonomyState.monitoringEnabled,
    last_monitor_run: autonomyState.lastRunAt,
    active_alerts_count: alertCount,
    latest_kernel_mode: latestKernel?.latest_output?.dominant_mode || "",
    latest_kernel_node: latestKernel?.latest_output?.selected_node || "",
  });
});

router.get("/loop/status", async (_req, res) => {
  const record = await getLoopStateRecord();
  syncLoopStateFromRecord(record);
  return res.json(loopStatusPayload());
});

router.post("/loop/start", async (req, res) => {
  try {
    const requestedInterval = Number(req.body?.interval_ms);
    await startAgentLoop({ intervalMs: requestedInterval });
    await auditCoreAction(req, "loop_started", { intervalMs: loopState.intervalMs });
    return res.json({ message: "Agent loop started.", ...loopStatusPayload() });
  } catch (error) {
    const details = buildLoopStartErrorDetails(error);
    console.error("Loop start failed:", error?.message || error);
    console.error(error?.stack || "No stack trace available.");

    if (error?.name === "ValidationError" && error?.errors && typeof error.errors === "object") {
      const validationDetails = Object.entries(error.errors).map(([field, detail]) => ({
        field,
        message: detail?.message || String(detail),
        kind: detail?.kind,
        value: detail?.value,
      }));
      console.error("Loop start validation error details:", validationDetails);
    }

    if (error?.code || error?.codeName || error?.errmsg || error?.writeErrors || error?.result) {
      console.error("Loop start update error details:", {
        code: error?.code,
        codeName: error?.codeName,
        errmsg: error?.errmsg,
        writeErrors: error?.writeErrors,
        result: error?.result,
      });
    }

    return res.status(502).json({
      message: "Loop start failed",
      details,
    });
  }
});

router.post("/loop/stop", async (req, res) => {
  await stopAgentLoop();
  await auditCoreAction(req, "loop_stopped", {});
  return res.json({ message: "Agent loop stopped.", ...loopStatusPayload() });
});

/* TASKS */
router.post("/tasks", async (req, res) => {
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const source = typeof req.body?.source === "string" ? req.body.source.trim() : "";
  if (!description) return res.status(400).json({ message: "Task description is required." });

  const task = await Task.create({ description, source });
  await auditCoreAction(req, "task_created", { taskId: task._id, source: task.source });
  return res.json(task);
});

router.get("/tasks", async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 }).lean();
  return res.json({ tasks });
});

router.post("/tasks/:id/complete", async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: `Task not found: ${req.params.id}` });

  task.status = "done";
  task.completedAt = new Date();
  await task.save();
  await auditCoreAction(req, "task_completed", { taskId: task._id });
  return res.json(task);
});

router.post("/tasks/save-recommendation", async (req, res) => {
  const nextActions = Array.isArray(req.body?.nextActions) ? req.body.nextActions : [];

  const created = await Promise.all(
    nextActions
      .map((action) => (typeof action === "string" ? action.trim() : ""))
      .filter(Boolean)
      .map((description) => Task.create({ description, source: "recommendation" }))
  );

  return res.json({ tasks: created });
});

/* STRATEGIC MEMORY */
router.post("/memory/save", async (req, res) => {
  const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
  if (!content) return res.status(400).json({ message: "Memory content is required." });

  const memory = await StrategicMemory.create({
    title: content.split(".")[0].slice(0, 80) || "Strategic note",
    category: typeof req.body?.category === "string" ? req.body.category.trim() : "general",
    content,
    sourceCommand: typeof req.body?.sourceCommand === "string" ? req.body.sourceCommand.trim() : "memory save",
    tags: Array.isArray(req.body?.tags) ? req.body.tags.filter(Boolean) : [],
  });

  await auditCoreAction(req, "memory_saved", { memoryId: memory._id, category: memory.category });
  return res.json(memory);
});

router.get("/memory", async (req, res) => {
  const entries = await StrategicMemory.find().sort({ updatedAt: -1 }).limit(50).lean();
  return res.json({ entries });
});

router.get("/memory/search", async (req, res) => {
  const query = typeof req.query?.query === "string" ? req.query.query.trim() : "";
  if (!query) return res.status(400).json({ message: "Search query is required." });

  const regex = new RegExp(escapeRegex(query), "i");
  const entries = await StrategicMemory.find({
    $or: [{ title: regex }, { category: regex }, { content: regex }, { tags: regex }],
  })
    .sort({ updatedAt: -1 })
    .limit(50)
    .lean();

  return res.json({ query, entries });
});

router.post("/data/export-request", async (req, res) => {
  const request = await DataRequest.create({ userId: req.user._id, requestType: "export", notes: String(req.body?.notes || "") });
  await auditCoreAction(req, "data_export_requested", { requestId: request._id });
  return res.status(201).json({ request });
});

router.post("/data/delete-request", async (req, res) => {
  const request = await DataRequest.create({ userId: req.user._id, requestType: "delete", notes: String(req.body?.notes || "") });
  await auditCoreAction(req, "data_delete_requested", { requestId: request._id });
  return res.status(201).json({ request });
});

router.get("/data/requests", async (req, res) => {
  const requests = await DataRequest.find({ userId: req.user._id }).sort({ createdAt: -1 }).lean();
  return res.json({ requests });
});

router.get("/summary", async (_req, res) => {
  const [latestSignal] = await SignalEntry.find().sort({ createdAt: -1 }).limit(1).lean();
  const [openTasks, memoryCount, openAlerts, snapshot, recentActions] = await Promise.all([
    Task.countDocuments({ status: "open" }),
    StrategicMemory.countDocuments(),
    AlertRecord.find({ status: "open" }).sort({ updatedAt: -1 }).limit(20).lean(),
    KernelSnapshot.findOne({ singletonKey: "primary" }).lean(),
    ActionExecution.find().sort({ timestamp: -1 }).limit(5).lean(),
  ]);
  if (!autonomyState.lastRunAt) await evaluateMonitorState();
  const loopRecord = await getLoopStateRecord();
  syncLoopStateFromRecord(loopRecord);

  const kernel = snapshot?.latest_output || null;

  return res.json({
    state_summary: latestSignal
      ? `Sleep ${latestSignal.sleep ?? "n/a"}, Stress ${latestSignal.stress ?? "n/a"}, Symptoms ${latestSignal.symptoms || "n/a"}.`
      : "No recent signal state available.",
    high_priority_focus: openAlerts.length ? "Address active alerts and stabilize signals." : "Continue strategic build execution.",
    active_alerts: openAlerts,
    active_alerts_count: openAlerts.length,
    open_task_count: openTasks,
    memory_status: memoryCount > 0 ? `ACTIVE (${memoryCount} entries)` : "EMPTY",
    recommended_next_move: openAlerts.length
      ? "Run monitor run, then prioritize highest-severity alert."
      : "Run agent evaluate to refresh autonomous reasoning.",
    latest_kernel_summary: kernel?.reasoning_summary || "No kernel cycle recorded yet.",
    latest_kernel_mode: kernel?.dominant_mode || "general",
    latest_kernel_node: kernel?.selected_node || "recommend",
    latest_kernel_urgency: kernel?.urgency_score ?? 0,
    latest_kernel_next_actions: Array.isArray(kernel?.next_actions) ? kernel.next_actions.slice(0, 3) : [],
    latest_kernel_task_outcomes: Array.isArray(kernel?.tasks_created) ? kernel.tasks_created : [],
    latest_kernel_alert_outcomes: Array.isArray(kernel?.alerts_created) ? kernel.alerts_created : [],
    latest_kernel_timestamp: kernel?.timestamp || null,
    latest_actions: recentActions,
    autonomy_status: {
      monitoring_enabled: autonomyState.monitoringEnabled,
      last_monitor_run: autonomyState.lastRunAt,
    },
    loop_status: {
      active: loopState.active,
      interval_ms: loopState.intervalMs,
      last_run_at: loopState.lastRunAt,
      run_count: loopState.runCount,
      last_error: loopState.lastError,
      latest_agent_summary: loopState.latestAgentSummary,
      latest_agent_mode: loopState.latestAgentMode,
      latest_agent_next_actions: loopState.latestAgentNextActions,
    },
  });
});

router.get("/model-router/status", async (_req, res) => {
  return res.json({ aliases: getModelRoutingConfig() });
});

router.get("/operator/visibility", async (req, res) => {
  return res.json(resolveOperatorVisibility(req.user));
});

router.post("/dev/set-role", async (req, res) => {
  if (String(process.env.NODE_ENV) === "production") {
    return res.status(403).json({ message: "Dev helper is disabled in production." });
  }

  const nextRole = String(req.body?.role || "").trim();
  if (!nextRole) return res.status(400).json({ message: "role is required" });
  const updated = await User.findByIdAndUpdate(req.user._id, { role: nextRole }, { new: true }).select("name email role");
  return res.json({ message: "Role updated for testing.", user: updated });
});

router.get("/onboarding/status", async (req, res) => {
  const user = await User.findById(req.user._id).select("onboarding healthSync name").lean();
  return res.json({
    completed: Boolean(user?.onboarding?.completed),
    completedAt: user?.onboarding?.completedAt || null,
    profile: user?.onboarding?.profile || {},
    healthSync: user?.healthSync || { provider: "health_connect", status: "disconnected" },
    welcomeName: user?.onboarding?.profile?.preferredName || user?.name || "there",
  });
});

router.post("/onboarding/complete", async (req, res) => {
  const payload = req.body || {};
  const profile = {
    preferredName: String(payload.preferredName || "").trim(),
    lifeStage: String(payload.lifeStage || "").trim(),
    supportAreas: Array.isArray(payload.supportAreas) ? payload.supportAreas.filter(Boolean) : [],
    mentorStyle: String(payload.mentorStyle || "gentle").trim() || "gentle",
    baseline: {
      sleep: Number(payload?.baseline?.sleep || 0),
      stress: Number(payload?.baseline?.stress || 0),
      energy: Number(payload?.baseline?.energy || 0),
      mood: String(payload?.baseline?.mood || "").trim(),
      symptoms: String(payload?.baseline?.symptoms || "").trim(),
      focusChallenge: String(payload?.baseline?.focusChallenge || "").trim(),
    },
    goals: Array.isArray(payload.goals) ? payload.goals.filter(Boolean) : [],
    signalSetup: String(payload.signalSetup || "manual"),
  };

  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        onboarding: {
          completed: true,
          completedAt: new Date(),
          profile,
        },
      },
    },
    { new: true }
  ).select("onboarding");

  return res.json({ onboarding: user?.onboarding || null });
});

router.get("/health-sync/status", async (req, res) => {
  const user = await User.findById(req.user._id).select("healthSync").lean();
  return res.json({
    healthSync: user?.healthSync || { provider: "health_connect", status: "disconnected" },
    integration: getHealthIntegrationMeta(),
  });
});

router.post("/health-sync/connect", async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        healthSync: {
          provider: "health_connect",
          status: "pending",
          lastError: "",
          updatedAt: new Date(),
        },
      },
    },
    { new: true }
  ).select("healthSync");

  return res.json({
    healthSync: user?.healthSync,
    nextStep: "Complete Health Connect permissions in Android app layer.",
  });
});

router.post("/health-sync/mock-import", async (req, res) => {
  const parsed = parseSleepPayload(req.body || {});
  const hours = Number(parsed.sleepHours || 7);
  await SignalEntry.create({ sleep: hours, stress: Number(req.body?.stress || 3), symptoms: String(req.body?.symptoms || "health-connect-import") });
  await User.findByIdAndUpdate(req.user._id, {
    $set: {
      healthSync: {
        provider: "health_connect",
        status: "connected",
        lastError: "",
        updatedAt: new Date(),
      },
    },
  });
  return res.json({ imported: true, provider: "health_connect", sleepHours: hours });
});

/* legacy routes kept for compatibility */
router.get("/map/systems", async (req, res) => res.redirect(307, "/api/core/systems/map"));
router.get("/trends/signals", async (req, res) => res.redirect(307, "/api/core/signals/trends"));
router.post("/task/create", async (req, res) => res.redirect(307, "/api/core/tasks"));
router.get("/task/list", async (req, res) => res.redirect(307, "/api/core/tasks"));
router.post("/task/complete", async (req, res) => {
  const taskId = typeof req.body?.id === "string" ? req.body.id.trim() : "";
  if (!taskId) return res.status(400).json({ message: "Task id is required." });

  const task = await Task.findById(taskId);
  if (!task) return res.status(404).json({ message: `Task not found: ${taskId}` });

  task.status = "done";
  task.completedAt = new Date();
  await task.save();

  return res.json(task);
});

module.exports = router;
