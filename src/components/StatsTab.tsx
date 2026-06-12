import { useState } from 'react';
import { Swords, Shield, Flame } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import StatsBoard from '@/components/StatsBoard';
import type { Member, ScoreType } from '@/lib/types';

type Props = {
  members: Member[];
};

export default function StatsTab({ members }: Props) {
  const [scoreType, setScoreType] = useState<ScoreType>('총력전');

  return (
    <Tabs
      value={scoreType}
      onValueChange={(value) => setScoreType(value as ScoreType)}
      className="space-y-6"
    >
      <TabsList className="grid w-full max-w-xl grid-cols-3 rounded-[18px] bg-zinc-100 p-1.5 min-h-[48px] items-center">
        <TabsTrigger
          value="총력전"
          className="flex h-9 w-full items-center justify-center rounded-[12px] px-4 text-sm font-medium text-zinc-600 transition data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm"
        >
          <Swords className="mr-2 h-4 w-4" />총력전
        </TabsTrigger>
        <TabsTrigger
          value="길드전"
          className="flex h-9 w-full items-center justify-center rounded-[12px] px-4 text-sm font-medium text-zinc-600 transition data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm"
        >
          <Shield className="mr-2 h-4 w-4" />길드전
        </TabsTrigger>
        <TabsTrigger
          value="강림전"
          className="flex h-9 w-full items-center justify-center rounded-[12px] px-4 text-sm font-medium text-zinc-600 transition data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm"
        >
          <Flame className="mr-2 h-4 w-4" />강림전
        </TabsTrigger>
      </TabsList>

      <TabsContent value="총력전">
        <StatsBoard type="총력전" members={members} />
      </TabsContent>
      <TabsContent value="길드전">
        <StatsBoard type="길드전" members={members} />
      </TabsContent>
      <TabsContent value="강림전">
        <StatsBoard type="강림전" members={members} />
      </TabsContent>
    </Tabs>
  );
}
