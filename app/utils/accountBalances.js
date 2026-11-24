import { getCashAccountPartner } from "./cashAccount";
import { matchPartner } from "./partnerWithdrawal";

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;
const yearOf = (date) => new Date(date).getFullYear();

export function calculateAccountBalances({
  partners = [],
  salePayments = [],
  deposits = [],
  withdrawals = [],
  purchasePayments = [],
  expenses = [],
  year,
}) {
  const partnerById = new Map(partners.map((partner) => [partner.id, partner]));
  const partnerByName = new Map();
  partners.forEach((partner) => {
    if (!partnerByName.has(partner.name)) {
      partnerByName.set(partner.name, partner);
    }
  });
  const cashAccountName = getCashAccountPartner(partners)?.name || null;
  const entriesByHolder = new Map();
  const activityYears = new Set();
  const currentYear = new Date().getFullYear();
  const addEntry = (name, entry) => {
    if (!name) return;
    if (!entriesByHolder.has(name)) entriesByHolder.set(name, []);
    entriesByHolder.get(name).push(entry);
  };
  const addActivityYear = (date) => {
    const activityYear = yearOf(date);
    if (Number.isFinite(activityYear)) activityYears.add(activityYear);
  };
  const partnerNameForId = (id) =>
    id ? partnerById.get(id)?.name || "Unknown" : null;

  salePayments.forEach((payment) => {
    const name =
      partnerNameForId(payment.partner_id) ||
      (!payment.partner_id ? cashAccountName : null);
    if (name) {
      addEntry(name, {
        date: payment.payment_date,
        type: "credit",
        amount: payment.amount,
      });
    }
    if (payment.partner_id || (!payment.partner_id && cashAccountName)) {
      addActivityYear(payment.payment_date);
    }
  });

  deposits.forEach((deposit) => {
    const name = partnerNameForId(deposit.partner_id);
    if (!name) return;
    addEntry(name, {
      date: deposit.deposit_date,
      type: "credit",
      amount: deposit.amount,
    });
    addActivityYear(deposit.deposit_date);
    if (cashAccountName && name !== cashAccountName) {
      addEntry(cashAccountName, {
        date: deposit.deposit_date,
        type: "debit",
        amount: deposit.amount,
      });
    }
  });

  withdrawals.forEach((withdrawal) => {
    const partner = matchPartner(withdrawal.withdrawn_by, partners);
    if (!partner) return;
    addEntry(partner.name, {
      date: withdrawal.withdrawal_date,
      type: "debit",
      amount: withdrawal.amount,
    });
    addActivityYear(withdrawal.withdrawal_date);
  });

  purchasePayments.forEach((payment) => {
    if (!payment.partner_id || !(Number(payment.reinvested_amount) > 0)) return;
    addActivityYear(payment.payment_date);
    if (!partnerById.has(payment.partner_id)) return;
    addEntry(partnerNameForId(payment.partner_id), {
      date: payment.payment_date,
      type: "debit",
      amount: payment.reinvested_amount,
    });
  });

  expenses.forEach((expense) => {
    if (!expense.partner_id) return;
    const name = partnerNameForId(expense.partner_id);
    addEntry(name, {
      date: expense.expense_date,
      type: "debit",
      amount: expense.amount,
    });
    addActivityYear(expense.expense_date);
  });

  const currentPartnerYear =
    year ??
    (activityYears.has(currentYear)
      ? currentYear
      : activityYears.size
        ? Math.max(...activityYears)
        : currentYear);
  const holderNames = new Set(
    partners
      .filter((partner) => partner.is_active !== false)
      .map((partner) => partner.name),
  );
  entriesByHolder.forEach((_, name) => holderNames.add(name));

  return [...holderNames].sort().map((name) => {
    const entries = entriesByHolder.get(name) || [];
    const partner = partnerByName.get(name);
    const manualOpening = Number(partner?.opening_balance || 0);
    const manualOpeningDate = partner?.opening_balance_date || "";
    const openingApplies =
      Boolean(manualOpeningDate) &&
      currentPartnerYear >= yearOf(manualOpeningDate);
    const afterStart = (entry) =>
      !openingApplies || entry.date >= manualOpeningDate;
    const opening = roundMoney(
      (openingApplies ? manualOpening : 0) +
        entries
          .filter(
            (entry) =>
              yearOf(entry.date) < currentPartnerYear && afterStart(entry),
          )
          .reduce(
            (sum, entry) =>
              sum + (entry.type === "credit" ? 1 : -1) * (Number(entry.amount) || 0),
            0,
          ),
    );
    const yearEntries = entries.filter(
      (entry) =>
        yearOf(entry.date) === currentPartnerYear && afterStart(entry),
    );
    const credit = roundMoney(
      yearEntries
        .filter((entry) => entry.type === "credit")
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
    );
    const debit = roundMoney(
      yearEntries
        .filter((entry) => entry.type === "debit")
        .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0),
    );

    return {
      name,
      opening,
      credit,
      debit,
      closing: roundMoney(opening + credit - debit),
      count: yearEntries.length,
    };
  });
}
