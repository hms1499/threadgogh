'use client';

import { useEffect, useMemo, useState } from 'react';
import { Segmented, Button, Flex, Typography } from 'antd';
import { ThunderboltFilled } from '@ant-design/icons';
import type { PublicServiceDef } from '@/lib/services/types';
import { ServicePicker } from './ServicePicker';
import { ServiceForm } from './ServiceForm';
import { defaultParams, clientValidate } from '@/lib/services/form';

const { Text } = Typography;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      color: 'var(--vg-faint)',
      fontFamily: 'var(--font-mono)',
    }}>
      {children}
    </span>
  );
}

export type FormValues = { service: string; params: Record<string, unknown>; token: 'STX' | 'SBTC' };

// The generate card is driven by the service registry: pick a service, fill its
// dynamic fields, choose a token, submit. Falls back gracefully if the registry
// hasn't loaded — the marketplace is an enhancement, never a hard dependency.
export function ThreadForm({ services, servicesError, onSubmit, disabled }: {
  services: PublicServiceDef[];
  servicesError?: boolean;
  onSubmit: (v: FormValues) => void;
  disabled: boolean;
}) {
  const [selectedId, setSelectedId] = useState('x-thread');
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [token, setToken] = useState<'STX' | 'SBTC'>('STX');

  const selected = useMemo(
    () => services.find((s) => s.id === selectedId) ?? services[0],
    [services, selectedId],
  );

  // Seed each field to its default whenever the selected service changes (and once
  // the registry first loads). Keyed on the id so switching services resets cleanly.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selected) setParams(defaultParams(selected.fields));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const shell = { borderRadius: 14, padding: '22px 20px' } as const;

  if (servicesError) {
    return (
      <div className="vg-card" style={shell}>
        <Text type="secondary">Services unavailable — refresh to retry.</Text>
      </div>
    );
  }
  if (!selected) {
    return (
      <div className="vg-card" style={shell}>
        <Text type="secondary">Loading services…</Text>
      </div>
    );
  }

  const invalid = clientValidate(selected.fields, params) !== null;

  function submit() {
    if (clientValidate(selected.fields, params)) return;
    onSubmit({ service: selected.id, params, token });
  }

  return (
    <div className="vg-card" style={shell}>
      <Flex vertical gap={20}>
        {services.length > 1 && (
          <ServicePicker
            services={services}
            selectedId={selected.id}
            onSelect={setSelectedId}
            disabled={disabled}
          />
        )}

        <ServiceForm
          fields={selected.fields}
          params={params}
          onChange={(name, value) => setParams((p) => ({ ...p, [name]: value }))}
          disabled={disabled}
        />

        <Flex vertical gap={8}>
          <FieldLabel>Pay with</FieldLabel>
          <Segmented
            block
            value={token}
            onChange={(v) => setToken(v as 'STX' | 'SBTC')}
            options={[
              { label: '⚡ STX',  value: 'STX' },
              { label: '₿ sBTC', value: 'SBTC' },
            ]}
          />
        </Flex>

        <Button
          type="primary"
          size="large"
          block
          disabled={disabled || invalid}
          loading={disabled}
          onClick={submit}
          icon={<ThunderboltFilled />}
          className="vg-glow-btn"
          style={{ marginTop: 4, height: 48, fontSize: 15, fontWeight: 600 }}
        >
          Generate {selected.label}
        </Button>
      </Flex>
    </div>
  );
}
