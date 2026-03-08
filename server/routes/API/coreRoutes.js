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

  const prompt = [
    "Analyze the user input like a strategic systems architect.",
    "Return ONLY valid JSON.",
    "No markdown.",
    "No explanation outside JSON.",
    "No code fences.",
    "Each field must be an array of strings.",
    "Use this exact shape:",
    '{"objectives":[],"constraints":[],"risks":[],"leverage":[],"next_actions":[]}',
    `User input: ${text}`,
  ].join("\n");

  try {
    console.log("Gemini key exists:", hasGeminiKey);

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.Gemini_API_Key}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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

    return res.json(parsed);
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
