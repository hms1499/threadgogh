import {
  fetchCallReadOnlyFunction, Cl, cvToJSON, type ClarityValue,
} from '@stacks/transactions';
import { CONTRACT, STACKS_NETWORK } from './config';

export type Receipt = {
  payer: string;
  amount: bigint;
  token: 'STX' | 'SBTC';
  // burn-block-height at payment. Recorded for audit only — generation is NOT gated on
  // confirmation depth. See "Confirmation depth / reorg risk" in .claude/docs/payments.md.
  paidAt: bigint;
};

export function parseReceipt(cv: ClarityValue): Receipt | null {
  const json = cvToJSON(cv);
  if (!json.value) return null; // (none) — no receipt on-chain, i.e. unpaid

  // A present optional must wrap the expected receipt tuple. Validate the shape before
  // reading fields: drift would otherwise surface as an opaque "Cannot read properties
  // of undefined" 500. A malformed-but-present receipt must NOT become null — null means
  // "unpaid", which would strand a user who actually paid. Throw a clear error instead.
  const tuple = json.value.value;
  if (!tuple || typeof tuple !== 'object') {
    throw new Error(`malformed receipt: expected a tuple, got ${JSON.stringify(json.value)}`);
  }
  const fields = tuple as Record<string, { value?: unknown } | undefined>;
  const payer = fields['payer']?.value;
  const amount = fields['amount']?.value;
  const token = fields['token']?.value;
  const paidAt = fields['paid-at']?.value;
  if (
    typeof payer !== 'string' ||
    typeof amount !== 'string' ||
    typeof paidAt !== 'string' ||
    (token !== 'STX' && token !== 'SBTC')
  ) {
    throw new Error(`malformed receipt: ${JSON.stringify(fields)}`);
  }

  return {
    payer,
    amount: BigInt(amount),
    token,
    paidAt: BigInt(paidAt),
  };
}

export async function fetchReceipt(invoiceIdHex: string): Promise<Receipt | null> {
  const [contractAddress, contractName] = CONTRACT.split('.');
  const result = await fetchCallReadOnlyFunction({
    contractAddress,
    contractName,
    functionName: 'get-receipt',
    functionArgs: [Cl.bufferFromHex(invoiceIdHex)],
    network: STACKS_NETWORK,
    senderAddress: contractAddress,
  });
  return parseReceipt(result);
}
