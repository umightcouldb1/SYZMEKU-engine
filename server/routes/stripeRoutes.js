const router = require('express').Router();
const { protect } = require('../middleware/authMiddleware');
const {
  listProducts,
  createCheckoutSession,
} = require('../controllers/stripeController');

router.get('/products', listProducts);
router.post('/checkout/session', protect, createCheckoutSession);

module.exports = router;
