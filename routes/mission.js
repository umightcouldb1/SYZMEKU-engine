const express = require('express');
const router = express.Router();

// Mock data storage for demonstration purposes
let contracts = [];
let deals = [];

router.post('/ingest/contract', (req, res) => {
    const contract = req.body;
    if (contract.projectedMonthlyYield && contract.earnestMoneyGap) {
        contract.cashOnCashROI = calculateCashOnCashROI(contract.projectedMonthlyYield, contract.earnestMoneyGap);
    }
    contracts.push(contract);
    res.status(201).send('Contract saved');
});

router.post('/ingest/deal', (req, res) => {
    const deal = req.body;
    if (deal.projectedMonthlyYield && deal.earnestMoneyGap) {
        deal.cashOnCashROI = calculateCashOnCashROI(deal.projectedMonthlyYield, deal.earnestMoneyGap);
    }
    deals.push(deal);
    res.status(201).send('Deal saved');
});

function calculateCashOnCashROI(projectedMonthlyYield, earnestMoneyGap) {
    return (projectedMonthlyYield / earnestMoneyGap) * 100;
}

module.exports = router;