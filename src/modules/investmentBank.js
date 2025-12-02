// FILE: src/modules/investmentBank.js
// Investment bank system - lock Mate Coins for timed investments, earn Premium Currency

const BANK_KEY = "pm_investment_bank_v1";
const INVESTMENTS_KEY = "pm_active_investments_v1";

// Bank unlock cost
export const BANK_UNLOCK_COST = 50000; // Mate Coins

// Investment tiers with time locks and returns
export const INVESTMENT_TIERS = {
  SHORT: {
    id: 'short',
    name: '24-Hour Investment',
    lockDuration: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    mateCoinFee: 0.15, // 15% fee
    premiumRate: 0.005, // 0.5% of locked amount converted to premium
    minDeposit: 1000,
    maxDeposit: 50000,
    description: 'Quick turnaround, modest returns',
  },
  MEDIUM: {
    id: 'medium',
    name: '7-Day Investment',
    lockDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
    mateCoinFee: 0.15, // 15% fee
    premiumRate: 0.04, // 4% converted to premium
    minDeposit: 5000,
    maxDeposit: 100000,
    description: 'Balanced risk and reward',
  },
  LONG: {
    id: 'long',
    name: '30-Day Investment',
    lockDuration: 30 * 24 * 60 * 60 * 1000, // 30 days
    mateCoinFee: 0.25, // 25% fee
    premiumRate: 0.20, // 20% converted to premium
    minDeposit: 10000,
    maxDeposit: 500000,
    description: 'Maximum returns for patient investors',
  },
};

// Investment status enum
export const INVESTMENT_STATUS = {
  ACTIVE: 'active',
  MATURED: 'matured',
  WITHDRAWN_EARLY: 'withdrawn_early',
};

/* ---------- Helper Functions ---------- */

