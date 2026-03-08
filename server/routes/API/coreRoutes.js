const router = require("express").Router();
const System = require("../../models/System");
const SignalEntry = require("../../models/SignalEntry");
const SystemExecution = require("../../models/SystemExecution");
const Task = require("../../models/Task");

const REQUIRED_ANALYSIS_KEYS = ["objectives", "constraints", "risks", "leverage", "next_actions"];
const LINKABLE_SIGNAL_KEYS = ["sleep", "stress", "symptoms", "notes"];

const FALLBACK_ANALYSIS = {
  objectives: ["Gemini JSON missing required keys."],
  constraints: [],
  risks: [],
  leverage: [],
  next_actions: ["Adjust model prompt to always return the required schema."],
};

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalizeRecentCommands = (rawContext) =>
  Array.isArray(rawContext?.recentCommands)
    ? rawContext.recentCommands
        .map((command) => {
          if (typeof command === "string") {
            return command.trim();
          }

          if (command && typeof command === "object") {
            const normalized =
              typeof command.text === "string"
                ? command.text
                : typeof command.command === "string"
                  ? command.command
                  : "";
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
        if (typeof value === "string" && value.trim()) {
          return `${key}: ${value.trim()}`;
        }

        if (typeof value === "number" || typeof value === "boolean") {
          return `${key}: ${String(value)}`;
        }

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
    const [latestSignals, latestSystems, latestTasks] = await Promise.all([
      SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean(),
      System.find().sort({ createdAt: -1 }).limit(5).lean(),
      Task.find().sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    return { latestSignals, latestSystems, latestTasks };
  } catch (dbError) {
    console.warn("Failed to fetch strategic context:", dbError?.message || dbError);
    return { latestSignals: [], latestSystems: [], latestTasks: [] };
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
    recommendedActions: Array.isArray(system?.recommendedActions)
      ? system.recommendedActions.filter(Boolean)
      : [],
    inputs,
    outputs,
    routines,
    linkedSignals,
  };
};

const describeNumericTrend = (values) => {
  if (!Array.isArray(values) || values.length < 2) {
    return { direction: "insufficient-data", delta: 0, latest: null, previous: null };
  }

  const latest = values[0];
  const previous = values[values.length - 1];
  const delta = Number((latest - previous).toFixed(2));

  if (delta > 0) {
    return { direction: "increasing", delta, latest, previous };
  }

  if (delta < 0) {
    return { direction: "decreasing", delta, latest, previous };
  }

  return { direction: "stable", delta, latest, previous };
};

const describeSymptomsTrend = (entries) => {
  const normalized = entries.map((entry) => normalizeText(entry?.symptoms)).filter(Boolean);

  if (!normalized.length) {
    return { direction: "insufficient-data", latest: null };
  }

  if (normalized.length === 1) {
    return { direction: "single-entry", latest: normalized[0] };
  }

  const uniqueRecent = new Set(normalized.slice(0, 3));

  return {
    direction: uniqueRecent.size === 1 ? "stable" : "mixed",
    latest: normalized[0],
  };
};

const toDirectionalState = (trendDirection, increaseMeansImproving = false) => {
  if (trendDirection === "stable") {
    return "stable";
  }

  if (trendDirection === "insufficient-data" || trendDirection === "single-entry") {
    return "insufficient-data";
  }

  if (increaseMeansImproving) {
    return trendDirection === "increasing" ? "improving" : "worsening";
  }

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
    sleep: {
      ...sleepTrend,
      state: toDirectionalState(sleepTrend.direction, true),
    },
    stress: {
      ...stressTrend,
      state: toDirectionalState(stressTrend.direction, false),
    },
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
      if (deltaStress >= 3) {
        anomalies.push(`Stress spike detected (${previous.stress} -> ${current.stress}).`);
      }
    }

    if (typeof current?.sleep === "number" && typeof previous?.sleep === "number") {
      const deltaSleep = previous.sleep - current.sleep;
      if (deltaSleep >= 2) {
        anomalies.push(`Sleep drop detected (${previous.sleep} -> ${current.sleep}).`);
      }
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

  if ((system?.name || "").toLowerCase().includes("recovery")) {
    leverage.push("Recovery system detected; prioritize stabilization and pacing.");
  }

  if (!leverage.length) {
    leverage.push("Use routine sequencing to create momentum.");
  }

  const next_actions = routines.length
    ? routines.slice(0, 5).map((routine, index) => `Step ${index + 1}: ${routine}`)
    : [
        "Step 1: Review the latest signal profile.",
        "Step 2: Execute one high-leverage routine for this system.",
        "Step 3: Record a follow-up signal and reassess.",
      ];

  return {
    objectives,
    constraints,
    risks,
    leverage,
    next_actions,
  };
};

const requestGeminiJson = async (prompt) => {
  const geminiResponse = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.Gemini_API_Key,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
      }),
    }
  );

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

  const hasAllRequiredKeys =
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    REQUIRED_ANALYSIS_KEYS.every((key) => Object.prototype.hasOwnProperty.call(parsed, key));

  if (!hasAllRequiredKeys) {
    return { result: FALLBACK_ANALYSIS };
  }

  const normalized = REQUIRED_ANALYSIS_KEYS.reduce((acc, key) => {
    const value = parsed[key];
    acc[key] = Array.isArray(value)
      ? value
          .map((item) => (typeof item === "string" ? item.trim() : String(item || "").trim()))
          .filter(Boolean)
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
}) => {
  const signalContextLines = toContextLines(latestSignals, ["sleep", "stress", "symptoms", "notes"]);

  const systemContextLines = toContextLines(latestSystems, [
    "name",
    "purpose",
    "protocolType",
    "inputs",
    "outputs",
    "routines",
  ]);

  const taskContextLines = toContextLines(latestTasks, ["description", "status", "source"]);
  const hasLastOverlayResult = lastOverlayResult && typeof lastOverlayResult === "object";

  return [
    `Current user command: ${commandText}`,
    `Active route type: ${activeRouteType || "(none provided)"}`,
    `Recent command history: ${recentCommands.length ? JSON.stringify(recentCommands) : "(none provided)"}`,
    "Latest signals (newest first, max 5):",
    ...(signalContextLines.length ? signalContextLines : ["(none found)"]),
    "Latest systems (newest first, max 5):",
    ...(systemContextLines.length ? systemContextLines : ["(none found)"]),
    "Latest tasks (newest first, max 5):",
    ...(taskContextLines.length ? taskContextLines : ["(none found)"]),
    hasLastOverlayResult
      ? `Last overlay result summary: ${JSON.stringify(lastOverlayResult)}`
      : "Last overlay result summary: (none provided)",
  ];
};

