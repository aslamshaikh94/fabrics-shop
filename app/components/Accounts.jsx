"use client";

// Accounts page — dedicated view for tracking account holders' transactions.
//
// The ledger (credit/debit statement, deposits, opening balances, per-holder
// cards) lives inside the Payments module. Rather than duplicating ~1,500 lines
// of tightly-coupled logic, this page renders that module with:
//   initialTab="partners"  -> land directly on the account ledger
//   accountsOnly           -> hide the Payments header + supplier/customer tabs
//
// This keeps a single source of truth for the ledger calculations.

import Payments from "./Payments";

export default function Accounts() {
  return <Payments initialTab="partners" accountsOnly />;
}
