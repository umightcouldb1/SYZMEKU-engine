const router = require("express").Router();
const System = require("../../models/System");
const SignalEntry = require("../../models/SignalEntry");
const SystemExecution = require("../../models/SystemExecution");
const Task = require("../../models/Task");

const REQUIRED_ANALYSIS_KEYS = ["objectives", "constraints", "risks", "leverage", "next_actions"];

const FALLBACK_ANALYSIS = {
  objectives: ["Gemini JSON missing required keys."],
  constraints: [],
  risks: [],
  leverage: [],
  next_actions: ["Adjust model prompt to always return the required schema."],
};

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
    const [latestSignals, latestSystems] = await Promise.all([
      SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean(),
      System.find().sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    return { latestSignals, latestSystems };
  } catch (dbError) {
    console.warn("Failed to fetch strategic context:", dbError?.message || dbError);
    return { latestSignals: [], latestSystems: [] };
  }
};

const LINKABLE_SIGNAL_KEYS = ["sleep", "stress", "symptoms", "notes"];

const normalizeText = (value) => String(value || "").trim().toLowerCase();
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const mapSystemRecord = (system) => {
  const inputs = Array.isArray(system?.inputs) ? system.inputs.filter(Boolean) : [];
  const outputs = Array.isArray(system?.outputs) ? system.outputs.filter(Boolean) : [];
  const routines = Array.isArray(system?.routines) ? system.routines.filter(Boolean) : [];

  const relationshipText = [
    ...inputs,
    ...outputs,
    ...routines,
    system?.purpose,
    system?.name,
  ]
    .filter(Boolean)
    .map(normalizeText)
    .join(" ");

  const linkedSignals = LINKABLE_SIGNAL_KEYS.filter((signalKey) => relationshipText.includes(signalKey));

  return {
    id: String(system?._id || ""),
    name: system?.name || "Unnamed System",
    purpose: system?.purpose || "",
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
  const normalized = entries
    .map((entry) => normalizeText(entry?.symptoms))
    .filter(Boolean);

  if (!normalized.length) {
    return { direction: "insufficient-data", latest: null };
  }

  if (normalized.length === 1) {
    return { direction: "single-entry", latest: normalized[0] };
  }

  const uniqueRecent = new Set(normalized.slice(0, 3));

  return {
    direction: uniqueRecent.size === 1 ? "stabilizing" : "mixed",
    latest: normalized[0],
  };
};

const buildExecutionPlan = (system, latestSignal) => {
  const routines = Array.isArray(system?.routines) ? system.routines.filter(Boolean) : [];
  const steps = routines.length
    ? routines.map((routine, index) => `Step ${index + 1}: ${routine}`)
    : [
        "Step 1: Review current signal state.",
        "Step 2: Execute one stabilizing intervention.",
        "Step 3: Log follow-up signal after completion.",
      ];

  const stress = typeof latestSignal?.stress === "number" ? latestSignal.stress : null;
  const sleep = typeof latestSignal?.sleep === "number" ? latestSignal.sleep : null;
  const riskFlags = [];

  if (stress !== null && stress >= 7) {
    riskFlags.push("High stress detected; prioritize recovery pacing.");
  }

  if (sleep !== null && sleep <= 5) {
    riskFlags.push("Low sleep detected; avoid over-commitment.");
  }

  const readiness = riskFlags.length ? "guarded" : "ready";

  return {
    readiness,
    riskFlags,
    steps,
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
}) => {
  const signalContextLines = toContextLines(latestSignals, [
    "title",
    "signal",
    "type",
    "source",
    "summary",
    "description",
    "impact",
  ]);

  const systemContextLines = toContextLines(latestSystems, [
    "name",
    "title",
    "purpose",
    "goal",
    "status",
    "description",
    "constraints",
  ]);

  const hasLastOverlayResult = lastOverlayResult && typeof lastOverlayResult === "object";

  return [
    `Current user command: ${commandText}`,
    `Active route type: ${activeRouteType || "(none provided)"}`,
    `Recent command history: ${recentCommands.length ? JSON.stringify(recentCommands) : "(none provided)"}`,
    "Latest signals (newest first, max 5):",
    ...(signalContextLines.length ? signalContextLines : ["(none found)"]),
    "Latest systems (newest first, max 5):",
    ...(systemContextLines.length ? systemContextLines : ["(none found)"]),
    hasLastOverlayResult
      ? `Last overlay result summary: ${JSON.stringify(lastOverlayResult)}`
      : "Last overlay result summary: (none provided)",
  ];
};

router.post("/analyze", async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  const analyzeModeInstructions = {
    general:
      "Balance strategic and practical reasoning using signals, systems, and recent context.",
    strategic:
      "Emphasize priorities, leverage, sequencing, and decision quality.",
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

  const hasGeminiKey = Boolean(process.env.Gemini_API_Key);

  if (!hasGeminiKey) {
    return res.json({
      objectives: ["Gemini_API_Key is missing on the server."],
      constraints: [],
      risks: [],
      leverage: [],
      next_actions: ["Add Gemini_API_Key to Render environment variables."],
    });
  }

  const rawContext = req.body?.context;
  const recentCommands = normalizeRecentCommands(rawContext);
  const activeRouteType =
    typeof rawContext?.activeRouteType === "string" ? rawContext.activeRouteType.trim() : "";
  const { latestSignals, latestSystems } = await fetchStrategicContext();

  const prompt = [
    "Reason like a strategic operating system.",
    "Synthesize command + systems + signals + recent session context.",
    "Return ONLY valid JSON.",
    "No markdown.",
    "No explanation outside JSON.",
    "No code fences.",
    "Each field must be an array of concise strings.",
    "Use this exact shape:",
    '{"objectives":[],"constraints":[],"risks":[],"leverage":[],"next_actions":[]}',
    "",
    `Analyze mode: ${analyzeMode}`,
    `Mode guidance: ${analyzeModeInstructions[analyzeMode] || analyzeModeInstructions.general}`,
    ...buildSharedPromptContext({
      commandText: effectiveCommand,
      recentCommands,
      activeRouteType,
      lastOverlayResult: rawContext?.lastOverlayResult,
      latestSignals,
      latestSystems,
    }),
  ].join("\n");

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
  const recentCommands = normalizeRecentCommands(rawContext);
  const activeRouteType =
    typeof rawContext?.activeRouteType === "string" ? rawContext.activeRouteType.trim() : "";
  const { latestSignals, latestSystems } = await fetchStrategicContext();

  const prompt = [
    "Act like a strategic operating system.",
    "Prioritize decisive, high-leverage next actions.",
    "Use recent signals and systems.",
    "Optimize for clarity, momentum, and stability.",
    "Return ONLY valid JSON.",
    "No markdown.",
    "No explanation outside JSON.",
    "No code fences.",
    "Each field must be an array of concise strings.",
    "Use this exact shape:",
    '{"objectives":[],"constraints":[],"risks":[],"leverage":[],"next_actions":[]}',
    "",
    ...buildSharedPromptContext({
      commandText: text,
      recentCommands,
      activeRouteType,
      lastOverlayResult: rawContext?.lastOverlayResult,
      latestSignals,
      latestSystems,
    }),
  ].join("\n");

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
  const system = await System.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
  });
  res.json(system);
});