const buildAnalysisPrompt = ({ text, mode, modeInstruction, rawContext, latestSignals, latestSystems, latestTasks }) => {
  const recentCommands = normalizeRecentCommands(rawContext);
  const activeRouteType = typeof rawContext?.activeRouteType === "string" ? rawContext.activeRouteType.trim() : "";

  return [
    "Reason like a strategic operating system.",
    "Synthesize command + systems + signals + task queue + recent session context.",
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
    }),
  ].join("\n");
};

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

  if (!text) {
    return res.status(400).json({ message: "Command text is required." });
  }

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
  const { latestSignals, latestSystems, latestTasks } = await fetchStrategicContext();

  const prompt = buildAnalysisPrompt({
    text: effectiveCommand,
    mode: analyzeMode,
    modeInstruction: analyzeModeInstructions[analyzeMode] || analyzeModeInstructions.general,
    rawContext,
    latestSignals,
    latestSystems,
    latestTasks,
  });

  try {
    const { error, result } = await requestGeminiJson(prompt);
    if (error) {
      return res.json(error);
    }

    return res.json(result);
  } catch (error) {
    return res.status(502).json({
      message: "Gemini request failed.",
      details: String(error?.message || error).slice(0, 500),
    });
  }
});

router.post("/recommend", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  if (!text) {
    return res.status(400).json({ message: "Command text is required." });
  }

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
  const { latestSignals, latestSystems, latestTasks } = await fetchStrategicContext();

  const prompt = buildAnalysisPrompt({
    text,
    mode: "recommend",
    modeInstruction: "Prioritize decisive, high-leverage next actions based on current state.",
    rawContext,
    latestSignals,
    latestSystems,
    latestTasks,
  });

  try {
    const { error, result } = await requestGeminiJson(prompt);
    if (error) {
      return res.json(error);
    }

    return res.json(result);
  } catch (error) {
    return res.status(502).json({
      message: "Gemini request failed.",
      details: String(error?.message || error).slice(0, 500),
    });
  }
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
      return mapped.linkedSignals.some((key) => signalText.includes(key)) ||
        [...keywordSet].some((keyword) => keyword && signalText.includes(keyword));
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

  if (!rawName) {
    return res.status(400).json({ message: "System name is required." });
  }

  const system = await System.findOne({
    name: { $regex: `^${escapeRegex(rawName)}$`, $options: "i" },
  }).lean();

  if (!system) {
    return res.status(404).json({ message: `System not found: ${rawName}` });
  }

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

  res.json({
    sampleSize: latestSignals.length,
    anomalies,
  });
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
    next_actions: [
      "Log one additional signal after the next critical work block.",
      "Run recommend next step to refresh tactical execution.",
    ],
  });
});

