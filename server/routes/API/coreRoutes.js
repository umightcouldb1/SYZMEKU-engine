const router = require("express").Router();
const System = require("../../models/System");
const SignalEntry = require("../../models/SignalEntry");

router.post("/analyze", async (req, res) => {
  const { text } = req.body;

  const analysis = {
    objectives: [],
    constraints: [],
    risks: [],
    leverage: [],
    next_actions: [],
  };

  if (text) {
    analysis.objectives.push("Clarify the main objective");
    analysis.constraints.push("Identify current limitations");
    analysis.risks.push("Evaluate potential obstacles");
    analysis.leverage.push("Identify strategic advantages");
    analysis.next_actions.push("Define the first executable step");
  }

  res.json(analysis);
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
