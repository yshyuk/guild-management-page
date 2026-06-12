import { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { displayDate } from '@/lib/dates';
import type { Member, Warning } from '@/lib/types';

type Props = {
  members: Member[];
  warnings: Warning[];
  today: string;
  onAdd: (memberId: number, date: string, reason: string) => void;
  onDelete: (id: number) => void;
};

export default function WarningManager({ members, warnings, today, onAdd, onDelete }: Props) {
  const [memberId, setMemberId] = useState<string>('');
  const [date, setDate] = useState<string>(today);
  const [reason, setReason] = useState<string>('');

  const submit = () => {
    const id = Number(memberId);
    if (Number.isNaN(id) || !date) return;
    onAdd(id, date, reason.trim());
    setReason('');
  };

  return (
    <Card className="rounded-[28px] border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <AlertTriangle className="h-5 w-5 text-amber-500" />경고 입력
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end">
          <div className="space-y-2">
            <label className="text-sm font-medium">길드원</label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger className="w-full rounded-2xl">
                <SelectValue placeholder="길드원 선택" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">경고 날짜</label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-2xl"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">경고 사유</label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="사유 입력"
              className="rounded-2xl"
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </div>
          <Button className="rounded-2xl" onClick={submit} disabled={!memberId || !date}>
            경고 추가
          </Button>
        </div>

        <div className="max-h-[420px] space-y-2 overflow-auto">
          {warnings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500">
              등록된 경고가 없습니다.
            </div>
          ) : (
            warnings.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-800">{w.memberName}</span>
                    <span className="text-xs text-zinc-500">{displayDate(w.date)}</span>
                  </div>
                  {w.reason && <div className="mt-0.5 truncate text-sm text-zinc-600">{w.reason}</div>}
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  className="rounded-2xl"
                  onClick={() => onDelete(w.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
