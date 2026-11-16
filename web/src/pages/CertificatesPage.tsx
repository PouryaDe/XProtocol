import React, { useEffect, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useUi } from '../i18n/context';
import { Button, EmptySonar, Input, PageHead, Select } from '../components/UiPrimitives';
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
  const [loaded, setLoaded] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [nodeId, setNodeId] = useState('1');
  const [domainOrIp, setDomainOrIp] = useState('');
  const [certType, setCertType] = useState<'letsencrypt' | 'ca'>('letsencrypt');
  const [error, setError] = useState('');
  const isFa = lang === 'fa';

  const load = async () => {
    const [cRes, nRes] = await Promise.all([
      apiFetch<{ certificates: CertItem[] }>('/certificates'),
      apiFetch<{ nodes: { id: number; name: string }[] }>('/nodes').catch(() => ({ nodes: [] })),
    ]);
    setCerts(cRes.certificates);
    setNodes(nRes.nodes);
    if (nRes.nodes.length > 0 && !nRes.nodes.some((n) => String(n.id) === nodeId)) {
      setNodeId(String(nRes.nodes[0].id));
    }
    setLoaded(true);
  };

  useEffect(() => {
    void load();
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
      setDomainOrIp('');
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  };

  const renderNodeLabel = (nodeName: string) => {
    if (!nodeName || nodeName === 'Main server' || nodeName === 'localhost') {
      return isFa ? 'این سرور' : 'This server';
    }
    return nodeName;
  };

  const renderKindLabel = (kind: string) => {
    if (kind === 'letsencrypt') return "Let's Encrypt";
    if (kind === 'ca') return isFa ? 'مرجع گواهی XProtocol' : 'XProtocol CA';
    return kind;
  };

  const renderStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'valid' || s === 'ok') {
      return <span className="tag tag-active cert-tag">{isFa ? 'معتبر' : 'Valid'}</span>;
    }
    if (s === 'pending' || s === 'issuing' || s === 'being_issued') {
      return <span className="tag cert-tag cert-tag-warn">{isFa ? 'در حال صدور' : 'Being issued'}</span>;
    }
    if (s === 'expiring') {
      return <span className="tag cert-tag cert-tag-warn">{isFa ? 'به‌زودی منقضی می‌شود' : 'Expires soon'}</span>;
    }
    if (s === 'expired' || s === 'error' || s === 'failed') {
      return (
        <span className="tag tag-expired cert-tag">
          {s === 'expired' ? (isFa ? 'منقضی‌شده' : 'Expired') : isFa ? 'تمدید ناموفق' : 'Renewal failed'}
        </span>
      );
    }
    return <span className="tag tag-disabled cert-tag">{status}</span>;
  };

  const renderActions = (c: CertItem) => {
    const inUse = c.usedByInbounds.length > 0;
    const isPending = c.status.toLowerCase() === 'pending';
    const canRenew = !isPending && (c.certType === 'letsencrypt' || c.autoRenew);
    return (
      <span className="cert-actions">
        {canRenew && (
          <Button
            size="sm"
            onClick={async () => {
              await apiFetch(`/certificates/${c.id}/renew`, { method: 'POST' });
              void load();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t.certificates.renewNow}
          </Button>
        )}
        <button
          type="button"
          className="cert-btn-del"
          disabled={inUse}
          title={inUse ? (isFa ? 'در حال استفاده در اینباندها است؛ ابتدا از آن‌ها حذف کنید.' : 'Used by inbounds. Remove it from them first.') : undefined}
          onClick={async () => {
            try {
              await apiFetch(`/certificates/${c.id}`, { method: 'DELETE' });
              void load();
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Cannot delete');
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{t.common.delete}</span>
        </button>
      </span>
    );
  };

  const emptyText = isFa
    ? 'هنوز گواهی‌ای ثبت نشده است. وقتی پنل HTTPS داشته باشد یا اینباندی از گواهی استفاده کند، اینجا نمایش داده می‌شود.'
    : 'No certificates yet. They appear here once the panel has HTTPS or an inbound uses a certificate.';

  const footNote = isFa
    ? "گواهی‌های تمدیدشده‌ی Let's Encrypt بدون قطع شدن کاربران متصل، به سرورهای IKEv2 در حال اجرا می‌رسند."
    : "Renewed Let's Encrypt certificates reach running IKEv2 servers without dropping connected users.";

  return (
    <div className="page">
      <PageHead
        title={t.certificates.title}
        sub={
          isFa
            ? 'گواهی HTTPS پنل و گواهی پشت هر اینباند OpenConnect و IKEv2، همراه با تاریخ انقضا و وضعیت تمدید.'
            : "The panel's HTTPS certificate and the certificate behind every OpenConnect and IKEv2 inbound, with expiry and renewal."
        }
        actions={
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4" />
            {t.certificates.newCert}
          </Button>
        }
      />

      {loaded && certs.length === 0 ? (
        <div className="cert-empty-box">
          <EmptySonar text={emptyText} />
        </div>
      ) : certs.length > 0 ? (
        <>
          <div className="table-wrap adm-table">
            <table className="table">
              <thead>
                <tr>
                  <th>{isFa ? 'نام / نشانی' : 'Name / address'}</th>
                  <th>{isFa ? 'نوع' : 'Type'}</th>
                  <th>{isFa ? 'استفاده‌شده در' : 'Used by'}</th>
                  <th>{isFa ? 'انقضا' : 'Expires'}</th>
                  <th>{isFa ? 'تمدید' : 'Renewal'}</th>
                  <th>{isFa ? 'وضعیت' : 'Status'}</th>
                  <th className="col-actions">
                    <span className="sr-only">{t.common.actions}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {certs.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong dir="ltr">{c.domainOrIp || c.name}</strong>
                      <div className="faint small">{renderNodeLabel(c.nodeName)}</div>
                    </td>
                    <td>{renderKindLabel(c.certType)}</td>
                    <td>
                      {c.usedByInbounds.length > 0 ? (
                        c.usedByInbounds.map((i) => i.name).join(', ')
                      ) : (
                        <span className="faint">{isFa ? 'بدون اینباند' : 'No inbound'}</span>
                      )}
                    </td>
                    <td className="num">
                      {c.status.toLowerCase() === 'pending' || !c.expiresAt
                        ? '—'
                        : formatDateTime(c.expiresAt, lang)}
                    </td>
                    <td>
                      {c.autoRenew || c.certType === 'letsencrypt'
                        ? isFa
                          ? 'خودکار'
                          : 'Automatic'
                        : isFa
                          ? 'غیرخودکار'
                          : 'Not automatic'}
                    </td>
                    <td>{renderStatusBadge(c.status)}</td>
                    <td className="col-actions">{renderActions(c)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="adm-cards" aria-label={t.certificates.title}>
            {certs.map((c) => (
              <li key={c.id} className="adm-card">
                <div className="ac-head">
                  <div className="ac-name">
                    <strong dir="ltr">{c.domainOrIp || c.name}</strong>
                    <span className="faint small">
                      {renderNodeLabel(c.nodeName)} · {renderKindLabel(c.certType)}
                    </span>
                  </div>
                  {renderStatusBadge(c.status)}
                </div>
                <dl className="ac-meta">
                  <div>
                    <dt>{isFa ? 'انقضا' : 'Expires'}</dt>
                    <dd className="num">
                      {c.status.toLowerCase() === 'pending' || !c.expiresAt
                        ? '—'
                        : formatDateTime(c.expiresAt, lang)}
                    </dd>
                  </div>
                  <div>
                    <dt>{isFa ? 'تمدید' : 'Renewal'}</dt>
                    <dd>
                      {c.autoRenew || c.certType === 'letsencrypt'
                        ? isFa
                          ? 'خودکار'
                          : 'Automatic'
                        : isFa
                          ? 'غیرخودکار'
                          : 'Not automatic'}
                    </dd>
                  </div>
                  <div className="ac-wide">
                    <dt>{isFa ? 'استفاده‌شده در' : 'Used by'}</dt>
                    <dd>
                      {c.usedByInbounds.length > 0
                        ? c.usedByInbounds.map((i) => i.name).join(', ')
                        : isFa
                          ? 'بدون اینباند'
                          : 'No inbound'}
                    </dd>
                  </div>
                </dl>
                {renderActions(c)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="faint small">{footNote}</p>

      <Drawer open={modalOpen} onClose={() => setModalOpen(false)} title={t.certificates.newCert}>
        <form onSubmit={createCert} className="space-y-4">
          <Select label={t.common.node} value={nodeId} onChange={(e) => setNodeId(e.target.value)}>
            {nodes.map((n) => (
              <option key={n.id} value={String(n.id)}>
                {n.name}
              </option>
            ))}
          </Select>
          <Select
            label={isFa ? 'نوع گواهی' : 'Type'}
            value={certType}
            onChange={(e) => setCertType(e.target.value as 'letsencrypt' | 'ca')}
          >
            <option value="letsencrypt">Let's Encrypt</option>
            <option value="ca">XProtocol Internal CA</option>
          </Select>
          <Input
            label={isFa ? 'دامنه (یا خالی برای IPv4 نود)' : 'Domain or leave empty for node IPv4'}
            value={domainOrIp}
            onChange={(e) => setDomainOrIp(e.target.value)}
            placeholder="vpn.example.com"
          />
          {error && <div className="text-xs text-red-400">{error}</div>}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setModalOpen(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="primary">
              {t.common.create}
            </Button>
          </div>
        </form>
      </Drawer>
    </div>
  );
}