function lsRead(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function lsWrite(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}

function generateId() {
  return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/* ---------- Bank Status ---------- */

export function isBankUnlocked() {
  return lsRead(BANK_KEY, false);
}

export function unlockBank() {
  lsWrite(BANK_KEY, true);
  return true;
}

/* ---------- Investment Management ---------- */

export function getActiveInvestments() {
  return lsRead(INVESTMENTS_KEY, []);
}

function saveInvestments(investments) {
  lsWrite(INVESTMENTS_KEY, investments);
}

export function createInvestment(tierId, amount) {
  if (!isBankUnlocked()) return { success: false, error: 'Bank not unlocked' };
  
  const tier = INVESTMENT_TIERS[tierId.toUpperCase()];
  if (!tier) return { success: false, error: 'Invalid investment tier' };
  
  // Validate amount
  if (amount < tier.minDeposit) {
    return { success: false, error: `Minimum deposit is ${tier.minDeposit} Mate Coins` };
  }
  if (amount > tier.maxDeposit) {
    return { success: false, error: `Maximum deposit is ${tier.maxDeposit} Mate Coins` };
  }
  
  // Calculate returns
  const fee = Math.floor(amount * tier.mateCoinFee);
  const mateCoinsBack = amount - fee;
  const premiumCurrency = Math.floor(amount * tier.premiumRate);
  
  // Create investment record
  const investment = {
    id: generateId(),
    tierId: tier.id,
    tierName: tier.name,
    amount,
    fee,
    mateCoinsBack,
    premiumCurrency,
    startTime: Date.now(),
    maturityTime: Date.now() + tier.lockDuration,
    status: INVESTMENT_STATUS.ACTIVE,
  };
  
  const investments = getActiveInvestments();
  investments.push(investment);
  saveInvestments(investments);
  
  return { success: true, investment };
}

export function withdrawInvestment(investmentId, isEarly = false) {
  const investments = getActiveInvestments();
  const index = investments.findIndex(inv => inv.id === investmentId);
  
  if (index === -1) return { success: false, error: 'Investment not found' };
  
  const investment = investments[index];
  
  if (investment.status !== INVESTMENT_STATUS.ACTIVE) {
    return { success: false, error: 'Investment already withdrawn' };
  }
  
  const now = Date.now();
  const hasMatured = now >= investment.maturityTime;
  
  let mateCoinsReturned = investment.mateCoinsBack;
  let premiumReturned = 0;
  
  if (hasMatured || !isEarly) {
    // Normal maturity - return coins + premium
    premiumReturned = investment.premiumCurrency;
    investment.status = INVESTMENT_STATUS.MATURED;
  } else {
    // Early withdrawal - return coins but NO premium
    premiumReturned = 0;
    investment.status = INVESTMENT_STATUS.WITHDRAWN_EARLY;
  }
  
  investment.withdrawnAt = now;
  investments[index] = investment;
  saveInvestments(investments);
  
  return {
    success: true,
    mateCoins: mateCoinsReturned,
    premium: premiumReturned,
    wasEarly: isEarly && !hasMatured,
  };
}

export function getInvestment(investmentId) {
  const investments = getActiveInvestments();
  return investments.find(inv => inv.id === investmentId) || null;
}

export function removeInvestment(investmentId) {
  const investments = getActiveInvestments();
  const filtered = investments.filter(inv => inv.id !== investmentId);
  saveInvestments(filtered);
}

/* ---------- Investment Status Helpers ---------- */

export function checkInvestmentStatus(investmentId) {
  const investment = getInvestment(investmentId);
  if (!investment) return null;
  
  const now = Date.now();
  const hasMatured = now >= investment.maturityTime;
  const timeRemaining = Math.max(0, investment.maturityTime - now);
  const progress = Math.min(1, (now - investment.startTime) / (investment.maturityTime - investment.startTime));
  
  return {
    ...investment,
    hasMatured,
    timeRemaining,
    timeRemainingMs: timeRemaining,
    progress,
    daysRemaining: Math.ceil(timeRemaining / (24 * 60 * 60 * 1000)),
    hoursRemaining: Math.ceil(timeRemaining / (60 * 60 * 1000)),
  };
}

export function getAllInvestmentStatuses() {
  const investments = getActiveInvestments();
  return investments.map(inv => checkInvestmentStatus(inv.id)).filter(Boolean);
}

export function getMaturedInvestments() {
  const statuses = getAllInvestmentStatuses();
  return statuses.filter(inv => inv.hasMatured && inv.status === INVESTMENT_STATUS.ACTIVE);
}

export function getTotalLockedMateCoins() {
  const investments = getActiveInvestments();
  return investments
    .filter(inv => inv.status === INVESTMENT_STATUS.ACTIVE)
    .reduce((total, inv) => total + inv.amount, 0);
}

export function getTotalPendingPremium() {
  const investments = getActiveInvestments();
  return investments
    .filter(inv => inv.status === INVESTMENT_STATUS.ACTIVE)
    .reduce((total, inv) => total + inv.premiumCurrency, 0);
}

/* ---------- Interaction Helpers ---------- */

export function isPlayerNearBank(playerX, playerY, bankX, bankY, radius = 64) {
  const dx = playerX - bankX;
  const dy = playerY - bankY;
  return Math.sqrt(dx * dx + dy * dy) <= radius;
}

/* ---------- UI Data ---------- */

export function getInvestmentOptions() {
  return Object.values(INVESTMENT_TIERS).map(tier => ({
    ...tier,
    lockDurationDays: tier.lockDuration / (24 * 60 * 60 * 1000),
    feePercent: tier.mateCoinFee * 100,
    premiumPercent: tier.premiumRate * 100,
  }));
}

export function calculateInvestmentReturns(tierId, amount) {
  const tier = INVESTMENT_TIERS[tierId.toUpperCase()];
  if (!tier) return null;
  
  const fee = Math.floor(amount * tier.mateCoinFee);
  const mateCoinsBack = amount - fee;
  const premiumCurrency = Math.floor(amount * tier.premiumRate);
  
  return {
    deposit: amount,
    fee,
    mateCoinsBack,
    premiumCurrency,
    lockDuration: tier.lockDuration,
    lockDurationDays: tier.lockDuration / (24 * 60 * 60 * 1000),
  };
}

export function formatTimeRemaining(milliseconds) {
  const days = Math.floor(milliseconds / (24 * 60 * 60 * 1000));
  const hours = Math.floor((milliseconds % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((milliseconds % (60 * 60 * 1000)) / (60 * 1000));
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/* ---------- Cleanup ---------- */

export function cleanupCompletedInvestments() {
  const investments = getActiveInvestments();
  const oneMonthAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  
  // Remove investments that were withdrawn over a month ago
  const active = investments.filter(inv => {
    if (inv.status === INVESTMENT_STATUS.ACTIVE) return true;
    if (!inv.withdrawnAt) return true;
    return inv.withdrawnAt > oneMonthAgo;
  });
  
  if (active.length !== investments.length) {
    saveInvestments(active);
  }
}

/* ---------- Stats ---------- */

export function getInvestmentStats() {
  const investments = getActiveInvestments();
  const statuses = getAllInvestmentStatuses();
  
  const active = statuses.filter(inv => inv.status === INVESTMENT_STATUS.ACTIVE);
  const matured = statuses.filter(inv => inv.hasMatured && inv.status === INVESTMENT_STATUS.ACTIVE);
  const withdrawn = investments.filter(inv => inv.status !== INVESTMENT_STATUS.ACTIVE);
  
  const totalInvested = investments.reduce((sum, inv) => sum + inv.amount, 0);
  const totalLocked = active.reduce((sum, inv) => sum + inv.amount, 0);
  const totalPremiumEarned = withdrawn.reduce((sum, inv) => {
    return sum + (inv.status === INVESTMENT_STATUS.MATURED ? inv.premiumCurrency : 0);
  }, 0);
  
  return {
    activeCount: active.length,
    maturedCount: matured.length,
    withdrawnCount: withdrawn.length,
    totalInvested,
    totalLocked,
    totalPremiumEarned,
  };
}