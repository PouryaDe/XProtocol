import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useUi } from '../i18n/context';
import { Button, Card, Input, Select, StatusPill } from '../components/UiPrimitives';
import { Drawer } from '../components/Drawer';

interface CertItem {
  id: number;
  nodeId: number;
  nodeName: string;
  name: string;
  domainOrIp: string;
  certType: string;
  status: string;
  expiresAt: string;
  autoRenew: boolean;
  usedByInbounds: { id: number; name: string }[];
}

export function CertificatesPage() {
  const { t, lang } = useUi();
  const [certs, setCerts] = useState<CertItem[]>([]);
  const [nodes, setNodes] = useState<{ id: number; name: string }[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [nodeId, setNodeId] = useState('1');
  const [domainOrIp, setDomainOrIp] = useState('');
  const [certType, setCertType] = useState<'letsencrypt' | 'ca'>('letsencrypt');
  const [error, setError] = useState('');

  const load = async () => {
    const [cRes, nRes] = await Promise.all([
      apiFetch<{ certificates: CertItem[] }>('/certificates'),
      apiFetch<{ nodes: { id: number; name: string }[] }>('/nodes'),
    ]);
    setCerts(cRes.certificates);
    setNodes(nRes.nodes);
  };

  useEffect(() => {
    load();
  }, []);

  const createCert = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/certificates', {
        method: 'POST',
        body: JSON.stringify({ nodeId: Number(nodeId), domainOrIp, certType }),
      });
      setModalOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-(--text-primary)">{t.certificates.title}</h1>
        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" />
          {t.certificates.newCert}
        </Button>
      </div>

      <div className="grid gap-3">
        {certs.map((c) => (
          <Card key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-(--accent-soft) text-(--accent)">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-(--text-primary)">{c.name}</span>
                  <StatusPill tone={c.status === 'valid' ? 'green' : 'amber'} label={c.status} />
                </div>
                <div className="text-xs text-(--text-muted)">
                  {c.nodeName} · {c.certType} · {t.certificates.expires}: {formatDateTime(c.expiresAt, lang)}
                  {c.usedByInbounds.length > 0 && ` · Used by ${c.usedByInbounds.map((i) => i.name).join(', ')}`}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                onClick={async () => {
                  await apiFetch(`/certificates/${c.id}/renew`, { method: 'POST' });
                  load();
                }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t.certificates.renewNow}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  try {
                    await apiFetch(`/certificates/${c.id}`, { method: 'DELETE' });
                    load();
                  } catch (err) {
                    alert(err instanceof Error ? err.message : 'Cannot delete');
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Drawer open={modalOpen} onClose={() => setModalOpen(false)} title={t.certificates.newCert}>
        <form onSubmit={createCert} className="space-y-4">
          <Select label={t.common.node} value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
            {nodes.map((n) => (
              <option key={n.id} value={String(n.id)}>
                {n.name}
              </option>
            ))}
          </Select>
          <Select label="Type" value={certType} onChange={(e) => setCertType(e.target.value as 'letsencrypt' | 'ca')}>
            <option value="letsencrypt">Let's Encrypt</option>
            <option value="ca">Ovira Internal CA</option>
          </Select>
          <Input
            label="Domain or leave empty for node IPv4"
            value={domainOrIp}
            onChange={(e) => setDomainOrIp(e.target.value)}
            placeholder="vpn.example.com"
          />
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setModalOpen(false)}>{t.common.cancel}</Button>
            <Button type="submit" variant="primary">{t.common.create}</Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
