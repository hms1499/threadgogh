'use client';

import { Steps, Alert, Typography, Flex } from 'antd';
import { ExportOutlined } from '@ant-design/icons';
import { explorerTxUrl } from '@/lib/config';
import { VanGoghLoader } from './VanGoghLoader';

const LOADER_LABEL: Partial<Record<Phase, string>> = {
  quoting: 'Requesting a quote…',
};

export type Phase =
  | 'idle' | 'quoting' | 'awaiting-signature'
  | 'confirming' | 'generating' | 'recover' | 'done' | 'error';

const PHASE_STEP: Record<Phase, number> = {
  idle: -1,
  quoting: 0,
  'awaiting-signature': 1,
  confirming: 2,
  generating: 3,
  recover: -1,
  done: 4,
  error: -1,
};

const STEP_ITEMS = [
  { title: 'Quote',    content: 'HTTP 402' },
  { title: 'Sign',     content: 'Wallet' },
  { title: 'Confirm',  content: 'On-chain' },
  { title: 'Generate', content: 'AI' },
];

export function PaymentStatus({ phase, txid, error }: {
  phase: Phase; txid?: string; error?: string;
}) {
  if (phase === 'idle' || phase === 'done') return null;

  return (
    <div
      className="vg-card tp-rise"
      style={{ borderRadius: 12, padding: '16px 18px' }}
    >
      <Flex vertical gap={14}>
        {phase === 'quoting' && (
          <VanGoghLoader label={LOADER_LABEL[phase]} />
        )}

        {phase === 'error' ? (
          <Alert type="error" showIcon title={error ?? 'Something went wrong'} />
        ) : phase === 'recover' ? (
          <Alert type="warning" showIcon title={error ?? 'Payment is still confirming — your invoice is saved.'} />
        ) : (
          <Steps
            size="small"
            responsive
            current={PHASE_STEP[phase]}
            status="process"
            items={STEP_ITEMS}
          />
        )}

        {txid && (
          <Typography.Link
            className="tp-mono"
            href={explorerTxUrl(txid)}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: 'var(--vg-muted)' }}
          >
            {txid.slice(0, 10)}…{txid.slice(-8)} <ExportOutlined />
          </Typography.Link>
        )}
      </Flex>
    </div>
  );
}
