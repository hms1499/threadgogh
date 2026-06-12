import {
  fetchCallReadOnlyFunction, Cl, cvToJSON, type ClarityValue,
} from '@stacks/transactions';
import { CONTRACT, STACKS_NETWORK } from './config';

export type Receipt = {
  payer: string;
  amount: bigint;
  token: 'STX' | 'SBTC';
  paidAt: bigint;
};

export function parseReceipt(cv: ClarityValue): Receipt | null {
  const json = cvToJSON(cv);
  if (!json.value) return null; // none
  const t = json.value.value as Record<string, { value: string }>;
  return {
    payer: t['payer'].value,
    amount: BigInt(t['amount'].value),
    token: t['token'].value as 'STX' | 'SBTC',
    paidAt: BigInt(t['paid-at'].value),
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
