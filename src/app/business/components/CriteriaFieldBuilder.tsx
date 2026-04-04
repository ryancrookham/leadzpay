"use client";

import React from "react";

export interface CriteriaField {
  fieldType: "PHOTO" | "TEXT" | "BINARY" | "PHONE_CALL";
  label: string;
  optionA?: string;
  optionB?: string;
  isMandatory: boolean;
  sortOrder: number;
}

interface CriteriaFieldBuilderProps {
  fields: CriteriaField[];
  setFields: (fields: CriteriaField[]) => void;
  callPhone: string;
  setCallPhone: (v: string) => void;
}

export function fieldTypeBadge(type: string) {
  const config: Record<string, { color: string; label: string }> = {
    PHOTO: { color: "bg-purple-100 text-purple-700", label: "Photo" },
    TEXT: { color: "bg-blue-100 text-blue-700", label: "Text" },
    BINARY: { color: "bg-amber-100 text-amber-700", label: "Yes/No" },
    PHONE_CALL: { color: "bg-green-100 text-green-700", label: "📞 Call" },
  };
  const { color, label } = config[type] || { color: "bg-gray-100 text-gray-600", label: type };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{label}</span>;
}

export default function CriteriaFieldBuilder({ fields, setFields, callPhone, setCallPhone }: CriteriaFieldBuilderProps) {
  const addField = (type: CriteriaField["fieldType"]) => {
    setFields([...fields, {
      fieldType: type,
      label: type === "PHONE_CALL" ? "Verified Phone Call" : "",
      optionA: type === "BINARY" ? "Yes" : undefined,
      optionB: type === "BINARY" ? "No" : undefined,
      isMandatory: true,
      sortOrder: fields.length,
    }]);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index).map((f, i) => ({ ...f, sortOrder: i })));
  };

  const updateField = (index: number, updates: Partial<CriteriaField>) => {
    setFields(fields.map((f, i) => i === index ? { ...f, ...updates } : f));
  };

  const moveField = (index: number, direction: "up" | "down") => {
    if ((direction === "up" && index === 0) || (direction === "down" && index === fields.length - 1)) return;
    const newFields = [...fields];
    const swapIdx = direction === "up" ? index - 1 : index + 1;
    [newFields[index], newFields[swapIdx]] = [newFields[swapIdx], newFields[index]];
    setFields(newFields.map((f, i) => ({ ...f, sortOrder: i })));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="text-sm font-medium text-gray-700">Required Fields</label>
        <div className="flex gap-2">
          <button onClick={() => addField("PHOTO")} className="text-xs px-3 py-1 border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-50 transition">+ Photo</button>
          <button onClick={() => addField("TEXT")} className="text-xs px-3 py-1 border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 transition">+ Text</button>
          <button onClick={() => addField("BINARY")} className="text-xs px-3 py-1 border border-amber-200 text-amber-600 rounded-lg hover:bg-amber-50 transition">+ Yes/No</button>
          <button
            onClick={() => {
              if (!fields.some(f => f.fieldType === "PHONE_CALL")) {
                addField("PHONE_CALL");
              }
            }}
            disabled={fields.some(f => f.fieldType === "PHONE_CALL")}
            className="text-xs px-3 py-1 border border-green-200 text-green-600 rounded-lg hover:bg-green-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            📞 Phone Call
          </button>
        </div>
      </div>

      {/* Locked default fields — always collected */}
      <div className="space-y-2 mb-3">
        {["Name", "Email", "Phone"].map(label => (
          <div key={label} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg opacity-60">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Default</span>
            <span className="flex-1 text-sm text-gray-700">{label}</span>
            <span className="text-xs text-gray-400">Always required</span>
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
        ))}
      </div>

      {fields.length > 0 && (
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Custom Fields</p>
      )}

      {fields.length === 0 ? (
        <p className="text-gray-400 text-sm italic">No custom fields yet. Add fields above to define what providers must submit.</p>
      ) : (
        <div className="space-y-3">
          {fields.map((field, i) => (
            field.fieldType === "PHONE_CALL" ? (
              <div key={i} className="space-y-2">
                <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  {fieldTypeBadge(field.fieldType)}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-green-800">Verified Phone Call</p>
                    <p className="text-xs text-green-600">Provider must call the business and speak for 30+ seconds before submitting — always required, always first</p>
                  </div>
                  <span className="text-xs text-green-600 font-medium whitespace-nowrap">Always Required</span>
                  <button onClick={() => removeField(i)} className="text-red-400 hover:text-red-600 text-sm">&#10005;</button>
                </div>
                <div className="ml-1 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <label className="block text-xs font-medium text-green-800 mb-1">📞 Call this number when a provider starts a verified call</label>
                  <input
                    type="tel"
                    value={callPhone}
                    onChange={e => setCallPhone(e.target.value)}
                    placeholder="e.g. (267) 393-5417"
                    className="w-full border border-green-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400/30 bg-white"
                  />
                  <p className="text-xs text-green-600 mt-1">This is the number Sinch will dial — use whichever location or direct line you want to receive these calls.</p>
                </div>
              </div>
            ) : (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                {fieldTypeBadge(field.fieldType)}
                <input
                  type="text"
                  value={field.label}
                  onChange={e => updateField(i, { label: e.target.value })}
                  placeholder="Field label (e.g. Driver's License Photo)"
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#E8822A]/30"
                />
                {field.fieldType === "BINARY" && (
                  <>
                    <input
                      type="text"
                      value={field.optionA || ""}
                      onChange={e => updateField(i, { optionA: e.target.value })}
                      placeholder="Option A"
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    />
                    <input
                      type="text"
                      value={field.optionB || ""}
                      onChange={e => updateField(i, { optionB: e.target.value })}
                      placeholder="Option B"
                      className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    />
                  </>
                )}
                <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
                  <input type="checkbox" checked={field.isMandatory} onChange={e => updateField(i, { isMandatory: e.target.checked })} className="rounded" />
                  Required
                </label>
                <button onClick={() => moveField(i, "up")} disabled={i === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-sm">&#9650;</button>
                <button onClick={() => moveField(i, "down")} disabled={i === fields.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 text-sm">&#9660;</button>
                <button onClick={() => removeField(i)} className="text-red-400 hover:text-red-600 text-sm">&#10005;</button>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}
