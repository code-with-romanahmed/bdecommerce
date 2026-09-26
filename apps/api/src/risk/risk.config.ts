export const RISK_THRESHOLDS = {
  newCustomerMaxAgeDays: 3,
  newCustomerHighValueAmount: 5000,
  hugeOrderAmount: 15000,
  cancellationLookbackDays: 30,
  cancellationCountThreshold: 2,
  courierMinOrdersForSignal: 3,      // নতুন — কম অর্ডার থাকলে rate অর্থবহ না
  courierCancelRateThreshold: 40,    // নতুন — ৪০%+ cancel rate হলে সিগন্যাল
} as const;