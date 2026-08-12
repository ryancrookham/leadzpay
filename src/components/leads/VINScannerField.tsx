"use client";

/**
 * VIN scan criteria field.
 * Renders when a criteria field has field_type = 'VIN_SCAN'.
 *
 * Ported from options-insurance/src/components/quote/VinScanner.tsx.
 * Emits { vin: "17-char" } up to parent for storage in scanned_data.vin.
 */
import { useState, useRef, useEffect } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

export interface VINScanPayload {
  vin: string;
  source: "barcode" | "ocr" | "manual";
}

interface Props {
  label?: string;
  onExtracted: (data: VINScanPayload) => void;
  captured?: VINScanPayload | null;
}

type Mode = "idle" | "barcode" | "photo" | "scanning" | "manual";

export default function VINScannerField({ label = "VIN", onExtracted, captured }: Props) {
  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [manualVin, setManualVin] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => () => stopBarcodeStream(), []);

  function stopBarcodeStream() {
    try { controlsRef.current?.stop(); } catch { /* ignore */ }
    controlsRef.current = null;
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
  }

  async function startBarcodeScan() {
    setError(null); setPreview(null); setMode("barcode");
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    if (!videoRef.current) { setError("Camera not ready. Try again."); setMode("idle"); return; }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
    } catch {
      setError("Camera access denied."); setMode("idle"); return;
    }

    const video = videoRef.current;
    video.srcObject = stream;
    try { await video.play(); } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("Playback failed."); setMode("idle"); return;
    }

    try {
      if (!readerRef.current) readerRef.current = new BrowserMultiFormatReader();
      const controls = await readerRef.current.decodeFromVideoElement(video, (result, err, ctrl) => {
        if (err && err.name !== "NotFoundException") console.debug("Scanner:", err.name);
        if (!result) return;
        const text = result.getText().toUpperCase().replace(/\s/g, "");
        if (VIN_RE.test(text)) {
          ctrl.stop(); stopBarcodeStream(); emit(text, "barcode");
        } else if (text.length >= 17) {
          const m = text.match(/[A-HJ-NPR-Z0-9]{17}/);
          if (m) { ctrl.stop(); stopBarcodeStream(); emit(m[0], "barcode"); }
        }
      });
      controlsRef.current = controls;
    } catch { stopBarcodeStream(); setError("Scanner failed."); setMode("idle"); }
  }

  function emit(vin: string, source: "barcode" | "ocr" | "manual") {
    onExtracted({ vin, source });
    setMode("idle");
  }

  function cancelBarcode() { stopBarcodeStream(); setMode("idle"); }

  async function handlePhotoFile(file: File) {
    if (!file.type.startsWith("image/")) { setError("Pick an image."); return; }
    if (file.size > 10 * 1024 * 1024) { setError("Under 10 MB."); return; }
    setError(null);
    const r = new FileReader(); r.onload = (e) => setPreview(e.target?.result as string); r.readAsDataURL(file);
    setMode("scanning");
    try {
      const fd = new FormData(); fd.append("image", file);
      const res = await fetch("/api/scan-vin", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.vin) { setError(data.error || "Couldn't read VIN"); setMode("photo"); return; }
      if (!VIN_RE.test(data.vin)) { setError(`Extracted "${data.vin}" but not a valid VIN`); setMode("photo"); return; }
      emit(data.vin, "ocr");
    } catch { setError("Scan failed."); setMode("photo"); }
  }

  function onPhotoInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (file) handlePhotoFile(file);
  }

  function submitManual() {
    const v = manualVin.toUpperCase().replace(/\s/g, "");
    if (!VIN_RE.test(v)) { setError("VIN must be 17 chars, no I/O/Q."); return; }
    emit(v, "manual");
    setManualVin("");
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-gray-800">{label}</label>

      <div className={mode === "barcode" ? "block" : "hidden"}>
        <div className="rounded-xl overflow-hidden bg-black relative aspect-[4/3]">
          <video ref={videoRef} playsInline muted autoPlay {...({ "webkit-playsinline": "true" } as Record<string, string>)} className="w-full h-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="border-2 border-emerald-400 w-4/5 h-14 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.5)]" />
          </div>
          <p className="absolute top-3 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs px-3 py-1 rounded-full">Line up the VIN barcode</p>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
            <button type="button" onClick={cancelBarcode} className="bg-white/90 text-gray-900 font-semibold px-4 py-1.5 rounded-full text-xs">Cancel</button>
          </div>
        </div>
      </div>

      {mode === "idle" && !captured && (
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={startBarcodeScan} className="p-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold">Scan Barcode</button>
          <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 rounded-lg text-xs font-semibold">Take Photo</button>
          <button type="button" onClick={() => setMode("manual")} className="p-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 rounded-lg text-xs font-semibold">Type It</button>
          <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={onPhotoInput} className="hidden" />
        </div>
      )}

      {mode === "manual" && (
        <div className="space-y-2">
          <input type="text" value={manualVin} onChange={(e) => setManualVin(e.target.value.toUpperCase())} maxLength={17} placeholder="1HGBH41JXMN109186" className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg text-sm font-mono tracking-wider uppercase focus:ring-2 focus:ring-emerald-500" />
          <div className="flex gap-2">
            <button type="button" onClick={submitManual} disabled={manualVin.length !== 17} className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold py-2 rounded-lg">Save VIN</button>
            <button type="button" onClick={() => { setMode("idle"); setManualVin(""); }} className="px-4 text-sm text-gray-600">Cancel</button>
          </div>
        </div>
      )}

      {(mode === "photo" || mode === "scanning") && preview && (
        <div className="relative">
          <img src={preview} alt="VIN preview" className="w-full rounded-lg border max-h-40 object-cover" />
          {mode === "scanning" && (
            <div className="absolute inset-0 bg-white/85 rounded-lg flex items-center justify-center">
              <div className="text-center"><div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-1" /><p className="text-xs">Reading VIN…</p></div>
            </div>
          )}
        </div>
      )}

      {captured && mode === "idle" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs flex justify-between items-center">
          <div>
            <p className="font-semibold text-emerald-900">VIN captured ({captured.source})</p>
            <p className="font-mono text-emerald-800 mt-0.5">{captured.vin}</p>
          </div>
          <button type="button" onClick={() => onExtracted({ vin: "", source: "manual" })} className="text-emerald-700 hover:text-emerald-900 text-xs underline">Change</button>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">{error}</div>}
    </div>
  );
}
