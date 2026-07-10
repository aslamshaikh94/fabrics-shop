"use client";
import { Users, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

const partnerColors = [
  {
    border: "border-l-blue-500",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
  },
  {
    border: "border-l-purple-500",
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
  },
  {
    border: "border-l-emerald-500",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
  },
  {
    border: "border-l-orange-500",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
  },
  {
    border: "border-l-rose-500",
    iconBg: "bg-rose-100",
    iconColor: "text-rose-600",
  },
  {
    border: "border-l-cyan-500",
    iconBg: "bg-cyan-100",
    iconColor: "text-cyan-600",
  },
];

function fmt(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function PartnerCards({
  partners,
  summaries,
  details,
  onEditPartner,
  onRemovePartner,
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {partners.map((partner, idx) => {
        const ps = summaries[partner.id];
        const color = partnerColors[idx % partnerColors.length];
        if (!ps) return null;
        return (
          <div
            key={partner.id}
            className={`card p-5 border-l-4 ${color.border} ${ps.balance < 0 ? "ring-2 ring-red-200" : ""}`}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`${color.iconBg} p-2.5 rounded-xl`}>
                  <Users className={`w-5 h-5 ${color.iconColor}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {partner.name}
                  </h3>
                  <p className="text-xs text-gray-400">
                    {details[partner.id]?.sharePct || partner.share_percentage}%
                    share
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onEditPartner(partner)}
                  className="p-1.5 hover:bg-blue-50 rounded-lg text-gray-400 hover:text-blue-600"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onRemovePartner(partner.id)}
                  className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {ps.balance < 0 && (
              <div className="mb-3 px-2.5 py-1.5 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-700 font-medium">
                  ⚠️ Over-withdrawn
                </p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Profit Share</p>
                <p className="font-semibold text-green-700 text-sm">
                  {fmt(ps.share)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Withdrawn</p>
                <p className="font-semibold text-red-600 text-sm">
                  {fmt(ps.withdrawn)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Balance Due</p>
                <p
                  className={`font-bold text-sm ${ps.balance >= 0 ? "text-green-700" : "text-red-600"}`}
                >
                  {fmt(ps.balance)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
