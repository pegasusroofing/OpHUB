// A job's Settings & Admin (380 renderAssignTeam + 370). Site set up: name/address/
// job number/start date, Main Contractor, Multi-Site and its addresses, Repair
// Contract. Team: operatives, site managers, subcontractor crews, clients. Job
// status, Price switch, Activity History and Site Info. Managers only.
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { SelectBox } from '@/components/SelectBox';
import { AssignList } from '@/components/AssignList';
import { chooseAction, confirmAsk, useToast } from '@/components/toast';
import { Button, Card, Check, Empty, Muted, SectionTitle, Toggle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import {
  assignToSite, deleteSubAddress, removeFromSite, setSubAddressClosed, saveSubAddress, setSiteStatus, toggleSubOperative, updateSite,
  useSiteAddresses, useTeamData, type FullSubAddr,
} from '@/data/siteAdmin';
import { useSite } from '@/data/sites';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { isFullManager, isManager } from '@/lib/roles';
import { base, page, radius, space } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const long = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const titleCase = (t: string) => t.replace(/\b([a-z])/g, (c) => c.toUpperCase());

export default function SiteAdmin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const mc = !!site?.acting_as_main_contractor;
  const { data: team, refetch } = useTeamData(id, mc);
  const { data: addrs, refetch: refetchAddrs } = useSiteAddresses(id, !!site?.multi_site);
  const { data: people } = usePeople();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [addrForm, setAddrForm] = useState<{ id: string | null; name: string; address: string; postcode: string } | null>(null);
  const [details, setDetails] = useState<{ name: string; address: string; postcode: string; job: string; start: string } | null>(null);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Only managers can open a job's Settings & Admin.</Muted>;
  const full = isFullManager(me);
  const flip = (k: string) => setOpen({ ...open, [k]: !open[k] });
  const sk = siteStatusKey(site);

  const toggleAssign = async (userId: string, on: boolean) => {
    setBusy(userId);
    const err = on ? await removeFromSite(id, userId) : await assignToSite(me, id, userId);
    setBusy(null);
    toast(err ?? (on ? 'Removed from site' : 'Assigned to site'));
    void refetch();
  };
  const flag = async (patch: Record<string, unknown>, msg: string) => { if (await updateSite(qc, id, patch)) toast(msg); else toast('Could not save — try again.'); };

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Settings & Admin' }} />

      <Toggle title="⚙ Site set up — name & address, main contractor, multi-site" open={!!open.setup} onPress={() => flip('setup')} />
      {open.setup && (
        <View style={{ marginLeft: 6 }}>
          {full && (
            <>
              <Toggle title="Amend Site Name, Address & Job Number" open={!!details} onPress={() => setDetails(details ? null : { name: site.name || '', address: site.address || '', postcode: site.postcode || '', job: site.job_number || '', start: site.start_date || '' })} />
              {details && (
                <Card>
                  <Muted style={{ fontWeight: '700' }}>Site Name</Muted>
                  <TextInput value={details.name} onChangeText={(t) => setDetails({ ...details, name: t })} style={box} />
                  <Muted style={{ fontWeight: '700' }}>Address</Muted>
                  <TextInput value={details.address} onChangeText={(t) => setDetails({ ...details, address: titleCase(t) })} style={box} />
                  <Muted style={{ fontWeight: '700' }}>Postcode</Muted>
                  <TextInput value={details.postcode} onChangeText={(t) => setDetails({ ...details, postcode: t.toUpperCase() })} autoCapitalize="characters" style={box} />
                  <Muted style={{ fontWeight: '700' }}>Job Number</Muted>
                  <TextInput value={details.job} onChangeText={(t) => setDetails({ ...details, job: t })} placeholder="Optional" style={box} />
                  <Muted style={{ fontWeight: '700' }}>Start Date</Muted>
                  <DateBox value={details.start} onChange={(v) => setDetails({ ...details, start: v })} title="Start date" style={{ marginBottom: 8 }} />
                  <Button title="Save" onPress={async () => {
                    if (!details.name.trim()) { toast('Site name cannot be blank.'); return; }
                    const d = details.start || null;
                    if (await updateSite(qc, id, { name: details.name.trim(), address: details.address.trim() || null, postcode: details.postcode.trim() || null, job_number: details.job.trim() || null, start_date: d })) { toast('Details updated'); setDetails(null); }
                    else toast('Could not save — try again.');
                  }} />
                </Card>
              )}
            </>
          )}

          <Toggle title="Main Contractor" open={!!open.mc} onPress={() => flip('mc')} />
          {open.mc && (
            <Card>
              {full ? <Check label="Acting as a Main Contractor?" value={mc} onChange={(v) => void flag({ acting_as_main_contractor: v }, v ? 'Main Contractor tiles enabled' : 'Main Contractor tiles disabled')} />
                : <Muted>{mc ? '✓ Acting as a Main Contractor' : 'Not acting as a Main Contractor'}</Muted>}
              <Muted style={{ marginTop: 8 }}>When on, a single "Main Contractor" tile appears on this site's home page, leading to the Construction Phase Plan, Site Rules & Layout, Inductions, Subcontractors, Permits, Inspections, Asbestos Register and F10.</Muted>
            </Card>
          )}

          <Toggle title="Multi-Site" open={!!open.multi} onPress={() => flip('multi')} />
          {open.multi && (
            <View>
              <Card>
                {full && !site.repair_contract ? <Check label="This is a multi-site project (several separate addresses under one job)" value={site.multi_site} onChange={(v) => void flag({ multi_site: v }, v ? 'Multi-site enabled — add its addresses below' : 'Multi-site disabled')} />
                  : <Muted>{site.multi_site ? '✓ Multi-site project' : 'Not a multi-site project'}</Muted>}
                <Muted style={{ marginTop: 8 }}>{site.repair_contract ? 'Turn off Maintenance / Repair Contract first — a project is one or the other, not both.' : 'When on, Check In becomes per-address with its own GPS geofence, and Schedule of Works tasks can be linked to an address.'}</Muted>
              </Card>
              {site.multi_site && (
                <>
                  <SectionTitle>Addresses</SectionTitle>
                  {(addrs ?? []).map((a: FullSubAddr) => (
                    <Card key={a.id} style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', color: base.ink }}>{a.name}{a.closed ? ' (closed)' : ''}</Text>
                        {!!(a.address || a.postcode) && <Muted>{[a.address, a.postcode].filter(Boolean).join(', ')}</Muted>}
                        <Muted>{a.geofence_lat != null ? `📍 Geofence set — ${a.geofence_radius_m || 100}m radius` : 'No geofence set yet — set it from the address on Check In'}</Muted>
                      </View>
                      <Pressable hitSlop={8} onPress={async () => {
                        const k = await chooseAction(a.name, [{ key: 'edit', label: '✎ Edit' }, { key: 'geo', label: '📍 Geofence (on Check In)' }, { key: 'close', label: a.closed ? '🔓 Reopen this address' : '🔒 Close this address (finished)' }, { key: 'del', label: '🗑 Delete', danger: true }]);
                        if (k === 'edit') setAddrForm({ id: a.id, name: a.name, address: a.address || '', postcode: a.postcode || '' });
                        else if (k === 'geo') router.push(`/sites/${id}/checkin/${a.id}` as never);
                        else if (k === 'close') { if (await setSubAddressClosed(me, id, a, !a.closed)) void refetchAddrs(); else toast('Could not save — try again.'); }
                        else if (k === 'del' && await confirmAsk("Delete this address? Any tasks or check-ins already linked to it keep their history but will show as unlinked. This can't be undone.", 'Delete')) {
                          if (await deleteSubAddress(me, id, a)) { toast('Address deleted'); void refetchAddrs(); } else toast('Could not delete — try again.');
                        }
                      }}><Text style={{ fontSize: 18, color: base.slate }}>⋮</Text></Pressable>
                    </Card>
                  ))}
                  {!addrs?.length && <Empty>No addresses added yet.</Empty>}
                  {addrForm ? (
                    <Card style={{ backgroundColor: base.paper }}>
                      <SectionTitle>{addrForm.id ? 'Edit Address' : 'Add Address'}</SectionTitle>
                      <TextInput value={addrForm.name} onChangeText={(t) => setAddrForm({ ...addrForm, name: t })} placeholder="e.g. 12 High Street" style={box} />
                      <TextInput value={addrForm.address} onChangeText={(t) => setAddrForm({ ...addrForm, address: titleCase(t) })} placeholder="Address (optional)" style={box} />
                      <TextInput value={addrForm.postcode} onChangeText={(t) => setAddrForm({ ...addrForm, postcode: t.toUpperCase() })} placeholder="Postcode (optional)" autoCapitalize="characters" style={box} />
                      <Button title={addrForm.id ? 'Save' : 'Add Address'} onPress={async () => {
                        if (!addrForm.name.trim()) { toast('Enter a name for this address.'); return; }
                        if (await saveSubAddress(me, id, addrForm.id, { name: addrForm.name.trim(), address: addrForm.address.trim(), postcode: addrForm.postcode.trim() })) {
                          toast(addrForm.id ? 'Address updated' : 'Address added'); setAddrForm(null); void refetchAddrs(); void qc.invalidateQueries({ queryKey: ['subAddresses', id] });
                        } else toast('Could not save — try again.');
                      }} />
                      <Button kind="ghost" title="Cancel" onPress={() => setAddrForm(null)} />
                    </Card>
                  ) : <Button kind="ghost" title="+ Add Address" onPress={() => setAddrForm({ id: null, name: '', address: '', postcode: '' })} />}
                </>
              )}
            </View>
          )}

          <Toggle title="Maintenance / Repair Contract" open={!!open.repair} onPress={() => flip('repair')} />
          {open.repair && (
            <Card>
              {full && !site.multi_site ? <Check label="This is a Maintenance / Repair Contract (a running list of individual repair jobs)" value={site.repair_contract} onChange={(v) => void flag({ repair_contract: v }, v ? 'Repair Contract enabled — this project now opens straight into its repair jobs list' : 'Repair Contract disabled')} />
                : <Muted>{site.repair_contract ? '✓ Maintenance / Repair Contract' : 'Not a repair contract'}</Muted>}
              <Muted style={{ marginTop: 8 }}>{site.multi_site ? 'Turn off Multi-site first — a project is one or the other, not both.' : "When on, this project's Home page becomes its repair jobs list."}</Muted>
            </Card>
          )}
          <Card style={{ marginTop: 10 }}><Text style={{ fontWeight: '700', color: base.ink }}>☁️ OneDrive sync folder</Text><Muted style={{ marginVertical: 6 }}>{(site as { onedrive_folder_name?: string | null }).onedrive_folder_name ? `📁 ${(site as { onedrive_folder_name?: string | null }).onedrive_folder_name} — photos, drawings and exports sync there` : "Not linked — link the job's real OneDrive folder so photos and exports sync there."}</Muted><Button kind="ghost" title={(site as { onedrive_folder_name?: string | null }).onedrive_folder_name ? 'Change folder' : 'Link folder'} onPress={() => router.push({ pathname: '/pm/onedrive-pick', params: { target: 'progress', id: site.id } } as never)} /></Card>
        </View>
      )}

      <Toggle title="👥 Team — operatives, site managers & clients" open={!!open.team} onPress={() => flip('team')} />
      {open.team && (
        <View style={{ marginLeft: 6 }}>
          <Toggle title="Assign Operatives to Project" open={!!open.ops} onPress={() => flip('ops')} />
          {open.ops && (
            <View>
              <Muted style={{ marginBottom: 10 }}>Only operatives assigned here can see this site. Project Managers and Admins can always see every site; Site Managers need to be assigned like anyone else.</Muted>
              <AssignList people={team?.operatives ?? []} isOn={(u) => !!team?.assigned.has(u)} onToggle={(u, on) => void toggleAssign(u, on)} busyId={busy} empty="No operatives yet — they need to sign up first." />
            </View>
          )}
          <Toggle title="Assign Site Managers" open={!!open.sms} onPress={() => flip('sms')} />
          {open.sms && (
            <View>
              <Muted style={{ marginBottom: 10 }}>Unlike a Project Manager, a Site Manager only sees the sites assigned here — assign them to every site they run.</Muted>
              <AssignList people={team?.siteManagers ?? []} isOn={(u) => !!team?.assigned.has(u)} onToggle={(u, on) => void toggleAssign(u, on)} busyId={busy} empty="No site managers yet — promote someone from Operatives in Admin Centre › Users." />
            </View>
          )}
          {(team?.companies ?? []).map((c) => (
            <View key={c.id}>
              <Toggle title={`Assign Operatives to ${c.name}`} open={!!open[`c:${c.id}`]} onPress={() => flip(`c:${c.id}`)} />
              {open[`c:${c.id}`] && (
                <View>
                  <Muted style={{ marginBottom: 10 }}>Tick every operative working for {c.name} on this site. Ticking here also gives them access to this site if they don't have it already.</Muted>
                  <AssignList people={team?.operatives ?? []} busyId={busy}
                    isOn={(u) => !!team?.subOps.some((x) => x.subcontractor_company_id === c.id && x.user_id === u)}
                    onToggle={async (u) => {
                      const alloc = team?.subOps.find((x) => x.subcontractor_company_id === c.id && x.user_id === u);
                      setBusy(u); const err = await toggleSubOperative(me, id, c.id, u, alloc?.id ?? null); setBusy(null);
                      toast(err ?? (alloc ? `Removed from ${c.name}` : `Assigned to ${c.name}`)); void refetch();
                    }} empty="No operatives yet — they need to sign up first." />
                </View>
              )}
            </View>
          ))}
          <Toggle title="Assign Clients" open={!!open.clients} onPress={() => flip('clients')} />
          {open.clients && (
            <View>
              <Muted style={{ marginBottom: 10 }}>Clients get a read-only view of this site — RAMS, COSHH, Toolbox Talks, Schedule of Works, completed inspections and snagging. They can view and export, never sign or edit.</Muted>
              <AssignList people={team?.clients ?? []} isOn={(u) => !!team?.assigned.has(u)} onToggle={(u, on) => void toggleAssign(u, on)} busyId={busy} empty="No clients yet — invite one from Invites & Users." />
            </View>
          )}
        </View>
      )}

      {full && (
        <>
          <SectionTitle>Job status</SectionTitle>
          <SelectBox title="Job status" value={sk} options={[['live', '🟢 Live'], ['upcoming', '🗓 Upcoming'], ['closed', '🔒 Closed']]} style={{ maxWidth: 320 }} onChange={async (k) => {
            if (k === sk) return;
            if (k === 'closed' && !(await confirmAsk(`Close "${site.name}"? Operatives lose access to it, and the Handover tile (O&M manual) appears on the job. You can reopen it any time from here or the Closed list.`, 'Close job'))) return;
            if (!(await setSiteStatus(qc, me, id, k))) toast('Could not save — try again.');
          }} />

          <Toggle title="Price" open={!!open.price} onPress={() => flip('price')} />
          {open.price && (
            <Card>
              <Check label="This project is on a price" value={site.price_enabled} onChange={(v) => void flag({ price_enabled: v }, v ? 'Price tile enabled' : 'Price tile disabled')} />
              <Muted style={{ marginTop: 8 }}>When on, a "Price" tile appears on the site home screen — visible to the admin and this site's responsible PM always, and to any operative granted access to a Pricing Element inside the Price tile.</Muted>
            </Card>
          )}
        </>
      )}

      <Pressable onPress={() => router.push(`/sites/${id}/activity` as never)} style={{ marginTop: space.l }}>
        <Text style={{ fontWeight: '700', color: base.ink }}>▶ Activity History <Text style={{ fontWeight: '400', color: base.slate }}>· who did what, and when</Text></Text>
      </Pressable>

      <SectionTitle>Site Info</SectionTitle>
      <Card>
        <Muted>Created {long(site.created_at)}{site.created_by ? ` by ${nameOf(people, site.created_by)}` : ''}</Muted>
        {site.status === 'closed' && <Muted>Closed {long(site.closed_at)}{site.closed_by ? ` by ${nameOf(people, site.closed_by)}` : ''}</Muted>}
      </Card>
    </ScrollView>
  );
}
