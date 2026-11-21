// A job's Project Settings (380 renderAssignTeam + 370). Site set up: name/address/
// job number/start date, Site Type (Main Contractor, Multi-Site and its addresses, Repair
// Contract, Subcontractor On A Price), the OneDrive folder. Team: operatives, site managers, subcontractor crews, clients. Job
// status, Price switch, Activity History and Site Info. Managers only.
import { setupJobPack, useJobPackSettings } from '@/data/jobPack';
import { useQueryClient } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { DateBox } from '@/components/DateField';
import { SelectBox } from '@/components/SelectBox';
import { AssignList } from '@/components/AssignList';
import { chooseAction, confirmAsk, showAlert, useToast } from '@/components/toast';
import { Button, Card, Empty, Muted, SectionTitle, Toggle } from '@/components/ui';
import { nameOf, usePeople } from '@/data/hs';
import {
  assignToSite, deleteSubAddress, removeFromSite, setSubAddressClosed, saveSubAddress, setSiteStatus, toggleSubOperative, updateSite,
  useSiteAddresses, useTeamData, type FullSubAddr,
} from '@/data/siteAdmin';
import { useSite, useSites } from '@/data/sites';
import { syncSiteFolder } from '@/data/drawings';
import { unlinkFolder, useOneDriveStatus } from '@/data/onedrive';
import { useAuth } from '@/lib/auth';
import { siteStatusKey } from '@/lib/rules/checkin';
import { jobNumberClash } from '@/lib/rules/jobNumbers';
import { isFullManager, isManager } from '@/lib/roles';
import { base, page, radius, space, useTheme } from '@/theme/theme';

const box = { borderWidth: 1, borderColor: base.line, borderRadius: radius.input, padding: 10, color: base.ink, backgroundColor: base.card, marginBottom: 8 };
const long = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
// 030 applyTitleCase: capitals only at the start or after a space (Andy's House, not Andy'S House).
const titleCase = (t: string) => t.replace(/(^|\s)([a-z])/g, (_m, a: string, c: string) => a + c.toUpperCase());

