const mongoose = require('mongoose');
const { requireCoreScope, requireCoreWrite, scopeError } = require('../services/coreScopeService');

// Defense in depth for all personal collections. Raw Model.collection access is reserved
// for fixture setup and read-only migration inventory, never for application routes.
module.exports = function coreOwned(schema, { ownerKey = 'userId', references = {}, evidenceSource = false } = {}) {
  schema.set('autoIndex', false); // Production index changes require a reviewed migration.
  schema.set('autoCreate', false); // Never race automatic DDL against context transactions.
  if (!schema.path(ownerKey)) schema.add({ [ownerKey]: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true } });

  async function requireEvidenceTransaction() {
    if (!evidenceSource) return;
    const context=require('../utils/requestContext').getRequestContext();
    if(context.coreTransaction){
      if(evidenceSource==='event'&&!context.coreEvidenceMutation)throw scopeError('Evidence changes require a source epoch transaction.',409);
      return;
    }
    // Existing M1-only document callers remain compatible until there are
    // derivatives. Once a Pattern exists, no writer may bypass its epoch.
    if (await require('./Pattern').exists({})) throw scopeError('Evidence changes require the canonical context transaction.', 409);
  }

  function validateOwner(doc) {
    const { userId } = requireCoreScope();
    requireCoreWrite();
    const existing = doc[ownerKey];
    if (existing && String(existing) !== userId) throw scopeError('Record owner does not match authenticated scope.');
    if (!doc.isNew && !existing) throw scopeError('Unowned historical records are restricted.');
    doc[ownerKey] = userId;
    if (!doc.isNew) doc.$where = { ...doc.$where, [ownerKey]: new mongoose.Types.ObjectId(userId) };
  }

  async function validateReferences(value) {
    for (const [field, modelName] of Object.entries(references)) {
      if (!value[field]) continue;
      if (!await require('./' + modelName).exists({ _id: value[field] })) {
        throw scopeError('Referenced record is not accessible in this scope.', 404);
      }
    }
  }

  schema.pre('validate', async function() { validateOwner(this); await validateReferences(this); });
  schema.pre('save', async function() { validateOwner(this); await requireEvidenceTransaction(); await validateReferences(this); });
  schema.pre('deleteOne', { document: true, query: false }, async function() { validateOwner(this); await requireEvidenceTransaction(); });

  const queryOps = ['find', 'findOne', 'countDocuments', 'distinct', 'updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'];
  schema.pre(queryOps, async function() {
    const { userId } = requireCoreScope();
    if (['updateOne','updateMany','findOneAndUpdate','deleteOne','deleteMany','findOneAndDelete'].includes(this.op)) { requireCoreWrite(); await requireEvidenceTransaction(); }
    const filter = this.getFilter();
    const supplied = filter[ownerKey];
    if (supplied && String(supplied) !== userId) throw scopeError('Query owner does not match authenticated scope.');
    // Preserve an AND boundary: nested OR/NOT/$expr cannot remove the owner predicate.
    this.setQuery({ $and: [filter, { [ownerKey]: new mongoose.Types.ObjectId(userId) }] });
    const update = this.getUpdate?.();
    if (!update) return;
    if (Array.isArray(update)) throw scopeError('Update pipelines are not supported for personal Core.', 400);
    for (const [operator, value] of Object.entries(update)) {
      if (operator.startsWith('$') && !['$set', '$setOnInsert', '$unset', '$push', '$pull', '$addToSet', '$inc', '$max', '$min', '$currentDate'].includes(operator)) throw scopeError('Unsupported personal Core update operator.', 400);
      const fields = operator.startsWith('$') ? Object.keys(value || {}) : [operator];
      for (const field of fields) {
        if (field === ownerKey || field.startsWith(ownerKey + '.') || field === '_id') {
          const proposed = operator.startsWith('$') ? value[field] : value;
          if (field !== ownerKey || !['$set', '$setOnInsert'].includes(operator) || String(proposed) !== userId) throw scopeError('Record ownership cannot be changed.');
        }
      }
    }
    await validateReferences({ ...update, ...update.$set, ...update.$setOnInsert });
    if (this.getOptions().upsert) {
      update.$setOnInsert = { ...update.$setOnInsert, [ownerKey]: userId };
      if (update.$set?.[ownerKey]) delete update.$set[ownerKey];
    }
    this.setOptions({ runValidators: true });
  });
  schema.pre(['replaceOne', 'findOneAndReplace', 'estimatedDocumentCount'], function() {
    requireCoreScope();
    throw scopeError('This operation is not supported for personal Core.', 400);
  });
  schema.pre('aggregate', function() {
    const { userId } = requireCoreScope();
    const allowed = new Set(['$match', '$sort', '$limit', '$skip', '$project', '$group', '$count', '$unwind', '$addFields', '$set', '$unset']);
    if (this.pipeline().some(stage => !allowed.has(Object.keys(stage)[0]))) throw scopeError('Cross-collection or write aggregation is not supported.', 400);
    this.pipeline().unshift({ $match: { [ownerKey]: new mongoose.Types.ObjectId(userId) } });
  });
  schema.pre('insertMany', function(next) { next(scopeError('Use scoped document writes instead of insertMany.', 400)); });
  schema.pre('bulkWrite', function(next) { next(scopeError('Bulk writes require a separately reviewed migration.', 400)); });
};
