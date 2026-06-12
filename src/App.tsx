import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar,
  ClipboardList,
  Settings,
  Trophy,
  BarChart3,
  Search,
  CheckSquare2,
  Square,
  Trash2,
  Wand2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DayCell, PeriodCalendar } from '@/components/calendar';
import ScoreTab from '@/components/ScoreTab';
import StatsTab from '@/components/StatsTab';
import WarningPanel from '@/components/WarningPanel';
import WarningManager from '@/components/WarningManager';
import {
  weekLabels,
  buildRangeGrid,
  formatDate,
  displayDate,
  getMonthRange,
  getActiveOrPreviousGuildWarPeriod,
  getNextGuildWarPeriod,
  getNextRaidSunday,
  isWithin,
  shiftCustomRange,
  shiftMonth,
  sortByDate,
} from '@/lib/dates';
import type {
  ContentType,
  DashboardRangeSettings,
  GuildWarPeriod,
  Member,
  MemberStat,
  MissLog,
  RaidDeadline,
  Warning,
} from '@/lib/types';

type TabValue = 'dashboard' | 'input' | 'score' | 'stats' | 'manage';

const contentOptions: ContentType[] = ['길드전', '공성전', '강림원정대'];

export default function App() {
  const today = formatDate(new Date());
  const [tab, setTab] = useState<TabValue>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [logs, setLogs] = useState<MissLog[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [isMonthMode, setIsMonthMode] = useState<boolean>(false);
  const [monthBaseDate, setMonthBaseDate] = useState<string>(today);
  const initialRange = getMonthRange(today);
  const [rangeStart, setRangeStart] = useState<string>(initialRange.start);
  const [rangeEnd, setRangeEnd] = useState<string>(initialRange.end);
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [selectedContent, setSelectedContent] = useState<ContentType>('길드전');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [newMember, setNewMember] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [guildWarPeriods, setGuildWarPeriods] = useState<GuildWarPeriod[]>([]);
  const [raidDeadlines, setRaidDeadlines] = useState<RaidDeadline[]>([]);
  const [guildWarDraftStart, setGuildWarDraftStart] = useState<string>(today);
  const [guildWarDraftEnd, setGuildWarDraftEnd] = useState<string>(today);
  const [editingGuildWarId, setEditingGuildWarId] = useState<number | null>(null);
  const [raidDraftDate, setRaidDraftDate] = useState<string>(today);
  const [editingRaidId, setEditingRaidId] = useState<number | null>(null);
  const [guildWarCalendarBase, setGuildWarCalendarBase] = useState<string>(today);
  const [raidCalendarBase, setRaidCalendarBase] = useState<string>(today);
  const [showInactiveMembers, setShowInactiveMembers] = useState<boolean>(false);
  const [editingMemberId, setEditingMemberId] = useState<number | null>(null);
  const [editingMemberName, setEditingMemberName] = useState<string>('');
  const [hasLoadedSavedRange, setHasLoadedSavedRange] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/members', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: Member[]) => setMembers(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch('/api/warnings', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: Warning[]) => setWarnings(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const loadDashboardRange = async () => {
      try {
        const res = await fetch('/api/dashboard-range', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load dashboard range setting');
        const saved = (await res.json()) as DashboardRangeSettings | null;
        if (saved) {
          setIsMonthMode(saved.isMonthMode);
          setMonthBaseDate(saved.monthBaseDate);
          setRangeStart(saved.start);
          setRangeEnd(saved.end);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setHasLoadedSavedRange(true);
      }
    };
    void loadDashboardRange();
  }, []);

  useEffect(() => {
    if (!hasLoadedSavedRange) return;
    const saveDashboardRange = async () => {
      try {
        const res = await fetch('/api/dashboard-range', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start: rangeStart,
            end: rangeEnd,
            isMonthMode,
            monthBaseDate,
          } satisfies DashboardRangeSettings),
        });
        if (!res.ok) throw new Error('Failed to save dashboard range setting');
      } catch (error) {
        console.error(error);
      }
    };
    void saveDashboardRange();
  }, [hasLoadedSavedRange, isMonthMode, monthBaseDate, rangeStart, rangeEnd]);

  useEffect(() => {
    fetch('/api/guild-war-periods', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: GuildWarPeriod[]) => setGuildWarPeriods(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch('/api/raid-deadlines', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: RaidDeadline[]) => setRaidDeadlines(data))
      .catch(console.error);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ start: rangeStart, end: rangeEnd });
    fetch(`/api/miss-logs?${params.toString()}`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: MissLog[]) => setLogs(data))
      .catch(console.error);
  }, [rangeStart, rangeEnd]);

  const memberNameIdMap = useMemo<Map<string, number>>(
    () => new Map(members.map((member) => [member.name, member.id])),
    [members],
  );

  const sortedMembers = useMemo<Member[]>(
    () => [...members].sort((a, b) => a.name.localeCompare(b.name, 'ko')),
    [members],
  );

  const activeMembers = useMemo<Member[]>(() => sortedMembers.filter((m) => m.active), [sortedMembers]);
  const inactiveMembers = useMemo<Member[]>(() => sortedMembers.filter((m) => !m.active), [sortedMembers]);
  const filteredMembers = useMemo<Member[]>(
    () => activeMembers.filter((m) => m.name.includes(search)),
    [activeMembers, search],
  );
  const displayedManageMembers = useMemo<Member[]>(() => {
    const target = showInactiveMembers ? inactiveMembers : activeMembers;
    return target.filter((member) => member.name.includes(search));
  }, [showInactiveMembers, inactiveMembers, activeMembers, search]);

  const guildWarCalendarRange = useMemo(() => getMonthRange(guildWarCalendarBase), [guildWarCalendarBase]);
  const raidCalendarRange = useMemo(() => getMonthRange(raidCalendarBase), [raidCalendarBase]);

  const buildRangeGridDays = useMemo(
    () => buildRangeGrid(rangeStart, rangeEnd),
    [rangeStart, rangeEnd],
  );

  const memberStats = useMemo<MemberStat[]>(() => {
    return activeMembers
      .map((member) => {
        const guildWar = logs.filter(
          (log) =>
            log.content === '길드전' &&
            log.members.includes(member.name) &&
            isWithin(log.date, rangeStart, rangeEnd),
        ).length;
        const siege = logs.filter(
          (log) =>
            log.content === '공성전' &&
            log.members.includes(member.name) &&
            isWithin(log.date, rangeStart, rangeEnd),
        ).length;
        const raid = logs.filter(
          (log) =>
            log.content === '강림원정대' &&
            log.members.includes(member.name) &&
            isWithin(log.date, rangeStart, rangeEnd),
        ).length;
        return { name: member.name, guildWar, siege, raid, total: guildWar + siege + raid };
      })
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'ko'));
  }, [activeMembers, logs, rangeStart, rangeEnd]);

  useEffect(() => {
    const matchedLog = logs.find((log) => log.date === selectedDate && log.content === selectedContent);
    if (matchedLog) {
      setSelectedLogId((prev) => (prev === matchedLog.id ? prev : matchedLog.id));
      setSelectedMembers((prev) => {
        const isSameLength = prev.length === matchedLog.members.length;
        const isSameMembers = isSameLength && prev.every((m, i) => m === matchedLog.members[i]);
        return isSameMembers ? prev : matchedLog.members;
      });
      return;
    }
    setSelectedLogId(null);
    setSelectedMembers([]);
  }, [logs, selectedDate, selectedContent]);

  // ── 경고 ──────────────────────────────────────────────
  const sortWarnings = (list: Warning[]): Warning[] =>
    [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const addWarning = async (memberId: number, date: string, reason: string) => {
    try {
      const res = await fetch('/api/warnings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, date, reason }),
      });
      if (!res.ok) throw new Error('Failed to create warning');
      const created = (await res.json()) as Warning;
      setWarnings((prev) => sortWarnings([...prev, created]));
    } catch (error) {
      console.error(error);
    }
  };

  const deleteWarning = async (id: number) => {
    try {
      const res = await fetch(`/api/warnings/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete warning');
      setWarnings((prev) => prev.filter((w) => w.id !== id));
    } catch (error) {
      console.error(error);
    }
  };

  // ── 길드원 ────────────────────────────────────────────
  const addMember = async () => {
    if (!newMember.trim()) return;
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newMember.trim() }),
      });
      if (!res.ok) throw new Error('Failed to create member');
      const created = (await res.json()) as Member;
      setMembers((prev) => [...prev, created]);
      setNewMember('');
    } catch (error) {
      console.error(error);
    }
  };

  const updateMemberActive = async (memberId: number, active: boolean) => {
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error('Failed to update member');
      const updated = (await res.json()) as Member;
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    } catch (error) {
      console.error(error);
    }
  };

  const startEditMember = (member: Member) => {
    setEditingMemberId(member.id);
    setEditingMemberName(member.name);
  };

  const cancelEditMember = () => {
    setEditingMemberId(null);
    setEditingMemberName('');
  };

  const updateMemberName = async (memberId: number) => {
    if (!editingMemberName.trim()) return;
    const previousName = members.find((m) => m.id === memberId)?.name;
    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingMemberName.trim() }),
      });
      if (!res.ok) throw new Error('Failed to rename member');
      const updated = (await res.json()) as Member;
      setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      if (previousName && previousName !== updated.name) {
        setLogs((prev) =>
          prev.map((log) => ({
            ...log,
            members: log.members.map((n) => (n === previousName ? updated.name : n)),
          })),
        );
        setSelectedMembers((prev) => prev.map((n) => (n === previousName ? updated.name : n)));
        setWarnings((prev) =>
          prev.map((w) => (w.memberName === previousName ? { ...w, memberName: updated.name } : w)),
        );
      }
      cancelEditMember();
    } catch (error) {
      console.error(error);
    }
  };

  const deleteMember = async (memberId: number, memberName: string) => {
    if (!window.confirm(`${memberName} 길드원을 DB에서 완전히 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/members/${memberId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete member');
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setWarnings((prev) => prev.filter((w) => w.memberId !== memberId));
      if (editingMemberId === memberId) cancelEditMember();
    } catch (error) {
      console.error(error);
    }
  };

  const copyMembersForExcel = async () => {
    const rows = displayedManageMembers.map((m) => m.name).join('\n');
    if (!rows) return;
    try {
      await navigator.clipboard.writeText(rows);
      window.alert(`${showInactiveMembers ? '탈퇴' : '활성'} 길드원 목록이 클립보드에 복사되었습니다.`);
    } catch (error) {
      console.error(error);
      window.alert('클립보드 복사에 실패했습니다.');
    }
  };

  const switchTabWithScrollTop = (nextTab: TabValue) => {
    setTab(nextTab);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    });
  };

  const loadNewEntry = (dateStr: string) => {
    setSelectedLogId(null);
    setSelectedDate(dateStr);
    setSelectedContent('길드전');
    setSelectedMembers([]);
    switchTabWithScrollTop('input');
  };

  const loadExistingEntry = (log: MissLog) => {
    setSelectedLogId(log.id);
    setSelectedDate(log.date);
    setSelectedContent(log.content);
    setSelectedMembers(log.members);
    switchTabWithScrollTop('input');
  };

  const toggleMember = (name: string) => {
    setSelectedMembers((prev) => (prev.includes(name) ? prev.filter((v) => v !== name) : [...prev, name]));
  };

  const deleteSelectedEntry = async () => {
    if (!selectedLogId) return;
    try {
      const res = await fetch(`/api/miss-logs/${selectedLogId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete miss log');
      setLogs((prev) => prev.filter((log) => log.id !== selectedLogId));
      setSelectedLogId(null);
      setSelectedMembers([]);
    } catch (error) {
      console.error(error);
    }
  };

  const saveEntry = async () => {
    const memberIds = selectedMembers
      .map((name) => memberNameIdMap.get(name))
      .filter((id): id is number => typeof id === 'number');
    try {
      if (selectedLogId && selectedMembers.length === 0) {
        const res = await fetch(`/api/miss-logs/${selectedLogId}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete miss log');
        setLogs((prev) => prev.filter((log) => log.id !== selectedLogId));
        setSelectedLogId(null);
        return;
      }
      if (selectedLogId) {
        const res = await fetch(`/api/miss-logs/${selectedLogId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: selectedDate, content: selectedContent, memberIds }),
        });
        if (!res.ok) throw new Error('Failed to update miss log');
        const updated = (await res.json()) as MissLog;
        setLogs((prev) => prev.map((log) => (log.id === updated.id ? updated : log)));
        return;
      }
      if (selectedMembers.length === 0) return;
      const duplicate = logs.find((log) => log.date === selectedDate && log.content === selectedContent);
      if (duplicate) {
        const res = await fetch(`/api/miss-logs/${duplicate.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: selectedDate, content: selectedContent, memberIds }),
        });
        if (!res.ok) throw new Error('Failed to update duplicate miss log');
        const updated = (await res.json()) as MissLog;
        setSelectedLogId(updated.id);
        setLogs((prev) => prev.map((log) => (log.id === updated.id ? updated : log)));
        return;
      }
      const res = await fetch('/api/miss-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, content: selectedContent, memberIds }),
      });
      if (!res.ok) throw new Error('Failed to create miss log');
      const created = (await res.json()) as MissLog;
      if (isWithin(created.date, rangeStart, rangeEnd)) {
        setLogs((prev) => [...prev, created].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id));
      }
      setSelectedLogId(created.id);
    } catch (error) {
      console.error(error);
    }
  };

  const shiftDisplayedRange = (direction: number) => {
    if (isMonthMode) {
      const movedBase = shiftMonth(monthBaseDate, direction);
      setMonthBaseDate(movedBase);
      const nextRange = getMonthRange(movedBase);
      setRangeStart(nextRange.start);
      setRangeEnd(nextRange.end);
      return;
    }
    const moved = shiftCustomRange(rangeStart, rangeEnd, direction);
    setRangeStart(moved.start);
    setRangeEnd(moved.end);
  };

  const toggleMonthMode = () => {
    const next = !isMonthMode;
    setIsMonthMode(next);
    if (next) {
      const monthRange = getMonthRange(monthBaseDate);
      setRangeStart(monthRange.start);
      setRangeEnd(monthRange.end);
    }
  };

  const selectGuildWarRangeFromToday = () => {
    const target = getActiveOrPreviousGuildWarPeriod(guildWarPeriods, today);
    if (!target) return;
    setIsMonthMode(false);
    setRangeStart(target.start);
    setRangeEnd(target.end);
  };

  const saveGuildWarPeriod = async () => {
    if (!guildWarDraftStart || !guildWarDraftEnd) return;
    try {
      if (editingGuildWarId) {
        const res = await fetch(`/api/guild-war-periods/${editingGuildWarId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start: guildWarDraftStart, end: guildWarDraftEnd }),
        });
        if (!res.ok) throw new Error('Failed to update guild war period');
        const updated = (await res.json()) as GuildWarPeriod;
        setGuildWarPeriods((prev) =>
          sortByDate(prev.map((i) => (i.id === updated.id ? updated : i)), 'start'),
        );
      } else {
        const res = await fetch('/api/guild-war-periods', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ start: guildWarDraftStart, end: guildWarDraftEnd }),
        });
        if (!res.ok) throw new Error('Failed to create guild war period');
        const created = (await res.json()) as GuildWarPeriod;
        setGuildWarPeriods((prev) => sortByDate([...prev, created], 'start'));
      }
      setEditingGuildWarId(null);
    } catch (error) {
      console.error(error);
    }
  };

  const selectGuildWarPeriod = (item: GuildWarPeriod | RaidDeadline) => {
    if (!('start' in item)) return;
    setEditingGuildWarId(item.id);
    setGuildWarDraftStart(item.start);
    setGuildWarDraftEnd(item.end);
  };

  const deleteGuildWarPeriod = async () => {
    if (!editingGuildWarId) return;
    try {
      const res = await fetch(`/api/guild-war-periods/${editingGuildWarId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete guild war period');
      setGuildWarPeriods((prev) => prev.filter((i) => i.id !== editingGuildWarId));
      setEditingGuildWarId(null);
      setGuildWarDraftStart(rangeStart);
      setGuildWarDraftEnd(rangeEnd);
    } catch (error) {
      console.error(error);
    }
  };

  const autoAddNextGuildWarPeriod = async () => {
    const nextPeriod = getNextGuildWarPeriod(guildWarPeriods);
    if (!nextPeriod) return;
    try {
      const res = await fetch('/api/guild-war-periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nextPeriod),
      });
      if (!res.ok) throw new Error('Failed to create next guild war period');
      const created = (await res.json()) as GuildWarPeriod;
      setGuildWarDraftStart(created.start);
      setGuildWarDraftEnd(created.end);
      setEditingGuildWarId(null);
      setGuildWarPeriods((prev) => sortByDate([...prev, created], 'start'));
    } catch (error) {
      console.error(error);
    }
  };

  const saveRaidDeadline = async () => {
    if (!raidDraftDate) return;
    try {
      if (editingRaidId) {
        const res = await fetch(`/api/raid-deadlines/${editingRaidId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: raidDraftDate }),
        });
        if (!res.ok) throw new Error('Failed to update raid deadline');
        const updated = (await res.json()) as RaidDeadline;
        setRaidDeadlines((prev) => sortByDate(prev.map((i) => (i.id === updated.id ? updated : i)), 'date'));
      } else {
        const res = await fetch('/api/raid-deadlines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: raidDraftDate }),
        });
        if (!res.ok) throw new Error('Failed to create raid deadline');
        const created = (await res.json()) as RaidDeadline;
        setRaidDeadlines((prev) => sortByDate([...prev, created], 'date'));
      }
      setEditingRaidId(null);
    } catch (error) {
      console.error(error);
    }
  };

  const selectRaidDeadline = (item: GuildWarPeriod | RaidDeadline) => {
    if (!('date' in item)) return;
    setEditingRaidId(item.id);
    setRaidDraftDate(item.date);
  };

  const deleteRaidDeadline = async () => {
    if (!editingRaidId) return;
    try {
      const res = await fetch(`/api/raid-deadlines/${editingRaidId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete raid deadline');
      setRaidDeadlines((prev) => prev.filter((i) => i.id !== editingRaidId));
      setEditingRaidId(null);
    } catch (error) {
      console.error(error);
    }
  };

  const autoAddNextRaidDeadline = async () => {
    const latest = [...raidDeadlines].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    const baseDate = latest ? latest.date : today;
    const nextDate = getNextRaidSunday(baseDate);
    try {
      const res = await fetch('/api/raid-deadlines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: nextDate }),
      });
      if (!res.ok) throw new Error('Failed to create next raid deadline');
      const created = (await res.json()) as RaidDeadline;
      setRaidDraftDate(created.date);
      setEditingRaidId(null);
      setRaidDeadlines((prev) => sortByDate([...prev, created], 'date'));
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-50 to-zinc-100 p-3 sm:p-4 md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-4"
        >
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-zinc-500">
              <Badge variant="outline" className="rounded-full px-3 py-1">
                길드 관리
              </Badge>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              길드 컨텐츠 참여 관리
            </h1>
          </div>
        </motion.div>

        <Tabs value={tab} onValueChange={(value) => setTab(value as TabValue)} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 rounded-[20px] bg-zinc-100 p-1.5 min-h-[56px] items-center shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_3px_rgba(15,23,42,0.06)]">
            <TabsTrigger value="dashboard" className="flex h-11 w-full items-center justify-center rounded-[14px] px-4 text-sm font-medium text-zinc-600 transition data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">
              <Calendar className="mr-2 h-4 w-4" />현황판
            </TabsTrigger>
            <TabsTrigger value="input" className="flex h-11 w-full items-center justify-center rounded-[14px] px-4 text-sm font-medium text-zinc-600 transition data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">
              <ClipboardList className="mr-2 h-4 w-4" />입력
            </TabsTrigger>
            <TabsTrigger value="score" className="flex h-11 w-full items-center justify-center rounded-[14px] px-4 text-sm font-medium text-zinc-600 transition data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">
              <Trophy className="mr-2 h-4 w-4" />점수
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex h-11 w-full items-center justify-center rounded-[14px] px-4 text-sm font-medium text-zinc-600 transition data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">
              <BarChart3 className="mr-2 h-4 w-4" />통계
            </TabsTrigger>
            <TabsTrigger value="manage" className="flex h-11 w-full items-center justify-center rounded-[14px] px-4 text-sm font-medium text-zinc-600 transition data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm">
              <Settings className="mr-2 h-4 w-4" />관리
            </TabsTrigger>
          </TabsList>

          {/* ── 현황판 ──────────────────────────────── */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(320px,0.9fr)]">
              <Card className="rounded-[28px] border-0 shadow-sm">
                <CardHeader className="space-y-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <CardTitle className="text-xl">기간별 미참 현황</CardTitle>
                      <CardDescription>
                        날짜 셀을 누르면 신규 입력, 색상 박스를 누르면 해당 데이터 수정으로 연결됩니다.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 self-start xl:self-auto">
                      <Button variant="outline" size="icon" className="rounded-2xl" onClick={() => shiftDisplayedRange(-1)}>
                        <Calendar className="h-4 w-4" />
                      </Button>
                      <div className="min-w-[150px] text-center text-sm font-semibold">
                        {displayDate(rangeStart)} ~ {displayDate(rangeEnd)}
                      </div>
                      <Button variant="outline" size="icon" className="rounded-2xl" onClick={() => shiftDisplayedRange(1)}>
                        <Calendar className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                    <div className="hidden rounded-2xl border-2 border-amber-400 bg-white px-4 py-3 text-sm text-zinc-700 md:block">
                      <div className="font-medium text-zinc-800">길드전 시즌</div>
                      노란 테두리
                    </div>
                    <div className="hidden rounded-2xl border border-zinc-200 bg-zinc-100/90 px-4 py-3 text-sm text-zinc-700 md:block">
                      <div className="font-medium text-zinc-800">강림 마감일</div>
                      회색 음영
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">시작일</label>
                      <Input type="date" value={rangeStart} disabled={isMonthMode} onChange={(e) => setRangeStart(e.target.value)} className="rounded-2xl" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">종료일</label>
                      <Input type="date" value={rangeEnd} disabled={isMonthMode} min={rangeStart} onChange={(e) => setRangeEnd(e.target.value)} className="rounded-2xl" />
                    </div>
                    <div className="space-y-2">
                      <label className="invisible text-sm font-medium">보기 모드</label>
                      <Button variant={isMonthMode ? 'default' : 'outline'} className="w-full rounded-2xl" onClick={toggleMonthMode}>
                        월단위
                      </Button>
                    </div>
                    <div className="space-y-2">
                      <label className="invisible text-sm font-medium">시즌 선택</label>
                      <Button variant="outline" className="w-full rounded-2xl" onClick={selectGuildWarRangeFromToday}>
                        길드전 시즌 선택
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 overflow-x-auto">
                  <div className="grid min-w-0 grid-cols-7 gap-1.5 sm:min-w-[720px] sm:gap-2 md:min-w-[840px] xl:min-w-0 xl:gap-3">
                    {weekLabels.map((label, idx) => {
                      const color = idx === 0 ? 'text-rose-400' : idx === 6 ? 'text-sky-400' : 'text-zinc-500';
                      return (
                        <div key={label} className={`px-2 py-1 text-center text-sm font-semibold ${color}`}>
                          {label}
                        </div>
                      );
                    })}
                    {buildRangeGridDays.map((day) => (
                      <DayCell
                        key={day.toISOString()}
                        day={day}
                        rangeStart={rangeStart}
                        rangeEnd={rangeEnd}
                        logs={logs}
                        guildWarPeriods={guildWarPeriods}
                        raidDeadlines={raidDeadlines}
                        onCreateDate={loadNewEntry}
                        onEditLog={loadExistingEntry}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="rounded-[28px] border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-xl">기간 내 누적 미참 집계</CardTitle>
                    <CardDescription>선택한 기간 안의 데이터만 집계합니다.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="overflow-hidden rounded-2xl border border-zinc-200">
                      <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_1fr_0.8fr] bg-zinc-50 px-3 py-3 text-xs font-semibold text-zinc-600">
                        <div>길드원</div>
                        <div className="text-center">길드전</div>
                        <div className="text-center">공성전</div>
                        <div className="text-center">강림원정대</div>
                        <div className="text-center">총계</div>
                      </div>
                      <div className="max-h-[1560px] overflow-auto">
                        {memberStats.map((row) => (
                          <div key={row.name} className="grid grid-cols-[1.4fr_0.8fr_0.8fr_1fr_0.8fr] items-center border-t border-zinc-100 px-3 py-3 text-sm">
                            <div className="font-medium text-zinc-800">{row.name}</div>
                            <div className="text-center">{row.guildWar}</div>
                            <div className="text-center">{row.siege}</div>
                            <div className="text-center">{row.raid}</div>
                            <div className="text-center font-semibold">{row.total}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <WarningPanel warnings={warnings} />
              </div>
            </div>
          </TabsContent>

          {/* ── 입력 ──────────────────────────────── */}
          <TabsContent value="input" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <Card className="rounded-[28px] border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">미참 입력</CardTitle>
                  <CardDescription>{selectedLogId ? '기존 입력 수정 모드입니다.' : '새 입력 모드입니다.'}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">날짜</label>
                    <Input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => {
                        const nextDate = e.target.value;
                        if (selectedLogId && nextDate !== selectedDate) {
                          setSelectedLogId(null);
                          setSelectedMembers([]);
                        }
                        setSelectedDate(nextDate);
                      }}
                      className="rounded-2xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">컨텐츠</label>
                    <Select
                      value={selectedContent}
                      onValueChange={(value) => {
                        const nextContent = value as ContentType;
                        if (selectedLogId && nextContent !== selectedContent) {
                          setSelectedLogId(null);
                          setSelectedMembers([]);
                        }
                        setSelectedContent(nextContent);
                      }}
                    >
                      <SelectTrigger className="rounded-2xl"><SelectValue placeholder="컨텐츠 선택" /></SelectTrigger>
                      <SelectContent>
                        {contentOptions.map((content) => (
                          <SelectItem key={content} value={content}>{content}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">선택된 미참 인원</div>
                      <Badge className="rounded-full">{selectedMembers.length}명</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedMembers.length > 0
                        ? selectedMembers.map((name) => (
                            <Badge key={name} variant="secondary" className="rounded-full px-3 py-1">{name}</Badge>
                          ))
                        : <span className="text-sm text-zinc-400">아직 선택된 인원이 없습니다.</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={saveEntry} className="rounded-2xl px-6">{selectedLogId ? '수정' : '저장'}</Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => { setSelectedLogId(null); setSelectedMembers([]); }}>
                      선택 초기화
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={deleteSelectedEntry} disabled={!selectedLogId}>
                      <Trash2 className="mr-2 h-4 w-4" />삭제
                    </Button>
                    <Button variant="outline" className="rounded-2xl" onClick={() => switchTabWithScrollTop('dashboard')}>
                      <Calendar className="mr-2 h-4 w-4" />현황판
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">미참 길드원 선택</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="길드원 검색" className="rounded-2xl pl-10" />
                  </div>
                  <ScrollArea className="h-[520px] rounded-2xl border border-zinc-200 p-2">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {filteredMembers.map((member) => {
                        const checked = selectedMembers.includes(member.name);
                        return (
                          <button
                            type="button"
                            key={member.id}
                            onClick={() => toggleMember(member.name)}
                            className={['flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition', checked ? 'border-zinc-900 bg-zinc-900 text-white' : 'border-zinc-200 bg-white hover:bg-zinc-50'].join(' ')}
                          >
                            <div>
                              <div className="font-medium">{member.name}</div>
                              <div className={checked ? 'text-xs text-zinc-300' : 'text-xs text-zinc-500'}>활성 회원</div>
                            </div>
                            {checked ? <CheckSquare2 className="h-5 w-5" /> : <Square className="h-5 w-5 text-zinc-400" />}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── 점수 ──────────────────────────────── */}
          <TabsContent value="score" className="space-y-6">
            <ScoreTab members={activeMembers} />
          </TabsContent>

          {/* ── 통계 ──────────────────────────────── */}
          <TabsContent value="stats" className="space-y-6">
            <StatsTab members={activeMembers} />
          </TabsContent>

          {/* ── 관리 ──────────────────────────────── */}
          <TabsContent value="manage" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
              <div className="space-y-6">
                <Card className="rounded-[28px] border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-xl">길드원 추가</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Input value={newMember} onChange={(e) => setNewMember(e.target.value)} placeholder="새 길드원 닉네임" className="rounded-2xl" onKeyDown={(e) => { if (e.key === 'Enter') void addMember(); }} />
                    <Button onClick={addMember} className="rounded-2xl">길드원 추가</Button>
                  </CardContent>
                </Card>

                <WarningManager
                  members={activeMembers}
                  warnings={warnings}
                  today={today}
                  onAdd={addWarning}
                  onDelete={deleteWarning}
                />

                <Card className="rounded-[28px] border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-xl">길드전 기간 설정</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto_auto] md:items-end">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">시작일</label>
                        <Input type="date" value={guildWarDraftStart} onChange={(e) => setGuildWarDraftStart(e.target.value)} className="rounded-2xl" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">종료일</label>
                        <Input type="date" value={guildWarDraftEnd} onChange={(e) => setGuildWarDraftEnd(e.target.value)} className="rounded-2xl" />
                      </div>
                      <Button className="rounded-2xl" onClick={saveGuildWarPeriod}>{editingGuildWarId ? '수정 저장' : '시즌 추가'}</Button>
                      <Button variant="outline" className="rounded-2xl" onClick={autoAddNextGuildWarPeriod}><Wand2 className="mr-2 h-4 w-4" />다음 시즌 자동</Button>
                      <Button variant="outline" className="rounded-2xl" onClick={deleteGuildWarPeriod} disabled={!editingGuildWarId}><Trash2 className="mr-2 h-4 w-4" />삭제</Button>
                    </div>
                    <PeriodCalendar
                      title="시즌 달력"
                      description="표시된 시즌을 누르면 위 입력칸에 반영됩니다."
                      baseDate={guildWarCalendarBase}
                      onPrevMonth={() => setGuildWarCalendarBase(shiftMonth(guildWarCalendarBase, -1))}
                      onNextMonth={() => setGuildWarCalendarBase(shiftMonth(guildWarCalendarBase, 1))}
                      rangeStart={guildWarCalendarRange.start}
                      rangeEnd={guildWarCalendarRange.end}
                      items={guildWarPeriods}
                      type="period"
                      selectedId={editingGuildWarId}
                      onSelect={selectGuildWarPeriod}
                    />
                  </CardContent>
                </Card>

                <Card className="rounded-[28px] border-0 shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-xl">강림원정대 마감일 설정</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">마감일</label>
                        <Input type="date" value={raidDraftDate} onChange={(e) => setRaidDraftDate(e.target.value)} className="rounded-2xl" />
                      </div>
                      <Button className="rounded-2xl" onClick={saveRaidDeadline}>{editingRaidId ? '수정 저장' : '마감일 추가'}</Button>
                      <Button variant="outline" className="rounded-2xl" onClick={autoAddNextRaidDeadline}><Wand2 className="mr-2 h-4 w-4" />다음 마감일 자동</Button>
                      <Button variant="outline" className="rounded-2xl" onClick={deleteRaidDeadline} disabled={!editingRaidId}><Trash2 className="mr-2 h-4 w-4" />삭제</Button>
                    </div>
                    <PeriodCalendar
                      title="마감일 달력"
                      description="표시된 마감일을 누르면 위 입력칸에 반영됩니다."
                      baseDate={raidCalendarBase}
                      onPrevMonth={() => setRaidCalendarBase(shiftMonth(raidCalendarBase, -1))}
                      onNextMonth={() => setRaidCalendarBase(shiftMonth(raidCalendarBase, 1))}
                      rangeStart={raidCalendarRange.start}
                      rangeEnd={raidCalendarRange.end}
                      items={raidDeadlines}
                      type="date"
                      selectedId={editingRaidId}
                      onSelect={selectRaidDeadline}
                    />
                  </CardContent>
                </Card>
              </div>

              <Card className="rounded-[28px] border-0 shadow-sm">
                <CardHeader className="space-y-4">
                  <CardTitle className="text-xl">길드원 관리</CardTitle>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-2">
                      <Button variant={showInactiveMembers ? 'outline' : 'default'} className="rounded-2xl" onClick={() => setShowInactiveMembers(false)}>
                        활성 멤버 보기
                      </Button>
                      <Button variant={showInactiveMembers ? 'default' : 'outline'} className="rounded-2xl" onClick={() => setShowInactiveMembers(true)}>
                        탈퇴 멤버 보기
                      </Button>
                    </div>
                    <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
                      {showInactiveMembers ? `탈퇴 ${displayedManageMembers.length}명` : `활성 ${displayedManageMembers.length}명`}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={showInactiveMembers ? '탈퇴 멤버 검색' : '활성 멤버 검색'} className="rounded-2xl pl-10" />
                  </div>
                  <ScrollArea className="h-[1100px] rounded-2xl border border-zinc-200 p-2">
                    <div className="space-y-3 pr-2">
                      {displayedManageMembers.map((member) => (
                        <div key={member.id} className="rounded-2xl border border-zinc-200 px-4 py-3">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                {editingMemberId === member.id ? (
                                  <div className="space-y-2">
                                    <Input value={editingMemberName} onChange={(e) => setEditingMemberName(e.target.value)} className="rounded-2xl" placeholder="닉네임 입력" />
                                    <div className="flex flex-wrap gap-2">
                                      <Button size="sm" className="rounded-2xl" onClick={() => void updateMemberName(member.id)}>닉네임 저장</Button>
                                      <Button size="sm" variant="outline" className="rounded-2xl" onClick={cancelEditMember}>취소</Button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="font-medium text-zinc-800">{member.name}</div>
                                    <div className="text-xs text-zinc-500">{member.active ? '활성' : '탈퇴 처리됨'}</div>
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <Checkbox checked={!member.active} onCheckedChange={(checked) => { void updateMemberActive(member.id, !Boolean(checked)); }} />
                                <span className="text-sm text-zinc-600">탈퇴</span>
                              </div>
                            </div>
                            {editingMemberId !== member.id && (
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="outline" className="rounded-2xl" onClick={() => startEditMember(member)}>닉네임 변경</Button>
                                <Button size="sm" variant="destructive" className="rounded-2xl" onClick={() => void deleteMember(member.id, member.name)}>DB에서 삭제</Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      {displayedManageMembers.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-zinc-300 px-4 py-10 text-center text-sm text-zinc-500">
                          {showInactiveMembers ? '표시할 탈퇴 멤버가 없습니다.' : '표시할 활성 멤버가 없습니다.'}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                  <div className="pt-3">
                    <Button variant="outline" className="rounded-2xl" onClick={() => void copyMembersForExcel()}>목록 클립보드 복사</Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
