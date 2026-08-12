"use client";

/**
 * DL scan criteria field.
 * Renders when a criteria field has field_type = 'DL_SCAN'.
 *
 * Ported from options-insurance/src/components/quote/LicenseScanner.tsx but
 * simplified for the WOML provider dashboard: no "success banner" (parent
 * form handles confirmation), no manual entry — that's a separate criteria
 * field the business can add if they want.
 *
 * Emits structured payload up to parent via onExtracted, which stores it
 * in the lead's scanned_data.dl JSONB slot.
 */
import { useState, useRef, useEffect } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { parseAAMVA, type AAMVAData } from "@/lib/aamva";

export interface DLScanPayload {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  licenseNumber?: string;
  expirationDate?: string;
  sex?: string;
  source: "barcode" | "ocr";
}

type Mode = "idle" | "barcode" | "photo" | "scanning";
const HINT_AFTER_MS = 8000;

interface Props {
  label?: string;
  onExtracted: (data: DLScanPayload) => void;
  captured?: DLScanPayload | null;
}

export default function DLScannerField({ label = "Driver's License", onExtracted, captured }: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [showHint, setShowHint] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => stopBarcodeStream(), []);

  function stopBarcodeStream() {
    try { controlsRef.current?.stop(); } catch { /* ignore */ }
    controlsRef.current = null;
    if (hintTimerRef.current) { clearTimeout(hintTimerRef.current); hintTimerRef.current = null; }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }

  async function startBarcodeScan() {
    setError(null); setPreview(null); setShowHint(false); setMode("barcode");
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    if (!videoRef.current) { setError("Camera not ready. Try again."); setMode("idle"); return; }

    hintTimerRef.current = setTimeout(() => setShowHint(true), HINT_AFTER_MS);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
    } catch (err) {
      const name = (err as Error)?.name || "";
      setError(name === "NotAllowedError" ? "Camera access denied. Enable in Settings, or tap 'Photo Front' instead." : `Couldn't start camera. Try Photo Front instead.`);
      setMode("idle"); if (hintTimerRef.current) clearTimeout(hintTimerRef.current); return;
    }

    const video = videoRef.current;
    video.srcObject = stream;
    try { await video.play(); } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("Camera couldn't start playback. Try Photo Front."); setMode("idle"); return;
    }

    try {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      const controls = await readerRef.current.decodeFromVideoElement(video, (result, err, ctrl) => {
        if (err && err.name !== "NotFoundException") console.debug("Barcode scanner:", err.name);
        if (!result) return;
        const parsed = parseAAMVA(result.getText());
        if (parsed) {
          ctrl.stop(); stopBarcodeStream();
          emit(parsed, "barcode");
        }
      });
      controlsRef.current = controls;
    } catch {
      stopBarcodeStream();
      setError("Scanner failed to start. Try Photo Front."); setMode("idle");
    }
  }

  function emit(data: AAMVAData, source: "barcode" | "ocr") {
    onExtracted({
      firstName: data.firstName, middleName: data.middleName, lastName: data.lastName,
      dateOfBirth: data.dateOfBirth, street: data.street, city: data.city, state: data.state, zip: data.zip,
      licenseNumber: data.licenseNumber, expirationDate: data.expirationDate, sex: data.sex,
      source,
    });
    setMode("idle");
  }

  function cancelBarcode() { stopBarcodeStream(); setMode("idle"); }

  async function handlePhotoFile(file: File) {
    if (!file.type.startsWith("image/")) { setError("Please pick an image."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Image must be under 10 MB."); return; }
    setError(null);
    const r = new FileReader(); r.onload = (e) => setPreview(e.target?.result as string); r.readAsDataURL(file);
    setMode("scanning");
    try {
      const fd = new FormData(); fd.append("image", file);
      const res = await fetch("/api/scan-license", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Scan failed"); setMode("photo"); return; }
      emit({
        firstName: data.firstName, middleName: data.middleName, lastName: data.lastName,
        dateOfBirth: data.dateOfBirth, street: data.street, city: data.city, state: data.state, zip: data.zip,
      }, "ocr");
    } catch { setError("Scan failed. Try again."); setMode("photo"); }
  }

  function onPhotoInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (file) handlePhotoFile(file);
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-gray-800">{label}</label>

      <div className={mode === "barcode" ? "block" : "hidden"}>
        <div className="rounded-xl overflow-hidden bg-black relative aspect-[4/3]">
          <video ref={videoRef} playsInline muted autoPlay {...({ "webkit-playsinline": "true" } as Record<string, string>)} className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-emerald-400 w-4/5 h-24 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
          </div>
          <p className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1 rounded-full">Aim at the barcode on the BACK</p>
          {showHint && <div className="absolute bottom-14 left-3 right-3 bg-amber-500/95 text-white text-[11px] px-3 py-2 rounded-lg text-center">Not seeing it? Flip the license — barcode is on the BACK.</div>}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <button type="button" onClick={cancelBarcode} className="bg-white/90 text-gray-900 font-semibold px-4 py-1.5 rounded-full text-xs">Cancel</button>
          </div>
        </div>
      </div>

      {mode === "idle" && !captured && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={startBarcodeScan} className="p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v16M8 4v16M12 4v16M16 4v16M20 4v16" /></svg>
            Scan Back
          </button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 rounded-lg text-sm font-semibold">Photo Front</button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={onPhotoInput} className="hidden" />
        </div>
      )}

      {(mode === "photo" || mode === "scanning") && preview && (
        <div className="relative">
          <img src={preview} alt="License preview" className="w-full rounded-lg border max-h-40 object-cover" />
          {mode === "scanning" && (
            <div className="absolute inset-0 bg-white/85 rounded-lg flex items-center justify-center">
              <div className="text-center"><div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-1" /><p className="text-xs">Reading license…</p></div>
            </div>
          )}
        </div>
      )}

      {captured && mode === "idle" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs">
          <div className="flex justify-between items-start gap-2">
            <div>
              <p className="font-semibold text-emerald-900">Scanned via {captured.source === "barcode" ? "barcode ✓" : "photo (OCR)"}</p>
              <p className="text-emerald-800 mt-1">{[captured.firstName, captured.middleName, captured.lastName].filter(Boolean).join(" ")}, DOB {captured.dateOfBirth}</p>
              <p className="text-emerald-700 mt-0.5">{captured.street}, {captured.city}, {captured.state} {captured.zip}</p>
            </div>
            <button type="button" onClick={() => onExtracted({ source: "barcode" } as DLScanPayload)} className="text-emerald-700 hover:text-emerald-900 text-xs underline shrink-0">Re-scan</button>
          </div>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">{error}</div>}
    </div>
  );
}
