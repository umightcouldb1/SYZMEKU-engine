export const calculateSustainableSuccess = (inputMetric, missionText, codexMatch) => {
  const isHighVariance = /\b(lottery|gambling|random|luck)\b/i.test(missionText || '');

  if (isHighVariance) {
    return {
      nonCollapsibleTarget: 'STATISTICALLY IMPROBABLE',
      riskStatus: 'EXTREME VARIANCE',
      message: 'Warning: Crystalline Engine cannot verify probability for external random events.',
    };
  }

  if (codexMatch) {
    return {
      nonCollapsibleTarget: (inputMetric * 1.18).toFixed(2),
      riskStatus: 'Near Zero',
      message: 'Hidden Failure Risk is Obliterated.',
    };
  }

  return {
    nonCollapsibleTarget: null,
    riskStatus: 'High Risk',
    message: 'Calibration Required.',
  };
};
