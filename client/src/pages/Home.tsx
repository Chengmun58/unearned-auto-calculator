import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Upload,
  Download,
  RotateCcw,
  History,
  Trash2,
  ChevronRight,
  FileText,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  A: "bg-red-100 text-red-700 border-red-200",
  B: "bg-yellow-100 text-yellow-700 border-yellow-200",
  C: "bg-orange-100 text-orange-700 border-orange-200",
  D: "bg-gray-100 text-gray-600 border-gray-200",
};

function fmt(n: number) {
  return `SGD ${n.toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function KPICard({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className={`rounded-lg border p-4 ${highlight || "bg-white"}`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

export default function Home() {
  const [aoikumoFile, setAoikumoFile] = useState<File | null>(null);
  const [sequoiaFile, setSequoiaFile] = useState<File | null>(null);
  const [sessionName, setSessionName] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [tab, setTab] = useState("upload");
  const aoikumoRef = useRef<HTMLInputElement>(null);
  const sequoiaRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();

  // Queries
  const sessionsQuery = trpc.unearned.listSessions.useQuery();
  const sessionQuery = trpc.unearned.getSession.useQuery(
    { sessionId: activeSessionId! },
    { enabled: activeSessionId !== null }
  );

  // Mutations
  const processFiles = trpc.unearned.processFiles.useMutation({
    onSuccess: (data) => {
      toast.success(`Processed ${data.totalRecords} records — saved to database`);
      utils.unearned.listSessions.invalidate();
      setActiveSessionId(data.sessionId);
      setTab("results");
    },
    onError: (e) => toast.error("Error: " + e.message),
  });

  const updateRow = trpc.unearned.updateRow.useMutation({
    onSuccess: () => {
      utils.unearned.getSession.invalidate({ sessionId: activeSessionId! });
    },
    onError: (e) => toast.error("Update failed: " + e.message),
  });

  const deleteSession = trpc.unearned.deleteSession.useMutation({
    onSuccess: () => {
      toast.success("Session deleted");
      utils.unearned.listSessions.invalidate();
      if (activeSessionId) {
        setActiveSessionId(null);
        setTab("upload");
      }
    },
    onError: (e) => toast.error("Delete failed: " + e.message),
  });

  const handleProcess = async () => {
    if (!aoikumoFile || !sequoiaFile) {
      toast.error("Please upload both Aoikumo and Sequoia CSV files");
      return;
    }
    const name = sessionName.trim() || `Session ${new Date().toLocaleDateString("en-SG")}`;
    const [aoikumoCsv, sequoiaCsv] = await Promise.all([
      aoikumoFile.text(),
      sequoiaFile.text(),
    ]);
    processFiles.mutate({
      sessionName: name,
      aoikumoFileName: aoikumoFile.name,
      sequoiaFileName: sequoiaFile.name,
      aoikumoCsv,
      sequoiaCsv,
    });
  };

  const handleReset = () => {
    setAoikumoFile(null);
    setSequoiaFile(null);
    setSessionName("");
    if (aoikumoRef.current) aoikumoRef.current.value = "";
    if (sequoiaRef.current) sequoiaRef.current.value = "";
  };

  const handleExportCSV = () => {
    if (!sessionQuery.data) return;
    const { rows } = sessionQuery.data;
    const headers = [
      "Customer Ref", "Item", "Aoikumo Owing", "Aoikumo Unearned",
      "Sequoia Balance", "Sequoia Unearned", "Status", "Status Reason",
      "Exclude", "Settle", "Settle %",
    ];
    const csvRows = rows.map((r) => [
      r.customerRef, r.item,
      r.aoikumoOwing, r.aoikumoUnearned,
      r.sequoiaBalance, r.sequoiaUnearned,
      r.status, r.statusReason ?? "",
      r.excludeFlag, r.settleFlag, r.settlePct,
    ]);
    const csv = [headers, ...csvRows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `unearned_${sessionQuery.data.session.sessionName.replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const session = sessionQuery.data?.session;
  const rows = sessionQuery.data?.rows ?? [];
  const statusBreakdown = (session?.statusBreakdown as Record<string, { count: number; amount: number }>) ?? {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Unearned Auto Calculator</h1>
        <p className="text-sm text-gray-500">Upload CSV files → auto-classify → track exclusions & settlements</p>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Upload size={14} /> Upload
            </TabsTrigger>
            <TabsTrigger value="results" disabled={!activeSessionId} className="flex items-center gap-2">
              <FileText size={14} /> Results
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History size={14} /> History
              {sessionsQuery.data && sessionsQuery.data.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{sessionsQuery.data.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Upload Tab ── */}
          <TabsContent value="upload">
            <Card className="max-w-2xl">
              <CardHeader>
                <CardTitle className="text-base">Upload Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Session Name (optional)</label>
                  <Input
                    placeholder={`Session ${new Date().toLocaleDateString("en-SG")}`}
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Aoikumo CSV</label>
                    <Input
                      ref={aoikumoRef}
                      type="file"
                      accept=".csv"
                      onChange={(e) => e.target.files && setAoikumoFile(e.target.files[0])}
                    />
                    {aoikumoFile && (
                      <p className="text-xs text-green-600 mt-1">✓ {aoikumoFile.name}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Sequoia CSV</label>
                    <Input
                      ref={sequoiaRef}
                      type="file"
                      accept=".csv"
                      onChange={(e) => e.target.files && setSequoiaFile(e.target.files[0])}
                    />
                    {sequoiaFile && (
                      <p className="text-xs text-green-600 mt-1">✓ {sequoiaFile.name}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleProcess}
                    disabled={processFiles.isPending || !aoikumoFile || !sequoiaFile}
                    className="flex items-center gap-2"
                  >
                    <Upload size={14} />
                    {processFiles.isPending ? "Processing…" : "Process & Save"}
                  </Button>
                  <Button variant="outline" onClick={handleReset} className="flex items-center gap-2">
                    <RotateCcw size={14} /> Reset
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Results Tab ── */}
          <TabsContent value="results">
            {session && (
              <>
                {/* KPI Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                  <KPICard label="Total Records" value={String(session.totalRecords)} />
                  <KPICard label="Total Exposure" value={fmt(session.totalExposure)} />
                  <KPICard label="Excluded" value={fmt(session.excludedAmount)} highlight="bg-red-50 border-red-200" />
                  <KPICard label="After Exclusion" value={fmt(session.afterExclusion)} highlight="bg-blue-50 border-blue-200" />
                  <KPICard label="Final Remaining" value={fmt(session.finalRemaining)} highlight="bg-green-50 border-green-200" />
                </div>

                {/* Status Breakdown */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {Object.entries(statusBreakdown).sort().map(([s, d]) => (
                    <div key={s} className={`rounded-lg border p-3 ${STATUS_COLORS[s] || ""}`}>
                      <p className="text-xs font-semibold">Status {s}</p>
                      <p className="text-base font-bold">{d.count} records</p>
                      <p className="text-xs">{fmt(d.amount)}</p>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mb-4">
                  <Button variant="outline" size="sm" onClick={handleExportCSV} className="flex items-center gap-2">
                    <Download size={14} /> Export CSV
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2 text-red-600 hover:text-red-700"
                    onClick={() => deleteSession.mutate({ sessionId: session.id })}
                    disabled={deleteSession.isPending}
                  >
                    <Trash2 size={14} /> Delete Session
                  </Button>
                </div>

                {/* Detail Table */}
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="text-xs">Customer Ref</TableHead>
                            <TableHead className="text-xs">Item</TableHead>
                            <TableHead className="text-xs text-right">Owing</TableHead>
                            <TableHead className="text-xs">Status</TableHead>
                            <TableHead className="text-xs">Reason</TableHead>
                            <TableHead className="text-xs text-center">Exclude</TableHead>
                            <TableHead className="text-xs text-center">Settle</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r) => (
                            <TableRow key={r.id} className={r.excludeFlag === "Y" ? "opacity-50" : ""}>
                              <TableCell className="text-xs font-mono">{r.customerRef}</TableCell>
                              <TableCell className="text-xs">{r.item}</TableCell>
                              <TableCell className="text-xs text-right font-mono">
                                {fmt(r.aoikumoOwing)}
                              </TableCell>
                              <TableCell>
                                <span className={`text-xs px-2 py-0.5 rounded border font-semibold ${STATUS_COLORS[r.status] || ""}`}>
                                  {r.status}
                                </span>
                              </TableCell>
                              <TableCell className="text-xs text-gray-500 max-w-[200px] truncate">
                                {r.statusReason}
                              </TableCell>
                              <TableCell className="text-center">
                                <input
                                  type="checkbox"
                                  checked={r.excludeFlag === "Y"}
                                  onChange={() =>
                                    updateRow.mutate({
                                      rowId: r.id,
                                      sessionId: session.id,
                                      excludeFlag: r.excludeFlag === "Y" ? "N" : "Y",
                                    })
                                  }
                                  className="cursor-pointer w-4 h-4 accent-red-500"
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={r.settleFlag === "Y"}
                                    disabled={r.excludeFlag === "Y"}
                                    onChange={() =>
                                      updateRow.mutate({
                                        rowId: r.id,
                                        sessionId: session.id,
                                        settleFlag: r.settleFlag === "Y" ? "N" : "Y",
                                        settlePct: r.settleFlag === "Y" ? 0 : 100,
                                      })
                                    }
                                    className="cursor-pointer w-4 h-4 accent-green-500 disabled:opacity-30"
                                  />
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="range"
                                      min={0}
                                      max={100}
                                      step={5}
                                      value={r.settlePct}
                                      disabled={r.excludeFlag === "Y" || r.settleFlag !== "Y"}
                                      onChange={(e) =>
                                        updateRow.mutate({
                                          rowId: r.id,
                                          sessionId: session.id,
                                          settlePct: Number(e.target.value),
                                        })
                                      }
                                      className="w-24 cursor-pointer disabled:opacity-30"
                                    />
                                    <span className="text-xs font-semibold text-green-700 w-10 text-right">
                                      {r.settlePct}%
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
            {!session && activeSessionId && (
              <p className="text-gray-500 text-sm">Loading session…</p>
            )}
          </TabsContent>

          {/* ── History Tab ── */}
          <TabsContent value="history">
            {sessionsQuery.isLoading && <p className="text-sm text-gray-500">Loading…</p>}
            {!sessionsQuery.isLoading && (!sessionsQuery.data || sessionsQuery.data.length === 0) && (
              <p className="text-sm text-gray-500">No sessions yet. Upload files to get started.</p>
            )}
            <div className="space-y-2">
              {sessionsQuery.data?.map((s) => (
                <Card
                  key={s.id}
                  className="cursor-pointer hover:border-blue-300 transition-colors"
                  onClick={() => {
                    setActiveSessionId(s.id);
                    setTab("results");
                  }}
                >
                  <CardContent className="py-3 px-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{s.sessionName}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(s.createdAt).toLocaleString("en-SG")} · {s.totalRecords} records
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        Exposure: {fmt(s.totalExposure)} → Remaining: {fmt(s.finalRemaining)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession.mutate({ sessionId: s.id });
                        }}
                      >
                        <Trash2 size={13} />
                      </Button>
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
