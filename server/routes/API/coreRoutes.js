const router = require("express").Router();
const System = require("../../models/System");
const SignalEntry = require("../../models/SignalEntry");

router.post("/analyze", async (req, res) => {
  const fallbackAnalysis = {
    objectives: ["Clarify the main objective"],
    constraints: ["Identify current limitations"],
    risks: ["Evaluate potential obstacles"],
    leverage: ["Identify strategic advantages"],
    next_actions: ["Define the first executable step"],
  };

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";

  if (!text) {
    return res.status(400).json({ message: "Command text is required." });
  }

  const apiKey = process.env.Gemini_API_Key;

  if (!apiKey) {
    return res.json(fallbackAnalysis);
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
    console.log("Gemini key exists:", !!process.env.Gemini_API_Key);

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const data = await geminiResponse.json();
    const modelText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!modelText) {
      return res.json(fallbackAnalysis);
    }

    try {
      const parsed = JSON.parse(modelText);
      return res.json(parsed);
    } catch (error) {
      return res.json(fallbackAnalysis);
    }
  } catch (error) {
    return res.json(fallbackAnalysis);
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
