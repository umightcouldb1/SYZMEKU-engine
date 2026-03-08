const router = require("express").Router();
const System = require("../../models/System");
const SignalEntry = require("../../models/SignalEntry");

router.post("/analyze", async (req, res) => {
  const fallbackAnalysis = {
    objectives: ["Gemini JSON missing required keys."],
    constraints: [],
    risks: [],
    leverage: [],
    next_actions: ["Adjust model prompt to always return the required schema."],
  };

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
  const recentCommands = Array.isArray(rawContext?.recentCommands)
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
  const activeRouteType =
    typeof rawContext?.activeRouteType === "string" ? rawContext.activeRouteType.trim() : "";
  const hasLastOverlayResult =
    rawContext?.lastOverlayResult && typeof rawContext.lastOverlayResult === "object";

  let latestSignals = [];
  let latestSystems = [];

  try {
    [latestSignals, latestSystems] = await Promise.all([
      SignalEntry.find().sort({ createdAt: -1 }).limit(5).lean(),
      System.find().sort({ createdAt: -1 }).limit(5).lean(),
    ]);
  } catch (dbError) {
    console.warn("Failed to fetch analyze context:", dbError?.message || dbError);
  }

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
    `Current user command: ${effectiveCommand}`,
    `Active route type: ${activeRouteType || "(none provided)"}`,
    `Recent command history: ${recentCommands.length ? JSON.stringify(recentCommands) : "(none provided)"}`,
    "Latest signals (newest first, max 5):",
    ...(signalContextLines.length ? signalContextLines : ["(none found)"]),
    "Latest systems (newest first, max 5):",
    ...(systemContextLines.length ? systemContextLines : ["(none found)"]),
    hasLastOverlayResult
      ? `Last overlay result summary: ${JSON.stringify(rawContext.lastOverlayResult)}`
      : "Last overlay result summary: (none provided)",
  ].join("\n");
  try {
    console.log("Gemini key exists:", hasGeminiKey);

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
      return res.json({
        objectives: ["Gemini HTTP error"],
        constraints: [`HTTP status: ${geminiResponse.status}`],
        risks: [String(errorText || "").slice(0, 300)],
        leverage: ["Check Gemini_API_Key, API enablement, endpoint, and model name."],
        next_actions: ["Fix the reported HTTP error and retry analyze."],
      });
    }

    const data = await geminiResponse.json();
    const modelText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    let parsed;
    try {
      parsed = JSON.parse(modelText);
    } catch (error) {
      return res.json({
        objectives: ["Gemini returned non-JSON output."],
        constraints: [],
        risks: [String(modelText || "").slice(0, 300)],
        leverage: [],
        next_actions: ["Tighten the prompt or parsing logic."],
      });
    }

    const requiredKeys = ["objectives", "constraints", "risks", "leverage", "next_actions"];
    const hasAllRequiredKeys =
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(parsed, key));

    if (!hasAllRequiredKeys) {
      return res.json(fallbackAnalysis);
    }

    const normalized = requiredKeys.reduce((acc, key) => {
      const value = parsed[key];
      acc[key] = Array.isArray(value)
        ? value
            .map((item) => (typeof item === "string" ? item.trim() : String(item || "").trim()))
            .filter(Boolean)
        : [];
      return acc;
    }, {});

    return res.json(normalized);
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

module.exports = router;