router.get("/alerts", async (req, res) => {
  const latestSignals = await SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean();
  const trends = computeSignalTrendBundle(latestSignals);
  const anomalies = detectSignalAnomalies(latestSignals);
  const alerts = [];

  if (trends.stress.direction === "increasing") {
    alerts.push({
      type: "stress-rise",
      severity: "high",
      message: "Stress is rising across recent entries.",
    });
  }

  if (trends.sleep.direction === "decreasing") {
    alerts.push({
      type: "sleep-fall",
      severity: "high",
      message: "Sleep is falling across recent entries.",
    });
  }

  const symptomHistory = latestSignals
    .map((entry) => normalizeText(entry?.symptoms))
    .filter(Boolean);
  if (symptomHistory.length >= 3 && symptomHistory[0] !== "calm" && symptomHistory.slice(1).some((item) => item === "calm")) {
    alerts.push({
      type: "symptom-reappearance",
      severity: "medium",
      message: "Symptoms reappeared after a calm period.",
    });
  }

  res.json({
    alerts,
    anomalies,
    monitor: {
      sleep: trends.sleep,
      stress: trends.stress,
      symptoms: trends.symptoms,
    },
  });
});

/* TASKS */
router.post("/tasks", async (req, res) => {
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
  const source = typeof req.body?.source === "string" ? req.body.source.trim() : "";

  if (!description) {
    return res.status(400).json({ message: "Task description is required." });
  }

  const task = await Task.create({ description, source });
  return res.json(task);
});

router.get("/tasks", async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 }).lean();
  return res.json({ tasks });
});

router.post("/tasks/:id/complete", async (req, res) => {
  const task = await Task.findById(req.params.id);

  if (!task) {
    return res.status(404).json({ message: `Task not found: ${req.params.id}` });
  }

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

/* legacy routes kept for compatibility */
router.get("/map/systems", async (req, res) => res.redirect(307, "/api/core/systems/map"));
router.get("/trends/signals", async (req, res) => res.redirect(307, "/api/core/signals/trends"));
router.post("/task/create", async (req, res) => res.redirect(307, "/api/core/tasks"));
router.get("/task/list", async (req, res) => res.redirect(307, "/api/core/tasks"));
router.post("/task/complete", async (req, res) => {
  const taskId = typeof req.body?.id === "string" ? req.body.id.trim() : "";
  if (!taskId) {
    return res.status(400).json({ message: "Task id is required." });
  }

  const task = await Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ message: `Task not found: ${taskId}` });
  }

  task.status = "done";
  task.completedAt = new Date();
  await task.save();

  return res.json(task);
});

module.exports = router;
