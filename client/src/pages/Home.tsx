import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Download, RotateCcw } from 'lucide-react';
import { parseCSV, matchAndClassify, calculateSummary, MatchedRecord, SummaryResult } from '@/lib/csvParser';
import { toast } from 'sonner';

export default function Home() {
  const [aoikumoFile, setAoikumoFile] = useState<File | null>(null);
  const [sequoiaFile, setSequoiaFile] = useState<File | null>(null);
  const [matched, setMatched] = useState<MatchedRecord[]>([]);
  const [summary, setSummary] = useState<SummaryResult | null>(null);
  const [excludeMap, setExcludeMap] = useState<Map<string, boolean>>(new Map());
  const [settleMap, setSettleMap] = useState<Map<string, boolean>>(new Map());
  const [settlePctMap, setSettlePctMap] = useState<Map<string, number>>(new Map());
  const aoikumoRef = useRef<HTMLInputElement>(null);
  const sequoiaRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File, type: 'aoikumo' | 'sequoia') => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file');
      return;
    }

    if (type === 'aoikumo') {
      setAoikumoFile(file);
    } else {
      setSequoiaFile(file);
    }
  };

  const handleProcess = async () => {
    if (!aoikumoFile || !sequoiaFile) {
      toast.error('Please upload both Aoikumo and Sequoia CSV files');
      return;
    }

    try {
      const aoikumoText = await aoikumoFile.text();
      const sequoiaText = await sequoiaFile.text();

      const aoikumoRecords = parseCSV(aoikumoText).map((r: any) => ({
        customer_ref: r.customer_ref || r['Customer Ref'] || '',
        item: r.item || r['Item'] || '',
        owing: Number(r.owing || r['Owing'] || 0),
        unearned: Number(r.unearned || r['Unearned'] || 0),
      }));

      const sequoiaRecords = parseCSV(sequoiaText).map((r: any) => ({
        customer_ref: r.customer_ref || r['Customer Ref'] || '',
        item: r.item || r['Item'] || '',
        balance: Number(r.balance || r['Balance'] || 0),
        unearned: Number(r.unearned || r['Unearned'] || 0),
      }));

      const matchedData = matchAndClassify(aoikumoRecords, sequoiaRecords);
      setMatched(matchedData);

      const newExcludeMap = new Map<string, boolean>();
      const newSettleMap = new Map<string, boolean>();
      const newSettlePctMap = new Map<string, number>();

      matchedData.forEach(record => {
        const key = `${record.customer_ref}|${record.item}`;
        newExcludeMap.set(key, record.exclude_default);
      });

      setExcludeMap(newExcludeMap);
      setSettleMap(newSettleMap);
      setSettlePctMap(newSettlePctMap);

      const result = calculateSummary(matchedData, newExcludeMap, newSettleMap, newSettlePctMap);
      setSummary(result);

      toast.success(`Processed ${matchedData.length} records`);
    } catch (error) {
      toast.error('Error processing files: ' + (error as Error).message);
    }
  };

  const handleToggleExclude = (key: string) => {
    const newMap = new Map(excludeMap);
    newMap.set(key, !newMap.get(key));
    setExcludeMap(newMap);

    const result = calculateSummary(matched, newMap, settleMap, settlePctMap);
    setSummary(result);
  };

  const handleToggleSettle = (key: string) => {
    const newMap = new Map(settleMap);
    newMap.set(key, !newMap.get(key));
    setSettleMap(newMap);

    const result = calculateSummary(matched, excludeMap, newMap, settlePctMap);
    setSummary(result);
  };

  const handleReset = () => {
    setAoikumoFile(null);
    setSequoiaFile(null);
    setMatched([]);
    setSummary(null);
    setExcludeMap(new Map());
    setSettleMap(new Map());
    setSettlePctMap(new Map());
    if (aoikumoRef.current) aoikumoRef.current.value = '';
    if (sequoiaRef.current) sequoiaRef.current.value = '';
  };

  const handleExportCSV = () => {
    if (!matched || !summary) return;

    const headers = ['Customer Ref', 'Item', 'Aoikumo Owing', 'Status', 'Exclude?', 'Settle?'];
    const rows = matched.map(r => {
      const key = `${r.customer_ref}|${r.item}`;
      return [
        r.customer_ref,
        r.item,
        r.aoikumo_owing,
        r.status,
        excludeMap.get(key) ? 'Yes' : 'No',
        settleMap.get(key) ? 'Yes' : 'No',
      ];
    });

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'unearned_calculation.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Unearned Auto Calculator</h1>
        <p className="text-gray-600 mb-6">Upload Aoikumo and Sequoia CSV files to calculate unearned exposure and settlement amounts.</p>

        {/* Upload Section */}
        <Card className="p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2">Aoikumo CSV</label>
              <Input
                ref={aoikumoRef}
                type="file"
                accept=".csv"
                onChange={(e) => e.target.files && handleFileSelect(e.target.files[0], 'aoikumo')}
                className="cursor-pointer"
              />
              {aoikumoFile && <p className="text-sm text-green-600 mt-1">✓ {aoikumoFile.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Sequoia CSV</label>
              <Input
                ref={sequoiaRef}
                type="file"
                accept=".csv"
                onChange={(e) => e.target.files && handleFileSelect(e.target.files[0], 'sequoia')}
                className="cursor-pointer"
              />
              {sequoiaFile && <p className="text-sm text-green-600 mt-1">✓ {sequoiaFile.name}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleProcess} className="flex items-center gap-2">
              <Upload size={16} /> Process Files
            </Button>
            <Button onClick={handleReset} variant="outline" className="flex items-center gap-2">
              <RotateCcw size={16} /> Reset
            </Button>
          </div>
        </Card>

        {/* Summary Section */}
        {summary && (
          <>
            <Card className="p-6 mb-6 bg-blue-50">
              <h2 className="text-lg font-semibold mb-4">Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <p className="text-xs text-gray-600">Total Records</p>
                  <p className="text-xl font-bold">{summary.total_records}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Current Exposure</p>
                  <p className="text-xl font-bold">SGD {summary.total_exposure.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Excluded</p>
                  <p className="text-xl font-bold text-red-600">SGD {summary.excluded_amount.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">After Exclusion</p>
                  <p className="text-xl font-bold">SGD {summary.after_exclusion.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Final Remaining</p>
                  <p className="text-xl font-bold text-green-600">SGD {summary.final_remaining.toFixed(2)}</p>
                </div>
              </div>
            </Card>

            {/* Status Breakdown */}
            <Card className="p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Status Breakdown</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(summary.by_status).map(([status, data]) => (
                  <div key={status} className="border rounded p-3">
                    <p className="text-xs font-medium text-gray-600">Status {status}</p>
                    <p className="text-lg font-bold">{data.count}</p>
                    <p className="text-sm text-gray-600">SGD {data.amount.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            </Card>

            {/* Details Table */}
            <Card className="p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Details</h2>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer Ref</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Aoikumo Owing</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Exclude</TableHead>
                      <TableHead>Settle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matched.map((record, idx) => {
                      const key = `${record.customer_ref}|${record.item}`;
                      const isExcluded = excludeMap.get(key);
                      const isSettled = settleMap.get(key);
                      return (
                        <TableRow key={idx}>
                          <TableCell className="text-sm">{record.customer_ref}</TableCell>
                          <TableCell className="text-sm">{record.item}</TableCell>
                          <TableCell className="text-sm">SGD {record.aoikumo_owing.toFixed(2)}</TableCell>
                          <TableCell className="text-sm">{record.status}</TableCell>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={isExcluded ?? false}
                              onChange={() => handleToggleExclude(key)}
                              className="cursor-pointer"
                            />
                          </TableCell>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={isSettled ?? false}
                              onChange={() => handleToggleSettle(key)}
                              className="cursor-pointer"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Export Button */}
            <div className="flex gap-2">
              <Button onClick={handleExportCSV} className="flex items-center gap-2">
                <Download size={16} /> Export CSV
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
