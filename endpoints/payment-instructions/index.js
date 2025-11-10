const { createHandler } = require('@app-core/server');
const { appLogger } = require('@app-core/logger');
const {
  parseInstruction,
  processTransaction,
  STATUS_CODES,
} = require('@app/services/payment-instructions');
const { PaymentInstructionsMessages } = require('@app/messages');

// Payment Instructions Endpoint
// POST /payment-instructions
// Processes financial transaction instructions in structured format
module.exports = createHandler({
  path: '/payment-instructions',
  method: 'post',
  middlewares: [],
  async onResponseEnd(rc, rs) {
    appLogger.info({ requestContext: rc, response: rs }, 'payment-instruction-request-completed');
  },
  async handler(rc, helpers) {
    const payload = rc.body;

    // Validate payload structure
    if (!payload || !Array.isArray(payload.accounts) || typeof payload.instruction !== 'string') {
      return {
        status: helpers.http_statuses.HTTP_400_BAD_REQUEST,
        data: {
          type: null,
          amount: null,
          currency: null,
          debit_account: null,
          credit_account: null,
          execute_by: null,
          status: 'failed',
          status_reason: PaymentInstructionsMessages.INVALID_PAYLOAD,
          status_code: STATUS_CODES.MALFORMED_INSTRUCTION,
          accounts: [],
        },
      };
    }

    // Parse instruction
    const parseResult = parseInstruction(payload.instruction);

    if (!parseResult.success) {
      const parsedData = parseResult.data || {
        type: null,
        amount: null,
        currency: null,
        debitAccount: null,
        creditAccount: null,
        executeBy: null,
      };

      // Also include any error information
      const errorInfo = parseResult.error || {
        status_reason: PaymentInstructionsMessages.MALFORMED_INSTRUCTION,
        status_code: STATUS_CODES.MALFORMED_INSTRUCTION,
      };

      return {
        status: helpers.http_statuses.HTTP_400_BAD_REQUEST,
        data: {
          type: parsedData.type,
          amount: parsedData.amount,
          currency: parsedData.currency,
          debit_account: parsedData.debitAccount,
          credit_account: parsedData.creditAccount,
          execute_by: parsedData.executeBy,
          status: 'failed',
          status_reason: errorInfo.status_reason,
          status_code: errorInfo.status_code,
          accounts: payload.accounts || [],
        },
      };
    }

    // Process transaction
    const result = processTransaction(parseResult.data, payload.accounts);

    // Determine HTTP status code
    const httpStatus =
      result.status === 'failed'
        ? helpers.http_statuses.HTTP_400_BAD_REQUEST
        : helpers.http_statuses.HTTP_200_OK;

    return {
      status: httpStatus,
      data: result,
    };
  },
});
