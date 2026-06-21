'use client';

import { useState, useEffect } from 'react';
import { Modal, Button, Typography, Flex } from 'antd';
import { TwitterOutlined, ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons';
import { withThreadNumbers, intentUrl } from '@/lib/postToX';

const { Paragraph, Text } = Typography;

// Guided "post the whole thread to X" flow. The X compose-intent can't pre-link a
// reply, so we walk the user one tweet at a time (numbered i/n) and tell them to
// reply each new tweet to the previous one to build the chain.
export function PostThreadModal({ thread, chained = true, open, onClose }: {
  thread: string[]; chained?: boolean; open: boolean; onClose: () => void;
}) {
  const numbered = withThreadNumbers(thread, chained);
  const n = numbered.length;
  const [step, setStep] = useState(0);
  const [openedCurrent, setOpenedCurrent] = useState(false);

  // Restart the walkthrough whenever the modal (re)opens.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStep(0);
    setOpenedCurrent(false);
  }, [open]);

  const current = numbered[step] ?? '';
  const over = current.length > 280;
  const isLast = step === n - 1;

  function openCurrent() {
    window.open(intentUrl(current), '_blank', 'noopener,noreferrer');
    setOpenedCurrent(true);
  }
  function go(delta: number) {
    setStep((s) => Math.min(n - 1, Math.max(0, s + delta)));
    setOpenedCurrent(false);
  }

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title="Post thread to X"
      destroyOnHidden
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12, fontSize: 13 }}>
        X opens each tweet in a new tab — post it, then{' '}
        <Text strong style={{ fontSize: 13 }}>reply to it</Text> with the next to build the thread.
      </Text>

      <Flex justify="space-between" align="center" style={{ marginBottom: 6 }}>
        <Text className="vg-plate">Tweet {step + 1} / {n}</Text>
        <Text
          className="tp-mono"
          style={{ fontSize: 11, color: over ? 'var(--vg-error)' : 'var(--vg-faint)' }}
        >
          {current.length}/280
        </Text>
      </Flex>

      <Paragraph
        style={{
          whiteSpace: 'pre-wrap',
          padding: '12px 14px',
          borderRadius: 10,
          background: 'var(--vg-pill-bg)',
          border: `1px solid ${over ? 'var(--vg-error-border)' : 'var(--vg-pill-border)'}`,
          fontSize: 14,
          lineHeight: 1.6,
          margin: '0 0 16px',
        }}
      >
        {current}
      </Paragraph>

      <Button
        type="primary"
        block
        icon={<TwitterOutlined />}
        onClick={openCurrent}
        style={{ marginBottom: 12 }}
      >
        {openedCurrent ? 'Opened — reopen on X' : `Open tweet ${step + 1} on X`}
      </Button>

      <Flex justify="space-between" align="center">
        <Button
          type="text"
          size="small"
          icon={<ArrowLeftOutlined />}
          disabled={step === 0}
          onClick={() => go(-1)}
        >
          Back
        </Button>
        {isLast ? (
          <Button type="text" size="small" onClick={onClose}>
            Done
          </Button>
        ) : (
          <Button
            type="text"
            size="small"
            onClick={() => go(1)}
          >
            Next <ArrowRightOutlined />
          </Button>
        )}
      </Flex>
    </Modal>
  );
}
