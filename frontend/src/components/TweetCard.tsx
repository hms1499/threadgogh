'use client';

import { useState, useEffect, type CSSProperties } from 'react';
import { Typography, Button, Flex, App, Input } from 'antd';
import { CopyOutlined, CheckOutlined, EditOutlined, DeleteOutlined, TwitterOutlined, RedoOutlined } from '@ant-design/icons';
import { intentUrl } from '@/lib/postToX';

const { Paragraph, Text } = Typography;

export function TweetCard({ text, index, total, onEdit, onDelete, onReroll, rerolling }: {
  text: string; index: number; total: number;
  onEdit?: (index: number, draft: string) => void;
  onDelete?: (index: number) => void;
  onReroll?: (index: number) => void;
  rerolling?: boolean;
}) {
  const { message } = App.useApp();
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  // While editing, length signals track the draft so the counter/over-frame
  // stay live as the user types.
  const value = editing ? draft : text;
  const over = value.length > 280;

  function startEdit() {
    setDraft(text);
    setEditing(true);
  }
  function commitEdit() {
    onEdit?.(index, draft); // applyEdit reverts on empty/whitespace
    setEditing(false);
  }
  function cancelEdit() {
    setEditing(false);
  }

  // A delete reorders the (index-keyed) list and feeds this instance a
  // different `text` by key; a regenerate replaces every text. Drop any
  // in-flight edit when the underlying text changes so a stale draft can't be
  // committed onto the wrong tweet.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEditing(false);
    setDraft(text);
  }, [text]);

  // Each painting is brushed in a beat after the previous one — gallery-style stagger.
  // The delay is a custom property so the sheen pseudo-element inherits it too.
  return (
    <div className="vg-paint" style={{ '--paint-delay': `${index * 0.1}s` } as CSSProperties}>
      <div className={`vg-frame${over ? ' vg-frame--over' : ''}`}>
      <div className="vg-frame__canvas">
        {/* Museum plate label + character counter */}
        <Flex justify="space-between" align="center" style={{ marginBottom: 10 }}>
          <Text className="vg-plate">
            Plate {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </Text>
          <Text
            className="tp-mono"
            style={{
              fontSize: 11,
              color: over ? 'var(--vg-error)' : 'var(--vg-faint)',
              background: over ? 'var(--vg-error-bg)' : 'var(--vg-pill-bg)',
              padding: '2px 8px',
              borderRadius: 6,
              border: `1px solid ${over ? 'var(--vg-error-border)' : 'var(--vg-pill-border)'}`,
            }}
          >
            {value.length}/280
          </Text>
        </Flex>

        {editing ? (
          <Input.TextArea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPressEnter={(e) => {
              // Cmd/Ctrl+Enter commits; plain Enter inserts a newline (tweets are multi-line).
              if (e.metaKey || e.ctrlKey) { e.preventDefault(); commitEdit(); }
            }}
            onKeyDown={(e) => { if (e.key === 'Escape') cancelEdit(); }}
            autoSize={{ minRows: 2 }}
            aria-label={`Edit tweet ${index + 1}`}
            style={{
              margin: '0 0 12px',
              fontSize: 15,
              lineHeight: 1.65,
              color: 'var(--vg-canvas)',
            }}
          />
        ) : (
          <Paragraph
            style={{
              whiteSpace: 'pre-wrap',
              margin: '0 0 12px',
              fontSize: 15,
              lineHeight: 1.65,
              color: 'var(--vg-canvas)',
            }}
          >
            {text}
          </Paragraph>
        )}

        {/* Artist's signature + copy */}
        <Flex justify="space-between" align="center">
          <Text className="vg-signature">Vincent&nbsp;✦</Text>
          <Flex gap={4} align="center">
            {editing ? (
              <Button
                size="small"
                type="text"
                onClick={commitEdit}
                style={{ color: 'var(--vg-success)', fontSize: 12 }}
              >
                Done
              </Button>
            ) : (
              <>
                {onDelete && (
                  <Button
                    size="small"
                    type="text"
                    icon={<DeleteOutlined />}
                    onClick={() => onDelete(index)}
                    style={{ color: 'var(--vg-faint)', fontSize: 12 }}
                    aria-label="Delete tweet"
                  />
                )}
                {onReroll && (
                  <Button
                    size="small"
                    type="text"
                    icon={<RedoOutlined />}
                    loading={rerolling}
                    onClick={() => onReroll(index)}
                    style={{ color: 'var(--vg-faint)', fontSize: 12 }}
                    aria-label={`Re-roll tweet ${index + 1}`}
                  >
                    Re-roll
                  </Button>
                )}
                {onEdit && (
                  <Button
                    size="small"
                    type="text"
                    icon={<EditOutlined />}
                    onClick={startEdit}
                    style={{ color: 'var(--vg-faint)', fontSize: 12 }}
                  >
                    Edit
                  </Button>
                )}
                <Button
                  size="small"
                  type="text"
                  icon={<TwitterOutlined />}
                  style={{ color: 'var(--vg-faint)', fontSize: 12 }}
                  onClick={() => window.open(intentUrl(text), '_blank', 'noopener,noreferrer')}
                  aria-label={`Post tweet ${index + 1} to X`}
                >
                  Post
                </Button>
                <Button
                  size="small"
                  type="text"
                  icon={copied ? <CheckOutlined /> : <CopyOutlined />}
                  style={{ color: copied ? 'var(--vg-success)' : 'var(--vg-faint)', fontSize: 12 }}
                  onClick={async () => {
                    await navigator.clipboard.writeText(text);
                    message.success('Tweet copied');
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1400);
                  }}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </>
            )}
          </Flex>
        </Flex>
      </div>
      </div>
    </div>
  );
}
