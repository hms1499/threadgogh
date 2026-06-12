'use client';

import { Steps, Alert, Card, Typography, Flex } from 'antd';
import { ExportOutlined } from '@ant-design/icons';

export type Phase =
  | 'idle' | 'quoting' | 'awaiting-signature'
  | 'confirming' | 'generating' | 'done' | 'error';

// Map phase -> step dang chay (0..3).
const PHASE_STEP: Record<Phase, number> = {
  idle: -1,
  quoting: 0,
  'awaiting-signature': 1,
  confirming: 2,
  generating: 3,
  done: 4,
  error: -1,
};

const STEP_ITEMS = [
  { title: 'Quote', description: 'HTTP 402' },
  { title: 'Sign', description: 'Leather/Xverse' },
  { title: 'Confirm', description: 'On-chain' },
  { title: 'Generate', description: 'AI' },
];

export function PaymentStatus({ phase, txid, error }: {
  phase: Phase; txid?: string; error?: string;
}) {
  if (phase === 'idle' || phase === 'done') return null;

  return (
    <Card variant="borderless" className="tp-rise" style={{ background: 'rgba(22,20,24,0.5)' }}>
      <Flex vertical gap={14}>
        {phase === 'error' ? (
          <Alert type="error" showIcon message={error ?? 'Something went wrong'} />
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
            href={`https://explorer.hiro.so/txid/${txid}?chain=testnet`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 13 }}
          >
            {txid.slice(0, 10)}…{txid.slice(-8)} <ExportOutlined />
          </Typography.Link>
        )}
      </Flex>
    </Card>
  );
}
