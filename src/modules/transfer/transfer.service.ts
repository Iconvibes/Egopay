import { TransactionStatus, TransactionType } from '@prisma/client';
import { Errors } from '../../lib/appError.js';
import { transactionDto } from '../../lib/dto.js';
import { prisma } from '../../lib/prisma.js';
import { notifyTransferOutcome } from '../notification/notification.service.js';
import { syncAccountBalanceBestEffort } from '../../services/balanceSync.js';
import { NibssError, nibssClient } from '../../services/nibss/index.js';
import * as accountService from '../account/account.service.js';

export interface TransferInput {
  to: string;
  amount: number;
  narration?: string;
}

export async function nameEnquiry(accountNumber: string) {
  let res;
  try {
    res = await nibssClient.nameEnquiry(accountNumber);
  } catch (err) {
    if (err instanceof NibssError) {
      if (err.statusCode === 404) {
        throw Errors.notFound('Recipient account not found in the banking network', 'RECIPIENT_NOT_FOUND');
      }
      if (err.statusCode === 401) throw Errors.badGateway('Fintech authentication with the account service failed');
      if (err.code === 'TIMEOUT') throw Errors.gatewayTimeout('The name enquiry timed out. Please try again.');
      if (err.code === 'NETWORK') throw Errors.badGateway('The name enquiry service is unreachable. Please try again later.');
      throw Errors.badGateway(`The name enquiry service returned an error (${err.message})`);
    }
    throw err;
  }

  if (!res.accountName) {
    throw Errors.badRequest('Unable to confirm recipient details', 'RECIPIENT_UNCONFIRMED');
  }
  return {
    accountNumber: res.accountNumber,
    accountName: res.accountName,
    bankCode: res.bankCode ?? null,
    bankName: res.bankName ?? null,
  };
}

/**
 * Initiate a transfer. The sender is ALWAYS derived from the authenticated
 * session — a client can never choose which account to debit.
 *
 * Flow:
 *  1. Recipient Name Enquiry (mandatory, per the NibssByPhoenix requirements)
 *  2. Local PENDING transaction created first, so every attempt is tracked
 *  3. External POST /api/transfer
 *  4. Local record updated ONLY from the external response:
 *       - upstream 2xx + reference + SUCCESS  -> SUCCESS
 *       - upstream 4xx/5xx response           -> FAILED (transfer did not execute)
 *       - timeout / network error             -> stays PENDING (outcome unknown)
 */
export async function transfer(customerId: string, input: TransferInput) {
  const account = await accountService.requireAccount(customerId);
  if (account.accountNumber === input.to) {
    throw Errors.badRequest('You cannot transfer to your own account', 'SELF_TRANSFER');
  }

  // --- Step 1: recipient verification (name enquiry) ---------------------
  const recipient = await nameEnquiry(input.to);

  const type: TransactionType =
    recipient.bankCode && account.bankCode && recipient.bankCode === account.bankCode
      ? TransactionType.INTRABANK
      : TransactionType.INTERBANK;

  // --- Step 2: local PENDING record --------------------------------------
  const tx = await prisma.transaction.create({
    data: {
      customerId,
      fromAccount: account.accountNumber,
      toAccount: input.to,
      recipientName: recipient.accountName,
      amount: input.amount,
      type,
      narration: input.narration ?? null,
    },
  });

  // --- Step 3: external transfer ------------------------------------------
  let result;
  try {
    result = await nibssClient.transfer(account.accountNumber, input.to, input.amount);
  } catch (err) {
    if (err instanceof NibssError) {
      if (err.statusCode) {
        // The upstream answered with an error: the transfer did not execute.
        await markFailed(tx.id, err.message);
        // Awaited so the alert survives serverless environments (Vercel),
        // where the process is frozen the instant the response is sent.
        await notifyTransferOutcome({
          customerId: tx.customerId,
          amount: Number(tx.amount),
          counterparty: tx.recipientName ?? input.to,
          status: 'FAILED',
        });
        if (err.statusCode === 400 && /insufficient/i.test(err.message)) {
          throw Errors.badRequest(err.message, 'INSUFFICIENT_FUNDS');
        }
        if (err.statusCode === 404) {
          throw Errors.notFound('Recipient account not found in the banking network', 'RECIPIENT_NOT_FOUND');
        }
        if (err.statusCode === 401) throw Errors.badGateway('Fintech authentication with the transfer service failed');
        throw Errors.badRequest(`Transfer rejected: ${err.message}`, 'TRANSFER_REJECTED');
      }
      // No HTTP response: outcome unknown. Keep PENDING — we never guess.
      if (err.code === 'TIMEOUT') {
        throw Errors.gatewayTimeout(
          'The transfer request timed out. The outcome is unknown — check the transaction status later.',
          'TRANSFER_OUTCOME_UNKNOWN',
        );
      }
      throw Errors.badGateway(
        'The transfer service is unreachable. The outcome is unknown — check the transaction status later.',
        'TRANSFER_OUTCOME_UNKNOWN',
      );
    }
    throw err;
  }

  // --- Step 4: update local state from the external response --------------
  if (!result.reference) {
    throw Errors.badGateway(
      'The transfer service returned an invalid response. Check the transaction status later.',
      'TRANSFER_OUTCOME_UNKNOWN',
    );
  }

  const externalStatus = (result.status ?? 'PENDING').toUpperCase();
  const status: TransactionStatus =
    externalStatus === 'SUCCESS'
      ? TransactionStatus.SUCCESS
      : externalStatus === 'FAILED'
        ? TransactionStatus.FAILED
        : TransactionStatus.PENDING;

  const updated = await prisma.transaction.update({
    where: { id: tx.id },
    data: {
      reference: result.reference,
      status,
      errorMessage: status === TransactionStatus.FAILED ? 'Transfer failed' : null,
      completedAt: status === TransactionStatus.PENDING ? null : new Date(),
    },
  });

  // Refresh the local balance cache from the ledger (best effort). This also
  // reconciles incoming payments, keeping the cache an accurate baseline for
  // future credit detection.
  // Awaited so cache refresh + alerts survive serverless environments
  // (Vercel), where the process is frozen the instant the response is sent.
  await syncAccountBalanceBestEffort(account.id, account.accountNumber);

  if (status === TransactionStatus.SUCCESS) {
    // Debit alert — mirrors the incoming-payment alerts.
    await notifyTransferOutcome({
      customerId: tx.customerId,
      amount: Number(tx.amount),
      counterparty: tx.recipientName ?? input.to,
      status: 'SUCCESS',
    });
    return { message: 'Transfer successful', transaction: transactionDto(updated) };
  }
  if (status === TransactionStatus.FAILED) {
    await notifyTransferOutcome({
      customerId: tx.customerId,
      amount: Number(tx.amount),
      counterparty: tx.recipientName ?? input.to,
      status: 'FAILED',
    });
    throw Errors.badRequest('Transfer failed', 'TRANSFER_FAILED', {
      transaction: transactionDto(updated),
    });
  }
  return { message: 'Transfer submitted and pending confirmation', transaction: transactionDto(updated) };
}

async function markFailed(transactionId: string, message: string): Promise<void> {
  await prisma.transaction.update({
    where: { id: transactionId },
    data: { status: TransactionStatus.FAILED, errorMessage: message, completedAt: new Date() },
  });
}