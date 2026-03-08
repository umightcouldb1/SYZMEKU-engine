const router = require("express").Router();
const System = require("../../models/System");
const SignalEntry = require("../../models/SignalEntry");
const SystemExecution = require("../../models/SystemExecution");
const Task = require("../../models/Task");
const StrategicMemory = require("../../models/StrategicMemory");

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

const LOOP_INTERVAL_MS = Number(process.env.AGENT_LOOP_INTERVAL_MS) > 0 ? Number(process.env.AGENT_LOOP_INTERVAL_MS) : 6 * 60 * 60 * 1000;
const loopState = {
  active: false,
  intervalMs: LOOP_INTERVAL_MS,
  timer: null,
  startedAt: null,
  lastRunAt: null,
  runCount: 0,
  lastReport: null,
  eventLog: [],
  lastError: null,
};

const appendLoopEvent = (event) => {
  loopState.eventLog = [{ recordedAt: new Date().toISOString(), ...event }, ...loopState.eventLog].slice(0, 50);
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

const requestGeminiJson = async (prompt) => {
  const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.Gemini_API_Key,
    },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text();
    return {
      error: {
        objectives: ["Gemini HTTP error"],
        constraints: [`HTTP status: ${geminiResponse.status}`],
        risks: [String(errorText || "").slice(0, 300)],
        leverage: ["Check Gemini_API_Key, API enablement, endpoint, and model name."],
        next_actions: ["Fix the reported HTTP error and retry command."],
      },
    };
  }

  const data = await geminiResponse.json();
  const modelText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  let parsed;
  try {
    parsed = JSON.parse(modelText);
  } catch {
    return {
      error: {
        objectives: ["Gemini returned non-JSON output."],
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

const runAgentLoopCycle = async () => {
  const report = await evaluateMonitorState();
  const agentReport = await runAgentKernelEvaluation({
    text: "Evaluate current operating state and recommend immediate next actions.",
    rawContext: {
      source: "agent-loop",
      monitorState: report,
    },
    allowTaskExecution: false,
  });
  const enabledProtocols = await System.find({ automationEnabled: true }).sort({ updatedAt: -1 }).lean();
  const protocolTriggers = enabledProtocols
    .flatMap((system) => (Array.isArray(system?.triggerConditions) ? system.triggerConditions : []))
    .map((trigger) => String(trigger || "").trim())
    .filter(Boolean);

  const event = {
    type: "loop-cycle",
    alerts: report.alerts,
    monitor_state: report.state_summary,
    protocol_trigger_count: protocolTriggers.length,
    protocol_triggers: protocolTriggers.slice(0, 10),
    recommended_actions: report.recommended_actions,
    agent_summary: agentReport.summary,
    agent_mode: agentReport.mode_selected,
    agent_next_actions: agentReport.next_actions.slice(0, 5),
  };

  loopState.lastRunAt = new Date();
  loopState.runCount += 1;
  loopState.lastError = null;
  loopState.lastReport = event;
  appendLoopEvent(event);

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

    const { error, result } = await requestGeminiJson(prompt);
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

const startAgentLoop = async () => {
  if (loopState.active && loopState.timer) return loopState;

  loopState.active = true;
  loopState.startedAt = new Date();
  loopState.lastError = null;

  try {
    await runAgentLoopCycle();
  } catch (error) {
    loopState.lastError = String(error?.message || error);
    appendLoopEvent({ type: "loop-cycle-error", error: loopState.lastError });
  }

  loopState.timer = setInterval(async () => {
    try {
      await runAgentLoopCycle();
    } catch (error) {
      loopState.lastError = String(error?.message || error);
      appendLoopEvent({ type: "loop-cycle-error", error: loopState.lastError });
    }
  }, loopState.intervalMs);

  return loopState;
};

const stopAgentLoop = () => {
  if (loopState.timer) {
    clearInterval(loopState.timer);
    loopState.timer = null;
  }
  loopState.active = false;
  appendLoopEvent({ type: "loop-stopped" });
  return loopState;
};

const loopStatusPayload = () => ({
  active: loopState.active,
  interval_ms: loopState.intervalMs,
  started_at: loopState.startedAt,
  last_run_at: loopState.lastRunAt,
  run_count: loopState.runCount,
  last_error: loopState.lastError,
  last_report: loopState.lastReport,
  recent_events: loopState.eventLog.slice(0, 10),
});

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

  if (!process.env.Gemini_API_Key) {
    return res.json({
      objectives: ["Gemini_API_Key is missing on the server."],
      constraints: [],
      risks: [],
      leverage: [],
      next_actions: ["Add Gemini_API_Key to Render environment variables."],
    });
  }

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
    const { error, result } = await requestGeminiJson(prompt);
    if (error) return res.json(error);
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ message: "Gemini request failed.", details: String(error?.message || error).slice(0, 500) });
  }
});

