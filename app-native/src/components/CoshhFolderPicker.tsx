// "Which folder?" sheet for the COSHH Library (589 coshhPickFolder): the whole
// folder tree, the top level, + New folder; one folder, or several when multi.
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import { promptText, useToast } from '@/components/toast';
import { Button } from '@/components/ui';
import { createFolder, useAllFolders, type Folder } from '@/data/coshhLib';
import { useAuth } from '@/lib/auth';
import { base, radius } from '@/theme/theme';

export function CoshhFolderPicker({ title, multi, onDone, onCancel }: { title: string; multi?: boolean; onDone: (ids: (string | null)[]) => void; onCancel: () => void }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: folders = [] } = useAllFolders(me?.org_id);
  const [picked, setPicked] = useState<(string | null)[]>([]);
  const byParent: Record<string, Folder[]> = {};
  folders.forEach((f) => { (byParent[f.parent_id || ''] = byParent[f.parent_id || ''] || []).push(f); });
  const rows: { f: Folder; depth: number }[] = [];
  const walk = (pid: string, depth: number) => (byParent[pid] || []).forEach((f) => { rows.push({ f, depth }); walk(f.id, depth + 1); });
  walk('', 0);
  const tap = (id: string | null) => { if (!multi) { onDone([id]); return; } setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]); };
  const row = (id: string | null, label: string, depth: number) => {
    const on = picked.includes(id);
    return (
      <Pressable key={id || 'top'} onPress={() => tap(id)} style={{ padding: 10, paddingLeft: 12 + depth * 18, borderWidth: 1, borderColor: on ? base.ink : base.line, backgroundColor: on ? base.ink : base.card, borderRadius: radius.input, marginBottom: 6 }}>
        <Text style={{ fontWeight: '700', color: on ? '#fff' : base.ink }}>{on ? '✓ ' : ''}{label}</Text>
      </Pressable>
    );
  };
  return (
    <Modal transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: base.card, borderRadius: 16, maxHeight: '80%', width: '100%', maxWidth: 560, alignSelf: 'center', padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
            <Text style={{ flex: 1, fontWeight: '800', fontSize: 15, color: base.ink,  }}>{title}</Text>
            <Pressable onPress={onCancel} accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} style={{ paddingLeft: 10 }}><Text style={{ fontSize: 18, color: base.slate, fontWeight: '700' }}>✕</Text></Pressable>
          </View>
          <ScrollView style={{ flexGrow: 0 }}>
            {row(null, '📂 Top level', 0)}
            {rows.map(({ f, depth }) => row(f.id, `📁 ${f.name}`, depth))}
          </ScrollView>
          <View style={{ gap: 6, marginTop: 8 }}>
            <Button kind="ghost" title="+ New folder" onPress={async () => {
              const n = await promptText('New folder name (e.g. Bauder, or Flat Roofing)', ''); if (!n || !n.trim() || !me) return;
              const id = await createFolder(me, null, n.trim());
              if (!id) { toast('Could not create the folder.'); return; }
              void qc.invalidateQueries({ queryKey: ['coshhFolders'] });
              if (multi) setPicked([...picked, id]); else onDone([id]);
            }} />
            {multi && <Button title="Save to the ticked folders" onPress={() => { if (!picked.length) { toast('Tick at least one folder'); return; } onDone(picked); }} />}
            <Button kind="ghost" title="Cancel" onPress={onCancel} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
