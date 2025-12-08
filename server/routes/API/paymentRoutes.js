const express = require('express');
const router = express.Router();

const stripe = require('stripe')(process.env.Stripe_Secret_Key); 
const { runSustainableSuccessAudit } = require('../../controllers/axiomController'); 

const AUDIT_PRICE_CENTS = 988; 

router.post('/audit-checkout', async (req, res) => {
    const { inputMetric, token } = req.body; 
    const metricValue = parseFloat(inputMetric);
    
    if (isNaN(metricValue) || metricValue <= 0 || !token) {
        return res.status(400).json({ status: 'ERROR', message: 'Invalid input or missing payment details for Ketsuron.' });
    }

    if (!process.env.Stripe_Secret_Key) {
        console.error("Stripe Secret Key is missing from Environment Variables!");
        return res.status(500).json({ status: 'ERROR', message: 'Server configuration error: Stripe key missing.' });
    }

    try {
        const charge = await stripe.charges.create({
            amount: AUDIT_PRICE_CENTS, 
            currency: 'usd',
            description: 'SYZMEKU Ketsuron Final Judgement Audit (Lifetime Access)',
            source: token,
        });

        console.log(`Charge successful for: ${charge.id}. Executing Ketsuron Logic.`);
        
        const auditProof = await runSustainableSuccessAudit(metricValue); 

        return res.status(200).json({ 
            status: 'SUCCESS',
            message: 'Ketsuron Complete. Your success is now Systemically Coherent.',
            proof: auditProof.proof, 
        });

    } catch (error) {
        console.error('Stripe Ketsuron Charge Error:', error);
        return res.status(500).json({ 
            status: 'PAYMENT_FAILED', 
            message: 'Payment failed. Please check card details or try again.', 
            error: error.message 
        });
    }
});

module.exports = router;
