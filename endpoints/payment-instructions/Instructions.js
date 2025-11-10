const { createHandler } = require('@app-core/server');
const { appLogger } = require('@app-core/logger');
const { processTransactionService, STATUS_CODES } = require('@app/services/payment-instructions');
const { PaymentInstructionsMessages } = require('@app/messages');

// Payment Instructions Endpoint; Processes financial transaction instructions in structured format
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

    try {
      // Process transaction using the service function
      const response = await processTransactionService(payload);

      // Determine HTTP status code
      const httpStatus =
        response.status === 'failed'
          ? helpers.http_statuses.HTTP_400_BAD_REQUEST
          : helpers.http_statuses.HTTP_200_OK;

      return {
        status: httpStatus,
        data: response,
      };
    } catch (error) {
      // Handle any unexpected errors
      return {
        status: helpers.http_statuses.HTTP_500_INTERNAL_SERVER_ERROR,
        data: {
          type: null,
          amount: null,
          currency: null,
          debit_account: null,
          credit_account: null,
          execute_by: null,
          status: 'failed',
          status_reason: 'Internal server error',
          status_code: 'INTERNAL_ERROR',
          accounts: [],
        },
      };
    }
  },
});