router.post("/recommend", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ message: "Command text is required." });

  if (!process.env.Gemini_API_Key) {
    return res.json({
      objectives: ["Gemini_API_Key is missing on the server."],
      constraints: [],
      risks: [],
      leverage: [],
      next_actions: ["Add Gemini_API_Key to Render environment variables."],
    });
  }

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
    const { error, result } = await requestGeminiJson(prompt);
    if (error) return res.json(error);
    return res.json(result);
  } catch (error) {
    return res.status(502).json({ message: "Gemini request failed.", details: String(error?.message || error).slice(0, 500) });
  }
});

router.post("/mentor", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return res.status(400).json({ message: "Mentor prompt text is required." });

  if (!process.env.Gemini_API_Key) {
    return res.json({
      objectives: ["Gemini_API_Key is missing on the server."],
      constraints: [],
      risks: [],
      leverage: [],
      next_actions: ["Add Gemini_API_Key to Render environment variables."],
    });
  }

  const rawContext = req.body?.context;
  const { latestSignals, latestSystems, latestTasks, strategicMemory } = await fetchStrategicContext();

  const prompt = [
    "You are Mentor Node: a high-trust AI mentor embedded in SYZMEKU.",
    "Prioritize clarity, self-mastery, emotional intelligence, strategic reflection, and aligned action.",
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
    const { error, result } = await requestGeminiJson(prompt);
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

router.get("/protocol/status", async (_req, res) => {
  const systems = await System.find().sort({ name: 1 }).lean();
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
  res.json(entry);
});

router.get("/signals", async (req, res) => {
  const signals = await SignalEntry.find().sort({ createdAt: -1 });
  res.json(signals);
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

router.post("/monitor/run", async (_req, res) => {
  const report = await evaluateMonitorState();
  return res.json({
    alerts: report.alerts,
    risks: report.risks,
    recommended_actions: report.recommended_actions,
    state_summary: report.state_summary,
  });
});

router.get("/alerts", async (_req, res) => {
  if (!autonomyState.lastRunAt) await evaluateMonitorState();
  return res.json({ alerts: autonomyState.activeAlerts });
});

router.get("/autonomy/status", async (_req, res) => {
  return res.json({
    monitoring_enabled: autonomyState.monitoringEnabled,
    last_monitor_run: autonomyState.lastRunAt,
    active_alerts_count: autonomyState.activeAlerts.length,
  });
});

router.get("/loop/status", async (_req, res) => {
  return res.json(loopStatusPayload());
});

router.post("/loop/start", async (_req, res) => {
  await startAgentLoop();
  return res.json({ message: "Agent loop started.", ...loopStatusPayload() });
});

router.post("/loop/stop", async (_req, res) => {
  stopAgentLoop();
  return res.json({ message: "Agent loop stopped.", ...loopStatusPayload() });
});

/* TASKS */
router.post("/tasks", async (req, res) => {
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const source = typeof req.body?.source === "string" ? req.body.source.trim() : "";
  if (!description) return res.status(400).json({ message: "Task description is required." });

  const task = await Task.create({ description, source });
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

  return res.json(memory);
});

router.get("/memory", async (_req, res) => {
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

router.get("/summary", async (_req, res) => {
  const [latestSignal] = await SignalEntry.find().sort({ createdAt: -1 }).limit(1).lean();
  const [openTasks, memoryCount] = await Promise.all([
    Task.countDocuments({ status: "open" }),
    StrategicMemory.countDocuments(),
  ]);
  if (!autonomyState.lastRunAt) await evaluateMonitorState();

  return res.json({
    state_summary: latestSignal
      ? `Sleep ${latestSignal.sleep ?? "n/a"}, Stress ${latestSignal.stress ?? "n/a"}, Symptoms ${latestSignal.symptoms || "n/a"}.`
      : "No recent signal state available.",
    high_priority_focus: autonomyState.activeAlerts.length ? "Address active alerts and stabilize signals." : "Continue strategic build execution.",
    active_alerts: autonomyState.activeAlerts,
    active_alerts_count: autonomyState.activeAlerts.length,
    open_task_count: openTasks,
    memory_status: memoryCount > 0 ? `ACTIVE (${memoryCount} entries)` : "EMPTY",
    recommended_next_move: autonomyState.activeAlerts.length
      ? "Run monitor run, then prioritize highest-severity alert."
      : "Run agent with current objective to generate next actions.",
    autonomy_status: {
      monitoring_enabled: autonomyState.monitoringEnabled,
      last_monitor_run: autonomyState.lastRunAt,
    },
    loop_status: {
      active: loopState.active,
      interval_ms: loopState.intervalMs,
      last_run_at: loopState.lastRunAt,
      run_count: loopState.runCount,
    },
  });
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
