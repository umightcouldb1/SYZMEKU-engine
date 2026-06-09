const mongoose = require('mongoose');
const SovereignAsset = require('../models/SovereignAsset');
const LineageMilestone = require('../models/LineageMilestone');

const notFound = (res, resource = 'Resource') => res.status(404).json({ message: `${resource} not found.` });

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const buildAssetFilter = (query = {}) => {
  const filter = {};
  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  if (query.county) filter['location.county'] = query.county;
  return filter;
};

const buildMilestoneFilter = (query = {}) => {
  const filter = {};
  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  if (query.isCriticalThreshold !== undefined) {
    filter.isCriticalThreshold = String(query.isCriticalThreshold) === 'true';
  }
  return filter;
};

const createSovereignAsset = async (req, res) => {
  const asset = await SovereignAsset.create(req.body);
  return res.status(201).json({ success: true, asset });
};

const getSovereignAssets = async (req, res) => {
  const assets = await SovereignAsset.find(buildAssetFilter(req.query)).sort({ updatedAt: -1 });
  return res.status(200).json({ success: true, assets });
};

const getSovereignAsset = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return notFound(res, 'Sovereign asset');

  const asset = await SovereignAsset.findById(req.params.id);
  if (!asset) return notFound(res, 'Sovereign asset');

  return res.status(200).json({ success: true, asset });
};

const updateSovereignAsset = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return notFound(res, 'Sovereign asset');

  const asset = await SovereignAsset.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!asset) return notFound(res, 'Sovereign asset');

  return res.status(200).json({ success: true, asset });
};

const createLineageMilestone = async (req, res) => {
  const milestone = await LineageMilestone.create(req.body);
  return res.status(201).json({ success: true, milestone });
};

const getLineageMilestones = async (req, res) => {
  const milestones = await LineageMilestone.find(buildMilestoneFilter(req.query)).sort({ targetDate: 1 });
  return res.status(200).json({ success: true, milestones });
};

const getLineageMilestone = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return notFound(res, 'Lineage milestone');

  const milestone = await LineageMilestone.findById(req.params.id);
  if (!milestone) return notFound(res, 'Lineage milestone');

  return res.status(200).json({ success: true, milestone });
};

const updateLineageMilestone = async (req, res) => {
  if (!isValidObjectId(req.params.id)) return notFound(res, 'Lineage milestone');

  const milestone = await LineageMilestone.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!milestone) return notFound(res, 'Lineage milestone');

  return res.status(200).json({ success: true, milestone });
};

module.exports = {
  createSovereignAsset,
  getSovereignAssets,
  getSovereignAsset,
  updateSovereignAsset,
  createLineageMilestone,
  getLineageMilestones,
  getLineageMilestone,
  updateLineageMilestone,
};
