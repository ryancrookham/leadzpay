"use client";

import { useState } from "react";
import RevenueChart from "./RevenueChart";

interface OperatingCost {
  id: string;
  name: string;
  amount: number;
  frequency: "monthly" | "yearly" | "per_transaction";
  category: string;
  description: string | null;
}

interface PeriodRevenue {
  completedRevenue: number;
  pendingRevenue: number;
  completedTxCount: number;
}

interface ProfitabilityData {
  weekly: PeriodRevenue;
  monthly: PeriodRevenue;
  yearly: PeriodRevenue;
  venmoFees: number;
  venmoTxCount: number;
}

interface ProfitabilityTabProps {
  operatingCosts: OperatingCost[];
  profitability: ProfitabilityData;
  onCostsChanged: () => void;
  revenueByDay: { day: string; revenue: number; txCount: number }[];
  feeLabel: string;
}

export default function ProfitabilityTab({ operatingCosts, profitability, onCostsChanged, revenueByDay, feeLabel }: ProfitabilityTabProps) {
  const [showCostManager, setShowCostManager] = useState(false);
  const [costForm, setCostForm] = useState<{ name: string; amount: number; frequency: "monthly" | "yearly" | "per_transaction"; category: string; description: string }>({ name: "", amount: 0, frequency: "monthly", category: "general", description: "" });
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [costLoading, setCostLoading] = useState(false);

  // Calculate monthly operating costs
  const monthlyCosts = operatingCosts
    .filter(c => c.frequency === "monthly")
    .reduce((sum, c) => sum + c.amount, 0);
  const yearlyAsMonthlyCosts = operatingCosts
    .filter(c => c.frequency === "yearly")
    .reduce((sum, c) => sum + c.amount / 12, 0);
  const monthlyVenmoFees = profitability.venmoTxCount > 0
    ? profitability.venmoFees * (profitability.monthly.completedTxCount / profitability.venmoTxCount)
    : 0;
  const totalMonthlyCost = monthlyCosts + yearlyAsMonthlyCosts + monthlyVenmoFees;

  // Calculate profits for each period
  const weeklyProfit = profitability.weekly.completedRevenue - (totalMonthlyCost / 4.33);
  const monthlyProfit = profitability.monthly.completedRevenue - totalMonthlyCost;
  const yearlyProfit = profitability.yearly.completedRevenue - (totalMonthlyCost * 12);

  const handleSaveCost = async () => {
    setCostLoading(true);
    try {
      const method = editingCostId ? "PUT" : "POST";
      const body = editingCostId ? { id: editingCostId, ...costForm } : costForm;
      const res = await fetch("/api/admin/operating-costs", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setCostForm({ name: "", amount: 0, frequency: "monthly", category: "general", description: "" });
        setEditingCostId(null);
        onCostsChanged();
      }
    } catch (e) {
      console.error("Save cost failed:", e);
    } finally {
      setCostLoading(false);
    }
  };

  const handleDeleteCost = async (id: string) => {
    if (!confirm("Remove this operating cost?")) return;
    try {
      const res = await fetch(`/api/admin/operating-costs?id=${id}`, { method: "DELETE" });
      if (res.ok) onCostsChanged();
    } catch (e) {
      console.error("Delete cost failed:", e);
    }
  };

  const startEdit = (cost: OperatingCost) => {
    setEditingCostId(cost.id);
    setCostForm({
      name: cost.name,
      amount: cost.amount,
      frequency: cost.frequency,
      category: cost.category,
      description: cost.description || "",
    });
    setShowCostManager(true);
  };

  return (
    <div className="space-y-6">
      {/* Revenue Chart — Last 30 Days */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        <h2 className="text-xl font-semibold text-white mb-2">Revenue — Last 30 Days</h2>
        <p className="text-gray-400 text-sm mb-4">Platform fee revenue{feeLabel ? ` (${feeLabel})` : ""}</p>
        {revenueByDay.length === 0 ? (
          <p className="text-gray-500 text-center py-8">No revenue data yet</p>
        ) : (
          <RevenueChart revenueByDay={revenueByDay} />
        )}
      </div>

      {/* Revenue by Period */}
      <div className="grid grid-cols-3 gap-4">
        {([
          { label: "Weekly", data: profitability.weekly, profit: weeklyProfit },
          { label: "Monthly", data: profitability.monthly, profit: monthlyProfit },
          { label: "Yearly", data: profitability.yearly, profit: yearlyProfit },
        ] as const).map(({ label, data, profit }) => (
          <div key={label} className="bg-gray-900/50 rounded-xl border border-gray-800 p-5">
            <div className="text-gray-400 text-sm mb-1">{label} Revenue</div>
            <div className="text-2xl font-bold text-[#C5B358]">${data.completedRevenue.toFixed(2)}</div>
            <div className="text-gray-500 text-xs mt-1">{data.completedTxCount} leads completed</div>
            {data.pendingRevenue > 0 && (
              <div className="text-amber-400/70 text-xs mt-0.5">+${data.pendingRevenue.toFixed(2)} pending</div>
            )}
            <div className="mt-3 pt-3 border-t border-gray-800">
              <div className="text-gray-400 text-xs mb-0.5">{label} Profit</div>
              <div className={`text-lg font-bold ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {profit >= 0 ? "+" : ""}${profit.toFixed(2)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Operating Costs Breakdown */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Operating Costs</h2>
          <div className="text-gray-400 text-sm">
            Total monthly: <span className="text-red-400 font-medium">${totalMonthlyCost.toFixed(2)}/mo</span>
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 text-gray-400 text-sm">Cost</th>
              <th className="text-left py-2 text-gray-400 text-sm">Category</th>
              <th className="text-right py-2 text-gray-400 text-sm">Amount</th>
              <th className="text-right py-2 text-gray-400 text-sm">Monthly Equiv.</th>
              <th className="text-center py-2 text-gray-400 text-sm w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {operatingCosts.map((cost) => {
              const monthlyEquiv = cost.frequency === "yearly"
                ? cost.amount / 12
                : cost.frequency === "per_transaction"
                ? monthlyVenmoFees
                : cost.amount;
              return (
                <tr key={cost.id} className="border-b border-gray-800/50">
                  <td className="py-3">
                    <div className="text-white font-medium">{cost.name}</div>
                    {cost.description && (
                      <div className="text-gray-500 text-xs mt-0.5">{cost.description}</div>
                    )}
                  </td>
                  <td className="py-3 text-gray-400 text-sm capitalize">{cost.category}</td>
                  <td className="py-3 text-right text-gray-300">
                    {cost.frequency === "per_transaction" ? (
                      <span className="text-gray-400 text-sm">1.9% + $0.10/tx</span>
                    ) : (
                      <span>${cost.amount.toFixed(2)}/{cost.frequency === "monthly" ? "mo" : "yr"}</span>
                    )}
                  </td>
                  <td className="py-3 text-right text-red-400 font-medium">${monthlyEquiv.toFixed(2)}</td>
                  <td className="py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => startEdit(cost)}
                        className="text-gray-400 hover:text-[#C5B358] p-1 transition"
                        title="Edit"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      {cost.frequency !== "per_transaction" && (
                        <button
                          onClick={() => handleDeleteCost(cost.id)}
                          className="text-gray-400 hover:text-red-400 p-1 transition"
                          title="Remove"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* Venmo fee summary row */}
            {profitability.venmoTxCount > 0 && (
              <tr className="border-t border-gray-700">
                <td colSpan={3} className="py-3 text-gray-400 text-sm">
                  Venmo fees across {profitability.venmoTxCount} transactions
                </td>
                <td className="py-3 text-right text-red-400 font-medium">
                  ${profitability.venmoFees.toFixed(2)} total
                </td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Add/Edit Cost */}
        <div className="mt-4">
          <button
            onClick={() => {
              setShowCostManager(!showCostManager);
              if (showCostManager) {
                setEditingCostId(null);
                setCostForm({ name: "", amount: 0, frequency: "monthly", category: "general", description: "" });
              }
            }}
            className="text-[#C5B358] hover:text-[#d4c462] text-sm font-medium transition"
          >
            {showCostManager ? "Cancel" : "+ Add Operating Cost"}
          </button>

          {showCostManager && (
            <div className="mt-3 bg-gray-800/50 rounded-lg p-4 border border-gray-700 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Name</label>
                  <input
                    type="text"
                    value={costForm.name}
                    onChange={(e) => setCostForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Vercel Hosting"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#C5B358]/40"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={costForm.amount}
                    onChange={(e) => setCostForm(prev => ({ ...prev, amount: Number(e.target.value) }))}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#C5B358]/40"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Frequency</label>
                  <select
                    value={costForm.frequency}
                    onChange={(e) => setCostForm(prev => ({ ...prev, frequency: e.target.value as any }))}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#C5B358]/40"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Category</label>
                  <input
                    type="text"
                    value={costForm.category}
                    onChange={(e) => setCostForm(prev => ({ ...prev, category: e.target.value }))}
                    placeholder="infrastructure"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#C5B358]/40"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs mb-1">Description</label>
                  <input
                    type="text"
                    value={costForm.description}
                    onChange={(e) => setCostForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional note"
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#C5B358]/40"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveCost}
                disabled={costLoading || !costForm.name}
                className="px-4 py-2 bg-[#C5B358] hover:bg-[#b8a64e] text-black rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {costLoading ? "Saving..." : editingCostId ? "Update Cost" : "Add Cost"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Profit Summary */}
      <div className="bg-gray-900/50 rounded-xl border border-gray-800 p-6">
        <h2 className="text-xl font-semibold text-white mb-4">Profit Summary</h2>
        <div className="space-y-3">
          {([
            { label: "Weekly", revenue: profitability.weekly.completedRevenue, cost: totalMonthlyCost / 4.33, profit: weeklyProfit },
            { label: "Monthly", revenue: profitability.monthly.completedRevenue, cost: totalMonthlyCost, profit: monthlyProfit },
            { label: "Yearly", revenue: profitability.yearly.completedRevenue, cost: totalMonthlyCost * 12, profit: yearlyProfit },
          ] as const).map(({ label, revenue, cost, profit }) => (
            <div key={label} className="flex items-center justify-between p-4 bg-gray-800/30 rounded-lg border border-gray-800">
              <div>
                <div className="text-white font-medium">{label}</div>
                <div className="text-gray-500 text-xs">
                  ${revenue.toFixed(2)} revenue - ${cost.toFixed(2)} costs
                </div>
              </div>
              <div className={`text-xl font-bold ${profit >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {profit >= 0 ? "+" : ""}${profit.toFixed(2)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
