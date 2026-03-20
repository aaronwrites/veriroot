import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Leaf, Factory, Truck, ScanLine, Plus, Package, MapPin, Calendar,
  Weight, FileText, QrCode, ChevronRight, CheckCircle2, AlertTriangle,
  Zap, Fuel, Ship, Clock, Layers, ShieldCheck, ShieldAlert, Search, X,
  Upload, Hash, Fingerprint, BarChart3, Star, Waypoints, Radio,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10).toUpperCase();
const LS_KEY = "veriroot_v2";
const loadDB = () => { try { const r = localStorage.getItem(LS_KEY); if (r) return JSON.parse(r); } catch {} return null; };
const saveDB = (db) => localStorage.setItem(LS_KEY, JSON.stringify(db));
const haversine = (la1, lo1, la2, lo2) => {
  const R = 6371, rad = d => d * Math.PI / 180;
  const a = Math.sin(rad(la2 - la1) / 2) ** 2 + Math.cos(rad(la1)) * Math.cos(rad(la2)) * Math.sin(rad(lo2 - lo1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};
const formatDate = iso => !iso ? "—" : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

// ─── Constants ────────────────────────────────────────────────────────────────
const EMISSION_FACTORS = { "Electric Van": 0.05, "Diesel Truck": 0.21, "Heavy Freight": 0.35 };
const VEHICLE_ICONS = { "Electric Van": Zap, "Diesel Truck": Fuel, "Heavy Freight": Ship };
const PACKAGING_CO2 = { "Cardboard": 0.5, "Plastic": 1.5, "Glass": 2.0, "Biodegradable": 0.2 };
const CATEGORIES = ["General", "Beverage", "Food", "Electronics", "Manufacturing", "Textile", "Pharmaceutical", "Cosmetics"];
const STATUS_COLORS = {
  "Raw Material Procurement": "bg-blue-100 text-blue-800 border-blue-300",
  "In-Transit (to Factory)":  "bg-cyan-100 text-cyan-800 border-cyan-300",
  "Manufacturing":             "bg-violet-100 text-violet-800 border-violet-300",
  "Packaging":                 "bg-amber-100 text-amber-800 border-amber-300",
  "In-Transit (to Retail)":   "bg-orange-100 text-orange-800 border-orange-300",
  "Approved":                  "bg-emerald-100 text-emerald-800 border-emerald-300",
  "Rejected":                  "bg-red-100 text-red-800 border-red-300",
  "Delivered":                 "bg-green-100 text-green-800 border-green-300",
};

// ─── Carbon Engine ────────────────────────────────────────────────────────────
const computeTotalCarbon = p => {
  const transport = p.milestones.reduce((s, m) => s + (m.carbonImpact || 0), 0);
  const electricity = (p.electricityKwh || 0) * 0.233;
  const packaging = PACKAGING_CO2[p.packagingType] || 0;
  return +(transport + electricity + packaging).toFixed(2);
};

// ─── Sustainability Score ─────────────────────────────────────────────────────
const computeScore = p => {
  let total = 0;
  const breakdown = [];
  const mc = p.materials.length;
  const traced = p.materials.filter(m => m.supplier && m.location?.lat && m.proofImage).length;
  const matPts = mc > 0 ? +(traced / mc * 2).toFixed(1) : 0;
  total += matPts;
  breakdown.push({ label: "Material Traceability", score: matPts, max: 2, detail: `${traced}/${mc} materials traced`, icon: Package });

  const statuses = p.milestones.map(m => m.status);
  let intPts = 0;
  if (statuses.includes("Raw Material Procurement")) intPts += 0.5;
  if (statuses.includes("Manufacturing") || statuses.includes("Packaging")) intPts += 0.5;
  if (statuses.some(s => s.includes("In-Transit"))) intPts += 0.5;
  if (p.milestones.length >= 3) intPts += 0.5;
  total += intPts;
  breakdown.push({ label: "Supply Chain", score: +intPts.toFixed(1), max: 2, detail: `${p.milestones.length} milestones recorded`, icon: ShieldCheck });

  const co2 = computeTotalCarbon(p);
  const carbonPts = co2 <= 5 ? 2 : co2 <= 20 ? 1.5 : co2 <= 50 ? 1 : co2 <= 100 ? 0.5 : 0;
  total += carbonPts;
  breakdown.push({ label: "Carbon Efficiency", score: carbonPts, max: 2, detail: `${co2}kg CO₂ total`, icon: Leaf });

  const matW = p.materials.reduce((s, m) => s + m.weight, 0);
  const wPts = p.batchWeight <= matW ? 2 : 0;
  total += wPts;
  breakdown.push({ label: "Weight Integrity", score: wPts, max: 2, detail: `Batch ${p.batchWeight}kg vs ${matW}kg mats`, icon: Weight });

  const vPts = p.qrUnlocked ? 2 : p.inspectorDecision === "rejected" ? 0 : 1;
  total += vPts;
  breakdown.push({ label: "Verification", score: vPts, max: 2, detail: p.qrUnlocked ? "Approved by Inspector" : "Pending inspection", icon: Fingerprint });

  return { total: +total.toFixed(1), max: 10, breakdown };
};

const scoreColor = s => {
  if (s >= 8) return { ring: "text-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", label: "Excellent" };
  if (s >= 6) return { ring: "text-blue-500",    bg: "bg-blue-50",    text: "text-blue-700",    label: "Good"      };
  if (s >= 4) return { ring: "text-amber-500",   bg: "bg-amber-50",   text: "text-amber-700",   label: "Fair"      };
  return        { ring: "text-red-500",           bg: "bg-red-50",     text: "text-red-700",     label: "Poor"      };
};

// ─── Components ───────────────────────────────────────────────────────────────
function ScoreRing({ score, max = 10, size = 120 }) {
  const r = (size - 12) / 2, circ = 2 * Math.PI * r;
  const { ring, text } = scoreColor(score);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e7e5e4" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - score / max)}
          className={`${ring} transition-all duration-700`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-black ${text}`}>{score}</span>
        <span className="text-[10px] font-bold text-stone-400">/{max}</span>
      </div>
    </div>
  );
}

function SourceBadge({ source }) {
  return source === "sensor"
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full border border-emerald-200"><Radio className="w-2.5 h-2.5" />SENSOR</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold rounded-full border border-orange-200"><Fingerprint className="w-2.5 h-2.5" />MANUAL</span>;
}

function QRDisplay({ batchId }) {
  const bits = Array.from({ length: 64 }, (_, i) => (batchId.charCodeAt(i % batchId.length) >> (i % 8)) & 1);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="p-3 bg-white border-4 border-stone-900 rounded-xl shadow-inner">
        <div className="w-28 h-28 grid grid-cols-8 gap-px">
          {bits.map((b, i) => <div key={i} className={`rounded-[1px] ${b ? "bg-stone-900" : "bg-white"}`} />)}
        </div>
      </div>
      <p className="font-mono text-xs font-bold text-stone-500 tracking-wider">{batchId}</p>
    </div>
  );
}

// ─── Seed Data ────────────────────────────────────────────────────────────────
const buildSeedData = () => {
  const id1 = "VR-" + uid(), id2 = "VR-" + uid();
  const now = Date.now();
  return {
    products: [
      {
        id: id1, name: "Eco-Sourced Soft Drink", category: "Beverage",
        createdAt: new Date(now - 5 * 86400000).toISOString(), batchWeight: 480,
        electricityKwh: 120, packagingType: "Cardboard",
        packagingSource: "Recycled Paper Mills, Germany", productionQty: 2400,
        inspectorDecision: "approved",
        inspectorNotes: "All data verified. Carbon footprint within acceptable limits.",
        qrUnlocked: true, locked: true,
        materials: [
          { id: uid(), name: "Organic Cane Sugar", supplier: "GreenFields Co-op, Brazil", location: { lat: -14.235, lng: -51.9253 }, purchaseDate: new Date(now - 12 * 86400000).toISOString(), proofImage: "invoice_sugar_0421.pdf", weight: 200, certification: "Organic Cert #4421", source: "sensor" },
          { id: uid(), name: "PLA Resin (Bio-Plastic)", supplier: "NaturWorks LLC, Nebraska", location: { lat: 40.8136, lng: -96.7026 }, purchaseDate: new Date(now - 10 * 86400000).toISOString(), proofImage: "invoice_pla_0419.pdf", weight: 150, certification: "GRS Certified", source: "sensor" },
          { id: uid(), name: "Natural Citrus Extract", supplier: "Citrus Valley Farms, Spain", location: { lat: 39.4699, lng: -0.3763 }, purchaseDate: new Date(now - 9 * 86400000).toISOString(), proofImage: "invoice_citrus_0418.pdf", weight: 130, certification: "EU Organic", source: "sensor" },
        ],
        milestones: [
          { id: uid(), status: "Raw Material Procurement", location: { lat: 40.7128, lng: -74.006 }, timestamp: new Date(now - 5 * 86400000).toISOString(), handlerRole: "Factory Manager", vehicleType: null, carbonImpact: 0, source: "sensor", notes: "" },
          { id: uid(), status: "In-Transit (to Factory)", location: { lat: 39.9526, lng: -75.1652 }, timestamp: new Date(now - 4 * 86400000).toISOString(), handlerRole: "Transport Driver", vehicleType: "Electric Van", carbonImpact: 4.85, source: "sensor", notes: "97km via Electric Van" },
          { id: uid(), status: "Manufacturing", location: { lat: 40.7128, lng: -74.006 }, timestamp: new Date(now - 3 * 86400000).toISOString(), handlerRole: "Factory Manager", vehicleType: null, carbonImpact: 0, source: "sensor", notes: "120 kWh used, 2400 units" },
          { id: uid(), status: "Packaging", location: { lat: 40.7128, lng: -74.006 }, timestamp: new Date(now - 2.5 * 86400000).toISOString(), handlerRole: "Factory Manager", vehicleType: null, carbonImpact: 0, source: "sensor", notes: "Cardboard (Recycled Paper Mills, Germany)" },
          { id: uid(), status: "Approved", location: { lat: 40.7128, lng: -74.006 }, timestamp: new Date(now - 1 * 86400000).toISOString(), handlerRole: "External Inspector", vehicleType: null, carbonImpact: 0, source: "manual", notes: "All data verified. Carbon footprint within acceptable limits." },
          { id: uid(), status: "In-Transit (to Retail)", location: { lat: 38.9072, lng: -77.0369 }, timestamp: new Date(now - 0.5 * 86400000).toISOString(), handlerRole: "Transport Driver", vehicleType: "Electric Van", carbonImpact: 2.45, source: "sensor", notes: "49km via Electric Van" },
        ],
      },
      {
        id: id2, name: "Industrial Bearing Assembly", category: "Manufacturing",
        createdAt: new Date(now - 8 * 86400000).toISOString(), batchWeight: 550,
        electricityKwh: 340, packagingType: "Plastic",
        packagingSource: "PolyPack Ltd, Rotterdam", productionQty: 500,
        inspectorDecision: null, inspectorNotes: "", qrUnlocked: false, locked: false,
        materials: [
          { id: uid(), name: "Cold-Rolled Steel Sheet", supplier: "Tata Steel, Jamshedpur", location: { lat: 22.8046, lng: 86.2029 }, purchaseDate: new Date(now - 15 * 86400000).toISOString(), proofImage: "invoice_steel_0410.pdf", weight: 320, certification: "ISO 9001:2015", source: "manual" },
          { id: uid(), name: "Aluminum Ingot (Recycled)", supplier: "Novelis, Atlanta", location: { lat: 33.749, lng: -84.388 }, purchaseDate: new Date(now - 13 * 86400000).toISOString(), proofImage: "invoice_aluminum_0412.pdf", weight: 275, certification: "ACC Recycled", source: "sensor" },
        ],
        milestones: [
          { id: uid(), status: "Raw Material Procurement", location: { lat: 12.9716, lng: 77.5946 }, timestamp: new Date(now - 8 * 86400000).toISOString(), handlerRole: "Factory Manager", vehicleType: null, carbonImpact: 0, source: "manual", notes: "" },
          { id: uid(), status: "In-Transit (to Factory)", location: { lat: 19.076, lng: 72.8777 }, timestamp: new Date(now - 7 * 86400000).toISOString(), handlerRole: "Transport Driver", vehicleType: "Diesel Truck", carbonImpact: 18.73, source: "manual", notes: "89km via Diesel Truck" },
          { id: uid(), status: "Manufacturing", location: { lat: 12.9716, lng: 77.5946 }, timestamp: new Date(now - 5 * 86400000).toISOString(), handlerRole: "Factory Manager", vehicleType: null, carbonImpact: 0, source: "manual", notes: "340 kWh used, 500 units" },
          { id: uid(), status: "Packaging", location: { lat: 12.9716, lng: 77.5946 }, timestamp: new Date(now - 4 * 86400000).toISOString(), handlerRole: "Factory Manager", vehicleType: null, carbonImpact: 0, source: "manual", notes: "Plastic (PolyPack Ltd, Rotterdam)" },
        ],
      },
    ],
    materials: [],
  };
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [db, setDb] = useState(() => loadDB() || buildSeedData());
  const [role, setRole] = useState("consumer");
  const [fmStep, setFmStep] = useState(0);

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [scanInput, setScanInput] = useState("");
  const [inspectTarget, setInspectTarget] = useState(null);
  const [toast, setToast] = useState(null);

  const [matForm, setMatForm] = useState({ name: "", supplier: "", lat: "", lng: "", weight: "", certification: "" });
  const [batchForm, setBatchForm] = useState({ name: "", weight: "", category: "General", selectedMats: [] });
  const [mfgForm, setMfgForm] = useState({ productId: "", electricityKwh: "", productionQty: "", packagingType: "Cardboard", packagingSource: "" });
  const [driverForm, setDriverForm] = useState({ batchId: "", vehicleType: "Electric Van", distanceKm: "" });
  const [inspectorNotes, setInspectorNotes] = useState("");

  useEffect(() => { saveDB(db); }, [db]);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const updateProduct = useCallback((id, updater) =>
    setDb(prev => ({ ...prev, products: prev.products.map(p => p.id === id ? updater(p) : p) })),
    []);

  // ── useMemo ──
  const totalMatsWeight = useMemo(() => db.materials.reduce((s, m) => s + m.weight, 0), [db.materials]);
  const selectedMatsWeight = useMemo(() =>
    batchForm.selectedMats.reduce((s, id) => { const m = db.materials.find(x => x.id === id); return s + (m?.weight || 0); }, 0),
    [batchForm.selectedMats, db.materials]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const addMaterial = () => {
    const { name, supplier, lat, lng, weight, certification } = matForm;
    if (!name || !supplier || !weight) return showToast("Fill required fields (name, supplier, weight)", "error");
    const mat = {
      id: uid(), name, supplier, certification,
      location: { lat: parseFloat(lat) || 28.6 + Math.random() * 5, lng: parseFloat(lng) || 77.2 + Math.random() * 5 },
      purchaseDate: new Date().toISOString(),
      proofImage: `invoice_${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}.pdf`,
      weight: parseFloat(weight), source: "manual",
    };
    const doAdd = (loc) => {
      if (loc) mat.location = loc;
      setDb(p => ({ ...p, materials: [...p.materials, mat] }));
      showToast(`Material "${name}" logged`);
    };
    if (navigator.geolocation && !lat) {
      navigator.geolocation.getCurrentPosition(
        pos => doAdd({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => doAdd(null)
      );
    } else { doAdd(null); }
    setMatForm({ name: "", supplier: "", lat: "", lng: "", weight: "", certification: "" });
  };

  const createBatch = () => {
    const { name, weight, selectedMats, category } = batchForm;
    if (!name || !weight || !selectedMats.length) return showToast("Fill all fields and select materials", "error");
    const bw = parseFloat(weight);
    if (bw > selectedMatsWeight) return showToast(`Batch weight (${bw}kg) exceeds available material (${selectedMatsWeight}kg)!`, "error");
    const product = {
      id: "VR-" + uid(), name, category, createdAt: new Date().toISOString(), batchWeight: bw,
      electricityKwh: 0, packagingType: "", packagingSource: "", productionQty: 0,
      inspectorDecision: null, inspectorNotes: "", qrUnlocked: false, locked: false,
      materials: selectedMats.map(id => db.materials.find(m => m.id === id)),
      milestones: [{
        id: uid(), status: "Raw Material Procurement",
        location: { lat: 28.6, lng: 77.2 }, timestamp: new Date().toISOString(),
        handlerRole: "Factory Manager", vehicleType: null, carbonImpact: 0, source: "manual", notes: "",
      }],
    };
    setDb(prev => ({ ...prev, products: [...prev.products, product], materials: prev.materials.filter(m => !selectedMats.includes(m.id)) }));
    setBatchForm({ name: "", weight: "", category: "General", selectedMats: [] });
    showToast(`Batch ${product.id} created!`);
  };

  const addManufacturingData = () => {
    const { productId, electricityKwh, productionQty, packagingType, packagingSource } = mfgForm;
    if (!productId || !electricityKwh || !productionQty) return showToast("Fill all required fields", "error");
    const p = db.products.find(x => x.id === productId);
    if (!p) return;
    if (p.locked) return showToast("Batch is locked after inspector approval", "error");
    const baseLoc = p.milestones[0]?.location || { lat: 28.6, lng: 77.2 };
    updateProduct(productId, prod => ({
      ...prod,
      electricityKwh: parseFloat(electricityKwh),
      productionQty: parseInt(productionQty),
      packagingType, packagingSource,
      milestones: [
        ...prod.milestones,
        { id: uid(), status: "Manufacturing", location: baseLoc, timestamp: new Date().toISOString(), handlerRole: "Factory Manager", vehicleType: null, carbonImpact: 0, source: "manual", notes: `${electricityKwh} kWh used, ${productionQty} units` },
        { id: uid(), status: "Packaging", location: baseLoc, timestamp: new Date(Date.now() + 600000).toISOString(), handlerRole: "Factory Manager", vehicleType: null, carbonImpact: 0, source: "manual", notes: `${packagingType} (${packagingSource})` },
      ],
    }));
    setMfgForm({ productId: "", electricityKwh: "", productionQty: "", packagingType: "Cardboard", packagingSource: "" });
    showToast("Manufacturing & packaging data saved!");
  };

  const recordDriverLeg = () => {
    const { batchId, vehicleType, distanceKm } = driverForm;
    if (!batchId || !distanceKm) return showToast("Enter batch ID and distance", "error");
    const p = db.products.find(x => x.id.toLowerCase() === batchId.trim().toLowerCase());
    if (!p) return showToast("Batch not found", "error");
    if (!p.qrUnlocked) return showToast("Batch must be inspector-approved before delivery", "error");
    const dist = parseFloat(distanceKm);
    const carbon = +(dist * EMISSION_FACTORS[vehicleType]).toFixed(2);
    const ms = {
      id: uid(), status: "In-Transit (to Retail)", timestamp: new Date().toISOString(),
      location: { lat: 28.6 + Math.random() * 5, lng: 77.2 + Math.random() * 5 },
      handlerRole: "Transport Driver", vehicleType, carbonImpact: carbon,
      source: "manual", notes: `${dist}km via ${vehicleType}`,
    };
    const doRecord = (loc) => {
      if (loc) ms.location = loc;
      updateProduct(p.id, prod => ({ ...prod, milestones: [...prod.milestones, ms] }));
      showToast(`Delivery recorded: ${dist}km → ${carbon}kg CO₂`);
    };
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => doRecord({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => doRecord(null)
      );
    } else { doRecord(null); }
    setDriverForm({ batchId: "", vehicleType: "Electric Van", distanceKm: "" });
  };

  const inspectBatch = (batchId, decision) => {
    const ms = {
      id: uid(), status: decision === "approved" ? "Approved" : "Rejected",
      location: { lat: 28.6, lng: 77.2 }, timestamp: new Date().toISOString(),
      handlerRole: "External Inspector", vehicleType: null, carbonImpact: 0,
      source: "manual", notes: inspectorNotes,
    };
    updateProduct(batchId, prod => ({
      ...prod, inspectorDecision: decision, inspectorNotes,
      qrUnlocked: decision === "approved", locked: decision === "approved",
      milestones: [...prod.milestones, ms],
    }));
    setInspectTarget(null);
    setInspectorNotes("");
    showToast(decision === "approved" ? "Batch APPROVED — QR code generated!" : "Batch REJECTED", decision === "approved" ? "success" : "error");
  };

  const roles = [
    { key: "factory_manager", label: "Factory Manager", icon: Factory },
    { key: "inspector",       label: "Inspector",        icon: ShieldCheck },
    { key: "driver",          label: "Transport Driver", icon: Truck },
    { key: "consumer",        label: "Consumer",         icon: ScanLine },
  ];

  const inp = "w-full px-4 py-2.5 border-2 border-stone-200 rounded-lg text-sm font-medium focus:outline-none";

  return (
    <div className="min-h-screen bg-stone-50 font-[Inter,sans-serif] text-stone-800">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-lg font-semibold shadow-xl border-2 text-sm max-w-sm transition-all ${toast.type === "error" ? "bg-red-50 text-red-700 border-red-400" : "bg-emerald-50 text-emerald-700 border-emerald-400"}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b-2 border-stone-900">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-9 h-9 rounded-lg bg-stone-900 flex items-center justify-center">
              <Fingerprint className="w-5 h-5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-stone-900">VeriRoot</span>
              <span className="text-[10px] font-bold text-stone-400 ml-2 hidden sm:inline">PRODUCT TRANSPARENCY PLATFORM</span>
            </div>
          </div>
          <div className="flex bg-stone-100 rounded-lg p-1 border-2 border-stone-200">
            {roles.map(r => (
              <button key={r.key}
                onClick={() => { setRole(r.key); setSelectedProduct(null); setInspectTarget(null); setScanInput(""); }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${role === r.key ? "bg-stone-900 text-white shadow" : "text-stone-500 hover:text-stone-900"}`}>
                <r.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{r.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* ══════════════════ FACTORY MANAGER ══════════════════ */}
        {role === "factory_manager" && (
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-black tracking-tight text-stone-900">Factory Manager Portal</h1>
              <p className="text-stone-500 mt-1">Manage raw material procurement, batch creation, manufacturing and packaging.</p>
            </div>
            <div className="flex gap-2 mb-8 flex-wrap">
              {["Raw Material Procurement", "Batch Creation", "Manufacturing & Packaging", "My Batches"].map((lbl, i) => (
                <button key={i} onClick={() => setFmStep(i)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-bold border-2 cursor-pointer transition-all ${fmStep === i ? "bg-stone-900 text-white border-stone-900" : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"}`}>
                  {lbl}
                </button>
              ))}
            </div>

            {/* Tab 0: Raw Material Procurement */}
            {fmStep === 0 && (
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border-2 border-stone-200 p-6">
                  <h2 className="text-lg font-bold mb-5 flex items-center gap-2"><Package className="w-5 h-5 text-emerald-600" />Log Raw Material</h2>
                  <div className="space-y-4">
                    <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Material Name *</label><input className={`${inp} focus:border-emerald-500`} placeholder="e.g. Organic Cane Sugar" value={matForm.name} onChange={e => setMatForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Supplier & Origin *</label><input className={`${inp} focus:border-emerald-500`} placeholder="e.g. GreenFields Co-op, Brazil" value={matForm.supplier} onChange={e => setMatForm(f => ({ ...f, supplier: e.target.value }))} /></div>
                    <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Certification</label><input className={`${inp} focus:border-emerald-500`} placeholder="e.g. Organic Cert #4421" value={matForm.certification} onChange={e => setMatForm(f => ({ ...f, certification: e.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Latitude</label><input className={`${inp} focus:border-emerald-500`} placeholder="Auto-detect" value={matForm.lat} onChange={e => setMatForm(f => ({ ...f, lat: e.target.value }))} /></div>
                      <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Longitude</label><input className={`${inp} focus:border-emerald-500`} placeholder="Auto-detect" value={matForm.lng} onChange={e => setMatForm(f => ({ ...f, lng: e.target.value }))} /></div>
                    </div>
                    <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Weight (kg) *</label><input type="number" className={`${inp} focus:border-emerald-500`} placeholder="e.g. 200" value={matForm.weight} onChange={e => setMatForm(f => ({ ...f, weight: e.target.value }))} /></div>
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-stone-50 border-2 border-dashed border-stone-300 rounded-lg text-sm text-stone-500 cursor-pointer hover:border-emerald-400 transition-colors"><Upload className="w-4 h-4" />Image / Invoice Upload (simulated)</div>
                    <button onClick={addMaterial} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"><Plus className="w-4 h-4" />Log Material</button>
                  </div>
                </div>
                <div className="bg-white rounded-xl border-2 border-stone-200 p-6">
                  <h2 className="text-lg font-bold mb-5 flex items-center gap-2"><Layers className="w-5 h-5 text-blue-600" />Material Inventory<span className="ml-auto text-xs font-bold bg-stone-100 px-3 py-1 rounded-full text-stone-500">{db.materials.length} items · {totalMatsWeight}kg</span></h2>
                  {db.materials.length === 0 ? (
                    <div className="text-sm text-stone-400 py-12 text-center">No loose materials. Log some above.</div>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {db.materials.map(m => (
                        <div key={m.id} className="p-4 bg-stone-50 rounded-lg border border-stone-200">
                          <div className="flex justify-between items-start">
                            <div><p className="font-bold text-sm flex items-center gap-2">{m.name} <SourceBadge source={m.source} /></p><p className="text-xs text-stone-500 mt-0.5">{m.supplier}</p></div>
                            <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-md">{m.weight}kg</span>
                          </div>
                          {m.certification && <p className="text-xs text-emerald-600 mt-1 font-medium">✓ {m.certification}</p>}
                          <div className="flex gap-3 mt-2 text-xs text-stone-400">
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{m.location.lat.toFixed(2)}, {m.location.lng.toFixed(2)}</span>
                            <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{m.proofImage}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Tab 1: Batch Creation */}
            {fmStep === 1 && (
              <div className="grid lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl border-2 border-stone-200 p-6">
                  <h2 className="text-lg font-bold mb-5 flex items-center gap-2"><Package className="w-5 h-5 text-purple-600" />Create New Batch</h2>
                  <div className="space-y-4">
                    <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Product Name *</label><input className={`${inp} focus:border-purple-500`} placeholder="e.g. Eco-Drink Batch #7" value={batchForm.name} onChange={e => setBatchForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Category</label>
                      <select className={`${inp} focus:border-purple-500 bg-white`} value={batchForm.category} onChange={e => setBatchForm(f => ({ ...f, category: e.target.value }))}>
                        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Batch Weight (kg) *</label><input type="number" className={`${inp} focus:border-purple-500`} placeholder={`Max ${selectedMatsWeight}kg`} value={batchForm.weight} onChange={e => setBatchForm(f => ({ ...f, weight: e.target.value }))} /></div>
                    <div className={`p-3 rounded-lg border-2 text-xs font-bold flex items-center gap-2 ${batchForm.weight && parseFloat(batchForm.weight) > selectedMatsWeight ? "bg-red-50 border-red-300 text-red-700" : "bg-emerald-50 border-emerald-300 text-emerald-700"}`}>
                      <Weight className="w-4 h-4" />Mass Balance: {selectedMatsWeight}kg available{batchForm.weight && <span> → {batchForm.weight}kg {parseFloat(batchForm.weight) > selectedMatsWeight ? "⚠ EXCEEDS" : "✓ OK"}</span>}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Select Materials</label>
                      {db.materials.length === 0 ? <p className="text-xs text-stone-400">No materials available. Go to Raw Material Procurement first.</p> : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {db.materials.map(m => {
                            const sel = batchForm.selectedMats.includes(m.id);
                            return (
                              <label key={m.id} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${sel ? "border-purple-400 bg-purple-50" : "border-stone-200 hover:border-stone-300"}`}>
                                <input type="checkbox" checked={sel} onChange={() => setBatchForm(f => ({ ...f, selectedMats: sel ? f.selectedMats.filter(x => x !== m.id) : [...f.selectedMats, m.id] }))} className="accent-purple-600" />
                                <div className="flex-1"><p className="text-sm font-bold">{m.name}</p><p className="text-xs text-stone-400">{m.supplier}</p></div>
                                <span className="text-xs font-bold bg-stone-100 px-2 py-1 rounded">{m.weight}kg</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <button onClick={createBatch} className="w-full py-3 bg-purple-600 text-white font-bold rounded-lg hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"><Plus className="w-4 h-4" />Create Batch</button>
                  </div>
                </div>
                <div className="bg-white rounded-xl border-2 border-stone-200 p-6">
                  <h2 className="text-lg font-bold mb-5 flex items-center gap-2"><Hash className="w-5 h-5 text-amber-600" />All Batches</h2>
                  <div className="space-y-3 max-h-[32rem] overflow-y-auto">
                    {db.products.map(p => {
                      const last = p.milestones[p.milestones.length - 1];
                      const sc = computeScore(p);
                      return (
                        <div key={p.id} className="p-4 rounded-lg border-2 border-stone-200">
                          <div className="flex justify-between items-center">
                            <div><p className="font-bold text-sm">{p.name}</p><p className="font-mono text-xs text-stone-400 mt-0.5">{p.id}</p></div>
                            <div className="flex items-center gap-2">
                              {p.locked && <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-300">🔒 Locked</span>}
                              <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${STATUS_COLORS[last?.status] || "bg-stone-100"}`}>{last?.status}</span>
                            </div>
                          </div>
                          <div className="flex gap-4 mt-2 text-xs text-stone-400">
                            <span>{p.category}</span><span>{p.materials.length} materials</span><span>{p.batchWeight}kg</span>
                            <span className={`font-bold ${scoreColor(sc.total).text}`}>{sc.total}/10</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Manufacturing & Packaging */}
            {fmStep === 2 && (
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-xl border-2 border-stone-200 p-6">
                  <h2 className="text-lg font-bold mb-5 flex items-center gap-2"><Zap className="w-5 h-5 text-violet-600" />Manufacturing & Packaging Data</h2>
                  <p className="text-sm text-stone-500 mb-5">Log electricity usage, production quantity, and packaging details. This data is used to calculate the final carbon footprint.</p>
                  <div className="space-y-4">
                    <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Select Batch *</label>
                      <select className={`${inp} focus:border-violet-500 bg-white`} value={mfgForm.productId} onChange={e => setMfgForm(f => ({ ...f, productId: e.target.value }))}>
                        <option value="">Choose a batch...</option>
                        {db.products.filter(p => !p.locked).map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Electricity Used (kWh) *</label><input type="number" className={`${inp} focus:border-violet-500`} placeholder="e.g. 120" value={mfgForm.electricityKwh} onChange={e => setMfgForm(f => ({ ...f, electricityKwh: e.target.value }))} /></div>
                      <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Production Quantity *</label><input type="number" className={`${inp} focus:border-violet-500`} placeholder="e.g. 2400 units" value={mfgForm.productionQty} onChange={e => setMfgForm(f => ({ ...f, productionQty: e.target.value }))} /></div>
                    </div>
                    {mfgForm.electricityKwh && (
                      <div className="p-3 bg-violet-50 border-2 border-violet-200 rounded-lg text-xs font-bold text-violet-700 flex items-center gap-2">
                        <Zap className="w-4 h-4" />Electricity CO₂: {(parseFloat(mfgForm.electricityKwh) * 0.233).toFixed(2)}kg (at 0.233 kg/kWh grid factor)
                      </div>
                    )}
                    <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Packaging Type *</label>
                      <select className={`${inp} focus:border-violet-500 bg-white`} value={mfgForm.packagingType} onChange={e => setMfgForm(f => ({ ...f, packagingType: e.target.value }))}>
                        {Object.entries(PACKAGING_CO2).map(([type, co2]) => <option key={type} value={type}>{type} ({co2}kg CO₂)</option>)}
                      </select>
                    </div>
                    <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Packaging Source</label><input className={`${inp} focus:border-violet-500`} placeholder="e.g. Recycled Paper Mills, Germany" value={mfgForm.packagingSource} onChange={e => setMfgForm(f => ({ ...f, packagingSource: e.target.value }))} /></div>
                    <button onClick={addManufacturingData} className="w-full py-3 bg-violet-600 text-white font-bold rounded-lg hover:bg-violet-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"><CheckCircle2 className="w-4 h-4" />Save Manufacturing Data</button>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: My Batches detailed */}
            {fmStep === 3 && (
              <div className="space-y-4">
                {db.products.map(p => {
                  const co2 = computeTotalCarbon(p);
                  const perUnit = p.productionQty > 0 ? (co2 / p.productionQty).toFixed(3) : "—";
                  return (
                    <div key={p.id} className="bg-white rounded-xl border-2 border-stone-200 p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                        <div>
                          <p className="text-xs font-bold text-stone-400 uppercase">{p.category}</p>
                          <h3 className="text-xl font-black text-stone-900">{p.name}</h3>
                          <p className="font-mono text-sm text-stone-400">{p.id}</p>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap">
                          {p.locked && <span className="flex items-center gap-1 text-xs font-bold bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-full border border-emerald-300"><ShieldCheck className="w-3.5 h-3.5" />Verified & Locked</span>}
                          {p.inspectorDecision === "rejected" && <span className="flex items-center gap-1 text-xs font-bold bg-red-100 text-red-700 px-3 py-1.5 rounded-full border border-red-300"><ShieldAlert className="w-3.5 h-3.5" />Rejected</span>}
                          {!p.inspectorDecision && <span className="text-xs font-bold bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full border border-amber-300">Pending Inspection</span>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                        {[["Batch Weight", `${p.batchWeight}kg`], ["Electricity", p.electricityKwh ? `${p.electricityKwh} kWh` : "—"], ["Production", p.productionQty || "—"], ["CO₂/unit", perUnit !== "—" ? `${perUnit}kg` : "—"]].map(([lbl, val]) => (
                          <div key={lbl} className="bg-stone-50 rounded-lg p-3 border border-stone-200">
                            <p className="text-lg font-black text-stone-900">{val}</p>
                            <p className="text-xs text-stone-500 font-bold">{lbl}</p>
                          </div>
                        ))}
                      </div>
                      {p.inspectorNotes && <p className="mt-4 text-sm text-stone-600 bg-stone-50 p-3 rounded-lg border border-stone-200"><span className="font-bold">Inspector notes:</span> {p.inspectorNotes}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ TRANSPORT DRIVER ══════════════════ */}
        {role === "driver" && (
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-black tracking-tight text-stone-900">Transport Driver Portal</h1>
              <p className="text-stone-500 mt-1">Log the final delivery to retail — only available for inspector-approved batches.</p>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border-2 border-stone-200 p-6">
                <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
                  <Truck className="w-5 h-5 text-blue-600" />Record Delivery to Retail
                </h2>
                <p className="text-sm text-stone-500 mb-5">
                  Only batches that have been approved by the External Quality Inspector can be dispatched for final delivery.
                </p>
                <div className="space-y-4">
                  <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Batch ID *</label>
                    <input className={`${inp} focus:border-blue-500`} placeholder="e.g. VR-XXXXXXXX" value={driverForm.batchId} onChange={e => setDriverForm(f => ({ ...f, batchId: e.target.value }))} />
                    {db.products.filter(p => p.qrUnlocked).length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-2">
                        <p className="text-[10px] font-bold text-stone-400 uppercase w-full">Approved batches ready for delivery:</p>
                        {db.products.filter(p => p.qrUnlocked).map(p => (
                          <button key={p.id} onClick={() => setDriverForm(f => ({ ...f, batchId: p.id }))}
                            className="px-2 py-1 bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-mono font-bold rounded hover:bg-emerald-100 cursor-pointer transition-colors">
                            {p.id}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600 font-medium mt-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />No approved batches yet. Inspector must approve a batch first.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Vehicle Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(EMISSION_FACTORS).map(([v, ef]) => {
                        const Icon = VEHICLE_ICONS[v];
                        return (
                          <button key={v} onClick={() => setDriverForm(f => ({ ...f, vehicleType: v }))}
                            className={`p-3 rounded-lg border-2 text-center cursor-pointer transition-all ${driverForm.vehicleType === v ? "border-blue-500 bg-blue-50 text-blue-700" : "border-stone-200 text-stone-500 hover:border-stone-300"}`}>
                            <Icon className="w-5 h-5 mx-auto mb-1" />
                            <span className="text-xs font-bold block">{v}</span>
                            <span className="text-[10px] text-stone-400">{ef} kg/km</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Distance (km) *</label><input type="number" className={`${inp} focus:border-blue-500`} placeholder="e.g. 250" value={driverForm.distanceKm} onChange={e => setDriverForm(f => ({ ...f, distanceKm: e.target.value }))} /></div>
                  {driverForm.distanceKm && driverForm.vehicleType && (
                    <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-lg text-xs font-bold text-blue-700 flex items-center gap-2">
                      <Fuel className="w-4 h-4" />Estimated CO₂: {(parseFloat(driverForm.distanceKm) * EMISSION_FACTORS[driverForm.vehicleType]).toFixed(2)}kg
                    </div>
                  )}
                  <div className="flex items-center gap-2 p-3 bg-stone-50 rounded-lg text-xs text-stone-500 border border-stone-200">
                    <MapPin className="w-4 h-4 flex-shrink-0" />GPS location will be captured automatically via browser geolocation
                  </div>
                  <button onClick={recordDriverLeg} className="w-full py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"><MapPin className="w-4 h-4" />Record Delivery</button>
                </div>
              </div>

              <div className="bg-white rounded-xl border-2 border-stone-200 p-6">
                <h2 className="text-lg font-bold mb-5 flex items-center gap-2"><Clock className="w-5 h-5 text-purple-600" />Recent Transport Logs</h2>
                <div className="space-y-3 max-h-[36rem] overflow-y-auto">
                  {db.products.flatMap(p => p.milestones.filter(m => m.handlerRole === "Transport Driver").map(m => ({ ...m, productName: p.name, productId: p.id }))).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20).map(m => {
                    const Icon = m.vehicleType ? VEHICLE_ICONS[m.vehicleType] : Truck;
                    return (
                      <div key={m.id} className="p-4 bg-stone-50 rounded-lg border border-stone-200">
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded border ${STATUS_COLORS[m.status] || "bg-stone-100"}`}>{m.status}</span>
                          {m.carbonImpact > 0 && <span className="text-xs font-bold text-orange-600">+{m.carbonImpact}kg CO₂</span>}
                        </div>
                        <p className="font-bold text-sm mt-2">{m.productName}</p>
                        <p className="font-mono text-xs text-stone-400">{m.productId}</p>
                        <div className="flex gap-3 mt-1.5 text-xs text-stone-400">
                          <span className="flex items-center gap-1">{Icon && <Icon className="w-3 h-3" />}{m.vehicleType}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDate(m.timestamp)}</span>
                        </div>
                        {m.notes && <p className="text-xs text-stone-400 mt-1">{m.notes}</p>}
                      </div>
                    );
                  })}
                  {db.products.flatMap(p => p.milestones.filter(m => m.handlerRole === "Transport Driver")).length === 0 && (
                    <div className="text-sm text-stone-400 py-12 text-center">No transport legs logged yet.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ INSPECTOR ══════════════════ */}
        {role === "inspector" && (
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-black tracking-tight text-stone-900">External Quality Inspector</h1>
              <p className="text-stone-500 mt-1">Review batches that have completed manufacturing. Approve to generate a QR code and lock the data, or reject to send back for correction.</p>
            </div>
            {inspectTarget ? (() => {
              const p = db.products.find(x => x.id === inspectTarget);
              if (!p) return null;
              const co2 = computeTotalCarbon(p);
              return (
                <div>
                  <button onClick={() => { setInspectTarget(null); setInspectorNotes(""); }} className="flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-stone-900 mb-6 cursor-pointer transition-colors"><X className="w-4 h-4" />Back to Batch List</button>
                  <div className="bg-white rounded-xl border-2 border-stone-200 p-6 mb-6">
                    <div className="flex justify-between items-start flex-wrap gap-4 mb-6">
                      <div>
                        <span className="text-xs font-bold text-stone-400 uppercase">{p.category}</span>
                        <h2 className="text-2xl font-black text-stone-900">{p.name}</h2>
                        <p className="font-mono text-sm text-stone-400">{p.id}</p>
                      </div>
                      <ScoreRing score={computeScore(p).total} size={96} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                      {[["Materials", p.materials.length], ["Batch Weight", `${p.batchWeight}kg`], ["Electricity", p.electricityKwh ? `${p.electricityKwh} kWh` : "—"], ["Total CO₂", `${co2}kg`]].map(([lbl, val]) => (
                        <div key={lbl} className="bg-stone-50 rounded-lg p-3 text-center border border-stone-200">
                          <p className="text-xl font-black text-stone-900">{val}</p>
                          <p className="text-xs text-stone-500 font-bold">{lbl}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mb-6">
                      <h3 className="text-sm font-bold mb-3 text-stone-700">Raw Materials</h3>
                      <div className="space-y-2">
                        {p.materials.map(m => (
                          <div key={m.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-lg border border-stone-200 text-sm">
                            <div><p className="font-bold">{m.name}</p><p className="text-xs text-stone-400">{m.supplier}</p>{m.certification && <p className="text-xs text-emerald-600 mt-0.5">✓ {m.certification}</p>}</div>
                            <div className="text-right"><span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">{m.weight}kg</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mb-6">
                      <h3 className="text-sm font-bold mb-3 text-stone-700">Supply Chain Milestones</h3>
                      <div className="space-y-2">
                        {p.milestones.map(ms => (
                          <div key={ms.id} className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg border border-stone-200">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded border flex-shrink-0 ${STATUS_COLORS[ms.status] || "bg-stone-100"}`}>{ms.status}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-stone-600 font-medium">{ms.handlerRole} · {formatDate(ms.timestamp)}</p>
                              {ms.notes && <p className="text-xs text-stone-400 truncate">{ms.notes}</p>}
                            </div>
                            {ms.carbonImpact > 0 && <span className="text-xs font-bold text-orange-600 flex-shrink-0">+{ms.carbonImpact}kg</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div><label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Inspector Notes</label><textarea className={`${inp} focus:border-stone-900 h-24 resize-none`} placeholder="Add your review notes..." value={inspectorNotes} onChange={e => setInspectorNotes(e.target.value)} /></div>
                      <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => inspectBatch(p.id, "approved")} className="py-3 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"><CheckCircle2 className="w-5 h-5" />Approve & Generate QR</button>
                        <button onClick={() => inspectBatch(p.id, "rejected")} className="py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"><AlertTriangle className="w-5 h-5" />Reject Batch</button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div>
                <div className="grid sm:grid-cols-3 gap-4 mb-8">
                  {[["Awaiting Review", db.products.filter(p => !p.inspectorDecision && p.milestones.some(m => m.status === "Packaging")).length, "text-amber-600"],["Approved", db.products.filter(p => p.inspectorDecision === "approved").length, "text-emerald-600"],["Rejected", db.products.filter(p => p.inspectorDecision === "rejected").length, "text-red-600"]].map(([lbl, count, cls]) => (
                    <div key={lbl} className="bg-white rounded-xl border-2 border-stone-200 p-5 text-center">
                      <p className={`text-4xl font-black ${cls}`}>{count}</p>
                      <p className="text-sm font-bold text-stone-500 mt-1">{lbl}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-4">
                  {db.products.map(p => {
                    const hasPkg = p.milestones.some(m => m.status === "Packaging");
                    const co2 = computeTotalCarbon(p);
                    return (
                      <div key={p.id} className="bg-white rounded-xl border-2 border-stone-200 p-5">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              {p.inspectorDecision === "approved" && <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full border border-emerald-300"><ShieldCheck className="w-3 h-3" />Approved</span>}
                              {p.inspectorDecision === "rejected" && <span className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-full border border-red-300"><ShieldAlert className="w-3 h-3" />Rejected</span>}
                              {!p.inspectorDecision && hasPkg && <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full border border-amber-300">⏳ Awaiting Review</span>}
                              {!p.inspectorDecision && !hasPkg && <span className="text-xs font-bold text-stone-500 bg-stone-100 px-2.5 py-1 rounded-full border border-stone-300">Not Ready</span>}
                            </div>
                            <h3 className="font-bold text-stone-900">{p.name}</h3>
                            <p className="font-mono text-xs text-stone-400">{p.id} · {p.category}</p>
                            <p className="text-xs text-stone-500 mt-1">{p.materials.length} materials · {p.batchWeight}kg · {co2}kg CO₂ · {p.milestones.length} milestones</p>
                          </div>
                          {!p.inspectorDecision && hasPkg && (
                            <button onClick={() => setInspectTarget(p.id)}
                              className="px-5 py-2.5 bg-stone-900 text-white text-sm font-bold rounded-lg hover:bg-stone-700 transition-colors cursor-pointer flex items-center gap-2">
                              <Search className="w-4 h-4" />Review Batch
                            </button>
                          )}
                        </div>
                        {p.inspectorNotes && <p className="mt-3 text-xs text-stone-500 bg-stone-50 p-3 rounded-lg border border-stone-200"><span className="font-bold">Notes:</span> {p.inspectorNotes}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ CONSUMER ══════════════════ */}
        {role === "consumer" && (
          <div>
            <div className="mb-8">
              <h1 className="text-3xl font-black tracking-tight text-stone-900">Scan Any Product</h1>
              <p className="text-stone-500 mt-1">Scan a QR code or browse to see the full transparency score and supply chain story for any product.</p>
            </div>

            {!selectedProduct && (
              <div className="flex gap-2 mb-8">
                <div className="relative flex-1">
                  <ScanLine className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input className="w-full pl-11 pr-4 py-3 border-2 border-stone-300 rounded-xl text-sm font-mono font-medium focus:border-stone-900 focus:outline-none"
                    placeholder="Scan QR or enter Batch ID..."
                    value={scanInput} onChange={e => setScanInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { const f = db.products.find(p => p.id.toLowerCase() === scanInput.trim().toLowerCase()); if (f) { setSelectedProduct(f); } else showToast("Product not found", "error"); } }} />
                </div>
                <button onClick={() => { const f = db.products.find(p => p.id.toLowerCase() === scanInput.trim().toLowerCase()); if (f) setSelectedProduct(f); else showToast("Product not found", "error"); }}
                  className="px-6 py-3 bg-stone-900 text-white font-bold rounded-xl hover:bg-stone-800 transition-colors flex items-center gap-2 cursor-pointer">
                  <Search className="w-4 h-4" />Lookup
                </button>
              </div>
            )}

            {!selectedProduct ? (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {db.products.map(p => {
                  const sc = computeScore(p);
                  const colors = scoreColor(sc.total);
                  const last = p.milestones[p.milestones.length - 1];
                  const co2 = computeTotalCarbon(p);
                  return (
                    <button key={p.id} onClick={() => setSelectedProduct(p)} className="bg-white rounded-xl border-2 border-stone-200 p-5 text-left hover:border-stone-400 hover:shadow-lg transition-all cursor-pointer group">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <span className="text-[10px] font-bold text-stone-400 uppercase">{p.category}</span>
                          <h3 className="font-bold text-stone-900">{p.name}</h3>
                          <p className="font-mono text-xs text-stone-400 mt-0.5">{p.id}</p>
                        </div>
                        <ScoreRing score={sc.total} size={64} />
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        {p.qrUnlocked
                          ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-300"><ShieldCheck className="w-3 h-3" />Verified ✓</span>
                          : <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">Pending Verification</span>}
                        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${STATUS_COLORS[last?.status] || "bg-stone-100"}`}>{last?.status}</span>
                        <span className="text-xs text-stone-400 ml-auto">{co2}kg CO₂</span>
                      </div>
                      <div className={`flex items-center gap-1 mt-3 text-xs font-bold group-hover:gap-2 transition-all ${colors.text}`}>
                        View Full Report <ChevronRight className="w-3 h-3" />
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div>
                <button onClick={() => { setSelectedProduct(null); setScanInput(""); }} className="flex items-center gap-2 text-sm font-bold text-stone-500 hover:text-stone-900 mb-6 cursor-pointer transition-colors">
                  <X className="w-4 h-4" />Back to Products
                </button>

                {/* Score Hero */}
                {(() => {
                  const sc = computeScore(selectedProduct);
                  const colors = scoreColor(sc.total);
                  const co2 = computeTotalCarbon(selectedProduct);
                  const perUnit = selectedProduct.productionQty > 0 ? (co2 / selectedProduct.productionQty).toFixed(3) : null;
                  return (
                    <div className={`${colors.bg} rounded-2xl border-2 p-6 mb-6`} style={{ borderColor: sc.total >= 8 ? "#6ee7b7" : sc.total >= 6 ? "#93c5fd" : sc.total >= 4 ? "#fcd34d" : "#fca5a5" }}>
                      <div className="flex flex-col sm:flex-row items-center gap-6">
                        <ScoreRing score={sc.total} size={140} />
                        <div className="flex-1 text-center sm:text-left">
                          <span className="text-xs font-bold text-stone-400 uppercase">{selectedProduct.category}</span>
                          <h2 className="text-2xl font-black text-stone-900">{selectedProduct.name}</h2>
                          <p className="font-mono text-sm text-stone-400 mt-0.5">Batch: {selectedProduct.id}</p>
                          <div className="flex flex-wrap gap-2 mt-3">
                            {selectedProduct.qrUnlocked
                              ? <span className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold ${colors.bg} ${colors.text} border`} style={{ borderColor: "currentColor" }}><ShieldCheck className="w-4 h-4" />Verified ✓ — {colors.label}</span>
                              : <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold bg-amber-100 text-amber-700 border border-amber-400"><AlertTriangle className="w-4 h-4" />Pending Inspector Verification</span>}
                          </div>
                        </div>
                        {selectedProduct.qrUnlocked && (
                          <div className="flex-shrink-0">
                            <p className="text-xs font-bold text-stone-500 uppercase text-center mb-2">Verified QR Code</p>
                            <QRDisplay batchId={selectedProduct.id} />
                          </div>
                        )}
                      </div>
                      <div className="grid sm:grid-cols-5 gap-3 mt-6">
                        {sc.breakdown.map((b, i) => (
                          <div key={i} className="bg-white/80 rounded-lg p-3">
                            <div className="flex items-center gap-1.5 mb-1"><b.icon className="w-3.5 h-3.5 text-stone-500" /><span className="text-[10px] font-bold text-stone-500 uppercase leading-tight">{b.label}</span></div>
                            <div className="flex items-end gap-1">
                              <span className={`text-xl font-black ${b.score >= b.max * 0.7 ? "text-emerald-600" : b.score >= b.max * 0.4 ? "text-amber-600" : "text-red-600"}`}>{b.score}</span>
                              <span className="text-xs text-stone-400 mb-0.5">/{b.max}</span>
                            </div>
                            <p className="text-[10px] text-stone-400 mt-1 leading-tight">{b.detail}</p>
                            <div className="w-full h-1.5 bg-stone-200 rounded-full mt-2 overflow-hidden"><div className={`h-full rounded-full ${b.score >= b.max * 0.7 ? "bg-emerald-500" : b.score >= b.max * 0.4 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${(b.score / b.max) * 100}%` }} /></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Stats Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  {[
                    ["Raw Materials", selectedProduct.materials.length],
                    ["Batch Weight", `${selectedProduct.batchWeight}kg`],
                    ["Production Qty", selectedProduct.productionQty || "—"],
                    ["Total CO₂", `${computeTotalCarbon(selectedProduct)}kg`],
                  ].map(([lbl, val]) => (
                    <div key={lbl} className="bg-white rounded-xl border-2 border-stone-200 p-4 text-center">
                      <p className="text-2xl font-black text-stone-900">{val}</p>
                      <p className="text-xs text-stone-500 font-bold">{lbl}</p>
                    </div>
                  ))}
                </div>

                {/* Carbon Breakdown */}
                <div className="bg-white rounded-xl border-2 border-stone-200 p-6 mb-6">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2"><Leaf className="w-5 h-5 text-emerald-600" />Carbon Footprint Breakdown</h3>
                  <div className="space-y-3">
                    {[
                      ["Transport Emissions", `${selectedProduct.milestones.reduce((s, m) => s + (m.carbonImpact || 0), 0).toFixed(2)}kg CO₂`, "bg-orange-500"],
                      ["Electricity Usage", selectedProduct.electricityKwh ? `${((selectedProduct.electricityKwh || 0) * 0.233).toFixed(2)}kg CO₂  (${selectedProduct.electricityKwh} kWh × 0.233)` : "Not recorded", "bg-violet-500"],
                      ["Packaging Impact", selectedProduct.packagingType ? `${PACKAGING_CO2[selectedProduct.packagingType] || 0}kg CO₂  (${selectedProduct.packagingType})` : "Not recorded", "bg-amber-500"],
                    ].map(([lbl, val, color]) => (
                      <div key={lbl} className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full flex-shrink-0 ${color}`} />
                        <span className="text-sm font-bold text-stone-700 w-44 flex-shrink-0">{lbl}</span>
                        <span className="text-sm text-stone-500">{val}</span>
                      </div>
                    ))}
                    <div className="pt-3 border-t-2 border-stone-200 flex items-center justify-between">
                      <span className="font-bold text-stone-800">Total Carbon Footprint</span>
                      <span className="text-xl font-black text-stone-800">{computeTotalCarbon(selectedProduct)}kg CO₂</span>
                    </div>
                    {selectedProduct.productionQty > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-stone-500">Per unit ({selectedProduct.productionQty} units)</span>
                        <span className="font-bold text-stone-700">{(computeTotalCarbon(selectedProduct) / selectedProduct.productionQty).toFixed(4)}kg CO₂/unit</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Source Breakdown */}
                <div className="bg-white rounded-xl border-2 border-stone-200 p-6 mb-6">
                  <h3 className="text-lg font-bold mb-5 flex items-center gap-2"><Package className="w-5 h-5 text-blue-600" />Raw Material Origins</h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedProduct.materials.map(m => (
                      <div key={m.id} className="bg-stone-50 rounded-lg border-2 border-stone-100 p-4">
                        <div className="flex items-start justify-between"><SourceBadge source={m.source || "manual"} /><span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">{m.weight}kg</span></div>
                        <h4 className="font-bold text-sm text-stone-900 mt-3">{m.name}</h4>
                        <p className="text-xs text-stone-500 mt-1">{m.supplier}</p>
                        {m.certification && <p className="text-xs text-emerald-600 mt-1 font-medium">✓ {m.certification}</p>}
                        <div className="flex flex-col gap-1 mt-3 text-xs text-stone-400">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(m.purchaseDate)}</span>
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{m.location.lat.toFixed(2)}, {m.location.lng.toFixed(2)}</span>
                          <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{m.proofImage}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Journey Timeline */}
                <div className="bg-white rounded-xl border-2 border-stone-200 p-6">
                  <h3 className="text-lg font-bold mb-5 flex items-center gap-2"><Waypoints className="w-5 h-5 text-purple-600" />Product Journey Timeline</h3>
                  <div className="relative">
                    {selectedProduct.milestones.map((ms, i) => {
                      const isLast = i === selectedProduct.milestones.length - 1;
                      const VIcon = ms.vehicleType ? VEHICLE_ICONS[ms.vehicleType] : null;
                      return (
                        <div key={ms.id} className="flex gap-5 relative">
                          <div className="flex flex-col items-center">
                            <div className={`w-4 h-4 rounded-full border-2 mt-1 flex-shrink-0 ${ms.status === "Approved" ? "bg-emerald-500 border-emerald-500" : isLast ? "bg-stone-900 border-stone-900" : "bg-white border-stone-300"}`} />
                            {!isLast && <div className="w-0.5 flex-1 bg-stone-200 my-1" />}
                          </div>
                          <div className={`flex-1 ${isLast ? "pb-0" : "pb-5"}`}>
                            <div className="bg-stone-50 rounded-lg border border-stone-200 p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-md border ${STATUS_COLORS[ms.status] || "bg-stone-100"}`}>{ms.status}</span>
                                <SourceBadge source={ms.source || "manual"} />
                                <span className="text-xs text-stone-400">{formatDate(ms.timestamp)}</span>
                              </div>
                              <p className="text-sm font-medium text-stone-700 mt-2">Handled by: <span className="font-bold">{ms.handlerRole}</span></p>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-stone-400">
                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{ms.location.lat.toFixed(4)}, {ms.location.lng.toFixed(4)}</span>
                                {VIcon && <span className="flex items-center gap-1 text-blue-600 font-bold"><VIcon className="w-3 h-3" />{ms.vehicleType}</span>}
                                {ms.carbonImpact > 0 && <span className="flex items-center gap-1 text-orange-600 font-bold">+{ms.carbonImpact}kg CO₂</span>}
                              </div>
                              {ms.notes && <p className="text-xs text-stone-500 mt-2 italic">{ms.notes}</p>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-6 p-4 bg-gradient-to-r from-stone-100 to-stone-50 rounded-xl border-2 border-stone-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-stone-200 rounded-full flex items-center justify-center"><BarChart3 className="w-5 h-5 text-stone-600" /></div>
                      <div>
                        <p className="text-sm font-bold text-stone-800">Total Carbon Footprint</p>
                        <p className="text-xs text-stone-500">Transport + Electricity + Packaging</p>
                      </div>
                    </div>
                    <p className="text-3xl font-black text-stone-700">{computeTotalCarbon(selectedProduct)}<span className="text-sm font-bold ml-1">kg CO₂</span></p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      <footer className="mt-auto border-t-2 border-stone-200 py-6 text-center text-xs text-stone-400">
        <p className="font-bold">VeriRoot — Universal Product Transparency Platform</p>
        <p className="mt-1">Factory Manager · Transport Driver · External Inspector · Consumer — all roles, one truth.</p>
      </footer>
    </div>
  );
}
