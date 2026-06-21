import { describe, expect, it } from 'vitest';
import { aggregateOnChainStats, type HiroTx } from '../onchain-stats';

const payStx = (amount: string, status = 'success'): HiroTx => ({
  tx_status: status,
  tx_type: 'contract_call',
  contract_call: {
    function_name: 'pay-stx',
    function_args: [
      { name: 'invoice-id', repr: '0xabcd' },
      { name: 'amount', repr: amount },
    ],
  },
});

const paySbtc = (amount: string): HiroTx => ({
  tx_status: 'success',
  tx_type: 'contract_call',
  contract_call: {
    function_name: 'pay-sbtc',
    function_args: [
      { name: 'token', repr: 'SP...sbtc' },
      { name: 'invoice-id', repr: '0xabcd' },
      { name: 'amount', repr: amount },
    ],
  },
});

describe('aggregateOnChainStats', () => {
  it('counts pay-stx / pay-sbtc and sums amounts by token', () => {
    const txs = [payStx('u100000'), payStx('u100000'), payStx('u100000'), paySbtc('u100'), paySbtc('u250')];
    expect(aggregateOnChainStats(txs)).toEqual({ threads: 5, stxRevenue: 300000, sbtcRevenue: 350 });
  });

  it('ignores failed payments', () => {
    const txs = [payStx('u100000'), payStx('u100000', 'abort_by_response')];
    expect(aggregateOnChainStats(txs)).toEqual({ threads: 1, stxRevenue: 100000, sbtcRevenue: 0 });
  });

  it('ignores non-payment calls and the deploy tx', () => {
    const txs: HiroTx[] = [
      payStx('u100000'),
      { tx_status: 'success', tx_type: 'smart_contract' },
      { tx_status: 'success', tx_type: 'contract_call', contract_call: { function_name: 'set-prices', function_args: [] } },
    ];
    expect(aggregateOnChainStats(txs)).toEqual({ threads: 1, stxRevenue: 100000, sbtcRevenue: 0 });
  });

  it('handles an empty list', () => {
    expect(aggregateOnChainStats([])).toEqual({ threads: 0, stxRevenue: 0, sbtcRevenue: 0 });
  });

  it('counts a payment with an unparseable amount as a thread contributing 0 revenue', () => {
    const txs: HiroTx[] = [{
      tx_status: 'success', tx_type: 'contract_call',
      contract_call: { function_name: 'pay-stx', function_args: [{ name: 'invoice-id', repr: '0xabcd' }] },
    }];
    expect(aggregateOnChainStats(txs)).toEqual({ threads: 1, stxRevenue: 0, sbtcRevenue: 0 });
  });
});