export default function SiteAdmin() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: site } = useSite(id);
  const { data: allSites = [] } = useSites();
  const mc = !!site?.acting_as_main_contractor;
  const { data: team, refetch } = useTeamData(id, mc);
  const { data: addrs, refetch: refetchAddrs } = useSiteAddresses(id, !!site?.multi_site);
  const { data: people } = usePeople();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [addrForm, setAddrForm] = useState<{ id: string | null; name: string; address: string; postcode: string } | null>(null);
  const [details, setDetails] = useState<{ name: string; address: string; postcode: string; job: string; start: string } | null>(null);
  if (!me || !site) return <Muted style={{ padding: space.l }}>Loading…</Muted>;
  if (!isManager(me)) return <Muted style={{ padding: space.l }}>Only managers can open a job's Project Settings.</Muted>;
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
  const types = [mc && 'Main Contractor', site.multi_site && 'Multi-Site', site.repair_contract && 'Repair Contract', site.price_enabled && 'On A Price'].filter(Boolean) as string[];
  // Multi-site or repair contract: turning one on when the other is on asks, then swaps.
  const setType = async (k: 'multi' | 'repair') => {
    const on = k === 'multi' ? !!site.multi_site : !!site.repair_contract;
    const other = k === 'multi' ? !!site.repair_contract : !!site.multi_site;
    if (!on && other && !(await confirmAsk(`A job is multi-site or a repair contract, not both. Turn off ${k === 'multi' ? 'Maintenance / Repair Contract and make it Multi-Site' : 'Multi-Site and make it a Maintenance / Repair Contract'}?`, 'Yes', 'No'))) return;
    const swap = !on && other ? (k === 'multi' ? { repair_contract: false } : { multi_site: false }) : {};
    await flag({ [k === 'multi' ? 'multi_site' : 'repair_contract']: !on, ...swap }, '');
  };

  return (
    <ScrollView contentContainerStyle={page(720)} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Project Settings' }} />

      <Toggle title="⚙ Site Set Up — Name & Address, Site Type, OneDrive" open={!!open.setup} onPress={() => flip('setup')} />
      {open.setup && (
        <View style={{ marginLeft: 6 }}>
          {full && (
            <>
              <Toggle title="Amend Site Name, Address & Job Number" open={!!details} onPress={() => setDetails(details ? null : { name: site.name || '', address: site.address || '', postcode: site.postcode || '', job: site.job_number || '', start: site.start_date || '' })} />
              {details && (
                <Card>
                  <Muted style={{ fontWeight: '600' }}>Site Name</Muted>
                  <TextInput value={details.name} onChangeText={(t) => setDetails({ ...details, name: t })} style={box} />
                  <Muted style={{ fontWeight: '600' }}>Address</Muted>
                  <TextInput value={details.address} onChangeText={(t) => setDetails({ ...details, address: titleCase(t) })} style={box} />
                  <Muted style={{ fontWeight: '600' }}>Postcode</Muted>
                  <TextInput value={details.postcode} onChangeText={(t) => setDetails({ ...details, postcode: t.toUpperCase() })} autoCapitalize="characters" style={box} />
                  <Muted style={{ fontWeight: '600' }}>Job Number</Muted>
                  <TextInput value={details.job} onChangeText={(t) => setDetails({ ...details, job: t })} placeholder="Optional" style={box} />
                  <Muted style={{ fontWeight: '600' }}>Start Date</Muted>
                  <DateBox value={details.start} onChange={(v) => setDetails({ ...details, start: v })} title="Start Date" style={{ marginBottom: 8 }} />
                  <Button title="Save" onPress={async () => {
                    if (!details.name.trim()) { showAlert('Site name cannot be blank.'); return; }
                    // A number another job has: say which, not just "Could not save" (Andy, 18 Nov 2026: "it doesn't let me save the edit").
                    const clash = jobNumberClash(details.job, allSites, id);
                    if (clash) { showAlert(`Job number ${details.job.trim()} is already used on ${clash}. Use another number.`); return; }
                    const d = details.start || null;
                    if (await updateSite(qc, id, { name: details.name.trim(), address: details.address.trim() || null, postcode: details.postcode.trim() || null, job_number: details.job.trim() || null, start_date: d })) { toast('Details updated'); setDetails(null); }
                    else toast('Could not save — try again.');
                  }} />
                </Card>
              )}
            </>
          )}

          {/* Site Type (Andy, 20 Nov 2026: "move the main contractor and multi site maintenance repair under one row for site type
              please? then the options are selectable and the price in here too (change to subcontractor on a price?)"): one row,
              each type ticked on or off. A project is multi-site or a repair contract, not both. */}
          <Toggle title={`Site Type${types.length ? ` — ${types.join(' · ')}` : ''}`} open={!!open.type} onPress={() => flip('type')} />
          {open.type && (
            <View>
              <Card>
                <TypeRow first label="Main Contractor" on={mc} edit={full} onPress={() => void flag({ acting_as_main_contractor: !mc }, '')}
                  desc='A Main Contractor page on the job: Before Work (Construction Phase Plan, F10, Asbestos Register, Site Rules), People (subcontractors and inductions) and On Site (permits and inspections).' />
                {/* 380: every subcontractor company's own library (insurance, accreditations, RAMS templates), shared across jobs. */}
                <View style={{ alignItems: 'center', marginBottom: 6 }}><Button small kind="ghost" title="📚 Company Library" onPress={() => router.push('/pm/admin/companylibrary' as never)} /></View>
                <TypeRow label="Multi-Site" on={!!site.multi_site} edit={full} onPress={() => void setType('multi')}
                  desc="Several separate addresses under one job: Check In is per address with its own GPS geofence, and Schedule of Works tasks can be linked to an address." />
                <TypeRow label="Maintenance / Repair Contract" on={!!site.repair_contract} edit={full} onPress={() => void setType('repair')}
                  desc="A running list of individual repair jobs: the job's Home page becomes its repair jobs list." />
                {full && <TypeRow label="Subcontractor On A Price" on={!!site.price_enabled} edit onPress={() => void flag({ price_enabled: !site.price_enabled }, '')}
                  desc="We're working on a price: a Price tile on the job, seen by the admin and this job's responsible PM, and by any operative given a Pricing Element in it." />}
                {!full && <Muted style={{ marginTop: 6, textAlign: 'center' }}>Only an admin or project manager can change the site type.</Muted>}
              </Card>
            {site.multi_site && (
              <>
                <SectionTitle>Addresses</SectionTitle>
                {(addrs ?? []).map((a: FullSubAddr) => (
                  <Card key={a.id} style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontWeight: '600', color: base.ink }}>{a.name}{a.closed ? ' (closed)' : ''}</Text>
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
          <SyncFolderCard site={site as never} full={!!me && isFullManager(me)} />
        </View>
      )}

      <Toggle title="👥 Team — Operatives, Site Managers & Clients" open={!!open.team} onPress={() => flip('team')} />
      {open.team && (
        <View style={{ marginLeft: 6 }}>
          <Toggle title="Assign Operatives To Project" open={!!open.ops} onPress={() => flip('ops')} />
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
              <Toggle title={`Assign Operatives To ${c.name}`} open={!!open[`c:${c.id}`]} onPress={() => flip(`c:${c.id}`)} />
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
          <SectionTitle>Job Status</SectionTitle>
          <SelectBox title="Job Status" value={sk} options={[['live', '🟢 Live'], ['upcoming', '🗓 Upcoming'], ['closed', '🔒 Closed']]} onChange={async (k) => {
            if (k === sk) return;
            if (k === 'closed' && !(await confirmAsk(`Close "${site.name}"? Operatives lose access to it, and the Handover tile (O&M manual) appears on the job. You can reopen it any time from here or the Closed list.`, 'Close job'))) return;
            if (!(await setSiteStatus(qc, me, id, k))) toast('Could not save — try again.');
          }} />

        </>
      )}

      {/* 385: a row like the drop-downs above it, not loose text. */}
      <Pressable onPress={() => router.push(`/sites/${id}/activity` as never)} accessibilityRole="button" style={{ marginTop: 8, marginBottom: 6, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: base.cardLine, backgroundColor: base.card }}>
        <Text style={{ fontWeight: '600', fontSize: 13.5, color: base.ink }}>▶ Activity History <Text style={{ fontWeight: '400', fontStyle: 'italic', fontSize: 12, color: base.slate }}>· who did what, and when</Text></Text>
      </Pressable>

      <SectionTitle>Site Info</SectionTitle>
      <Card>
        <Muted>Created {long(site.created_at)}{site.created_by ? ` by ${nameOf(people, site.created_by)}` : ''}</Muted>
        {site.status === 'closed' && <Muted>Closed {long(site.closed_at)}{site.closed_by ? ` by ${nameOf(people, site.closed_by)}` : ''}</Muted>}
      </Card>
    </ScrollView>
  );
}

/** One site type: tick on or off, with what it does under it. */
function TypeRow({ label, desc, on, edit, first, onPress }: { label: string; desc: string; on: boolean; edit: boolean; first?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable disabled={!edit} onPress={onPress} accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: on, disabled: !edit }}
      style={{ flexDirection: 'row', gap: 10, paddingVertical: 9, borderTopWidth: first ? 0 : 1, borderTopColor: '#EEF0F2' }}>
      <View style={{ width: 20, height: 20, marginTop: 1, borderRadius: 5, borderWidth: 1.5, borderColor: on ? t.brand1 : base.line, backgroundColor: on ? t.brand1 : undefined, alignItems: 'center', justifyContent: 'center' }}>
        {on && <Text style={{ color: t.brand1Text, fontSize: 12, fontWeight: '700' }}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontWeight: '600', fontSize: 14, color: base.ink }}>{label}</Text>
        <Muted>{desc}</Muted>
      </View>
    </Pressable>
  );
}

// 380 / 310 "Sync Folder": the job's linked OneDrive folder — Change / Unlink, 🔄 Manual Sync (new top-level files
// pulled into Drawings; uploads here already push out), when it last synced, and a warning when the company's
// connection needs reconnecting.
type SyncSite = { id: string; onedrive_folder_id?: string | null; onedrive_folder_name?: string | null; onedrive_drive_id?: string | null; onedrive_last_synced_at?: string | null };
function SyncFolderCard({ site, full }: { site: SyncSite; full: boolean }) {
  const { me } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: od } = useOneDriveStatus(me?.org_id);
  const { data: packSettings } = useJobPackSettings(me?.org_id);
  const [busy, setBusy] = useState('');
  // A drop-down, closed to start (Andy, 20 Nov 2026: "make the one drive sync folder a drop down folder closed by default").
  const [open, setOpen] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['sites'] });
  const sync = async () => {
    if (!me || !site.onedrive_folder_id) return;
    setBusy('Syncing…');
    try {
      toast(await syncSiteFolder(me, site, (m) => setBusy(m)));
      refresh(); void qc.invalidateQueries({ queryKey: ['drawings'] });
    } finally { setBusy(''); }
  };
  return (
    <>
    <Toggle title={`☁️ OneDrive Sync Folder — ${site.onedrive_folder_name ? `📁 ${site.onedrive_folder_name}` : 'Not Linked'}${od?.needs_reconnect ? ' ⚠' : ''}`} open={open} onPress={() => setOpen(!open)} />
    {open && (
    <Card>
      {/* The job's documents, moved here from the project page (Andy, 20 Nov 2026: "move the documents row in the projects
          page into the settings page as a item there. it doesnt need to be a row"). */}
      {!!site.onedrive_folder_id && (me?.role === 'pm' || me?.role === 'admin') && <View style={{ alignItems: 'center', marginBottom: 6 }}><Button small title="📂 Open The Job's Documents" onPress={() => router.push(`/sites/${site.id}/documents` as never)} /></View>}
      {od?.needs_reconnect && <Muted style={{ color: base.warn, marginTop: 6 }}>OneDrive isn&apos;t syncing at the moment — the company connection needs reconnecting by an admin (Admin Centre › Integrations).</Muted>}
      <Muted style={{ marginVertical: 6 }}>{site.onedrive_folder_name ? `📁 ${site.onedrive_folder_name} — photos, drawings and exports sync there` : "Not linked — link the job's real OneDrive folder so photos and exports sync there."}</Muted>
      {full && !!packSettings?.enabled && (!site.onedrive_folder_id || !!(site as { job_pack?: unknown }).job_pack) && <Button kind={site.onedrive_folder_id ? 'ghost' : undefined} title={site.onedrive_folder_id ? '📦 Fill in anything missing from the job pack' : '📦 Set up job pack folder'} onPress={async () => {
        const r = await setupJobPack(site.id);
        if ('error' in r) { toast(r.error); return; }
        toast(r.failed.length ? `Folder made, but these didn’t go across: ${r.failed.join(', ')}` : `Job pack made: ${r.made} folders, ${r.copied} documents`); refresh();
      }} />}
      {full && <Button kind="ghost" title={site.onedrive_folder_name ? 'Change Folder' : 'Link Folder'} onPress={() => router.push({ pathname: '/pm/onedrive-pick', params: { target: 'progress', id: site.id } } as never)} />}
      {full && !!site.onedrive_folder_id && (
        <>
          <Button kind="ghost" title="Unlink Folder" onPress={async () => {
            if (!(await confirmAsk(`Unlink "${site.onedrive_folder_name || 'this folder'}"? Nothing is deleted — new photos and files just stop syncing there.`, 'Unlink'))) return;
            toast((await unlinkFolder('progress', site.id)) ? 'Folder unlinked' : 'Could not unlink — try again.'); refresh();
          }} />
          <Button kind="ghost" busy={!!busy} title={busy || '🔄 Manual Sync (pull new files in, push local files out)'} onPress={() => void sync()} />
        </>
      )}
      {!!site.onedrive_last_synced_at && <Muted style={{ marginTop: 4 }}>Last synced {new Date(site.onedrive_last_synced_at).toLocaleString('en-GB')}</Muted>}
    </Card>
    )}
    </>
  );
}