router.delete("/systems/:id", async (req, res) => {
  await System.findByIdAndDelete(req.params.id);
  res.json({ message: "System removed" });
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

router.get("/map/systems", async (req, res) => {
  const systems = await System.find().sort({ createdAt: -1 }).lean();
  const mappedSystems = systems.map(mapSystemRecord);

  res.json({
    count: mappedSystems.length,
    systems: mappedSystems,
  });
});

router.get("/trends/signals", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query?.limit) || 10, 2), 30);
  const latestSignals = await SignalEntry.find().sort({ createdAt: -1 }).limit(limit).lean();

  const sleepValues = latestSignals
    .map((entry) => entry?.sleep)
    .filter((value) => typeof value === "number");
  const stressValues = latestSignals
    .map((entry) => entry?.stress)
    .filter((value) => typeof value === "number");

  res.json({
    sampleSize: latestSignals.length,
    sleep: describeNumericTrend(sleepValues),
    stress: describeNumericTrend(stressValues),
    symptoms: describeSymptomsTrend(latestSignals),
  });
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

  const latestSignal = await SignalEntry.findOne().sort({ createdAt: -1 }).lean();
  const executionPlan = buildExecutionPlan(system, latestSignal);

  const executionRecord = await SystemExecution.create({
    systemId: system._id,
    systemName: system.name,
    readiness: executionPlan.readiness,
    riskFlags: executionPlan.riskFlags,
    actions: executionPlan.steps,
    signalSnapshot: latestSignal
      ? {
          sleep: latestSignal.sleep,
          stress: latestSignal.stress,
          symptoms: latestSignal.symptoms,
          notes: latestSignal.notes,
          createdAt: latestSignal.createdAt,
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
  });
});


router.post("/task/create", async (req, res) => {
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";

  if (!description) {
    return res.status(400).json({ message: "Task description is required." });
  }

  const task = await Task.create({ description });
  return res.json(task);
});

router.get("/task/list", async (req, res) => {
  const tasks = await Task.find().sort({ createdAt: -1 }).lean();
  return res.json({ tasks });
});

router.post("/task/complete", async (req, res) => {
  const taskId = typeof req.body?.id === "string" ? req.body.id.trim() : "";

  if (!taskId) {
    return res.status(400).json({ message: "Task id is required." });
  }

  const task = await Task.findById(taskId);

  if (!task) {
    return res.status(404).json({ message: `Task not found: ${taskId}` });
  }

  task.status = "completed";
  task.completedAt = new Date();
  await task.save();

  return res.json(task);
});


module.exports = router;
