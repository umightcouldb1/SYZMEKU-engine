const UserProfile = require('../models/UserProfile');
async function ensureProfile(userId) {
  try {
    return await UserProfile.findOneAndUpdate({userId}, {$setOnInsert:{userId}}, {upsert:true,new:true,setDefaultsOnInsert:true});
  } catch (error) {
    if (error.code !== 11000) throw error;
    return UserProfile.findOne({userId});
  }
}
async function recordPurchase(userId, purchase) {
  await ensureProfile(userId);
  // One atomic append across verification and concurrent webhook deliveries. Never
  // overwrite a refunded/canceled record when an old checkout event is replayed.
  await UserProfile.updateOne({userId, purchasedProducts:{$not:{$elemMatch:{checkoutSessionId:purchase.checkoutSessionId,priceId:purchase.priceId}}}}, {$push:{purchasedProducts:purchase}}, {runValidators:true});
}
module.exports = {ensureProfile, recordPurchase};
