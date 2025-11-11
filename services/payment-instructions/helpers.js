const { PaymentInstructionsMessages } = require('@app/messages');

// Validation functions
function isValidAccountId(accountId) {
  if (!accountId) return false;

  for (let i = 0; i < accountId.length; i++) {
    const char = accountId[i];
    if (
      !(char >= 'a' && char <= 'z') &&
      !(char >= 'A' && char <= 'Z') &&
      !(char >= '0' && char <= '9') &&
      char !== '-' &&
      char !== '.' &&
      char !== '@'
    ) {
      return false;
    }
  }
  return true;
}

function isValidAmount(amountStr) {
  if (!amountStr) return false;

  const amount = parseInt(amountStr, 10);
  return !(Number.isNaN(amount) || amount <= 0 || amount.toString() !== amountStr);
}

function hasValidFromAccountKeywords(words) {
  return words[3].toUpperCase() === 'FROM' && words[4].toUpperCase() === 'ACCOUNT';
}

function hasValidForCreditToAccountKeywords(words) {
  return (
    words[6].toUpperCase() === 'FOR' &&
    words[7].toUpperCase() === 'CREDIT' &&
    words[8].toUpperCase() === 'TO' &&
    words[9].toUpperCase() === 'ACCOUNT'
  );
}

function hasValidToAccountKeywords(words) {
  return words[3].toUpperCase() === 'TO' && words[4].toUpperCase() === 'ACCOUNT';
}

function hasValidForDebitFromAccountKeywords(words) {
  return (
    words[6].toUpperCase() === 'FOR' &&
    words[7].toUpperCase() === 'DEBIT' &&
    words[8].toUpperCase() === 'FROM' &&
    words[9].toUpperCase() === 'ACCOUNT'
  );
}

function areSameAccounts(debitAccount, creditAccount) {
  return debitAccount === creditAccount;
}

function hasValidOnDate(words, currentIndex) {
  return currentIndex < words.length && words[currentIndex].toUpperCase() === 'ON';
}

function hasExtraWords(words, currentIndex) {
  return currentIndex < words.length;
}

function hasEnoughWords(words, minLength) {
  return words.length >= minLength;
}

function hasValidFirstWord(firstWord) {
  return firstWord === 'DEBIT' || firstWord === 'CREDIT';
}

function isFutureDate(executeDate, currentDate) {
  return executeDate > currentDate;
}

function debitAccountExists(debitAccountObj) {
  return !!debitAccountObj;
}

function creditAccountExists(creditAccountObj) {
  return !!creditAccountObj;
}

function isSupportedCurrency(currency, supportedCurrencies) {
  return supportedCurrencies.includes(currency);
}

function currenciesMatch(debitAccountObj, creditAccountObj, instructionCurrency) {
  return (
    debitAccountObj.currency === creditAccountObj.currency &&
    debitAccountObj.currency === instructionCurrency
  );
}

function hasSufficientFunds(debitAccountObj, amount) {
  return debitAccountObj.balance >= amount;
}

// Error response creators
function createMissingKeywordError(data, STATUS_CODES) {
  return {
    success: false,
    data,
    error: {
      status: 'failed',
      status_reason: PaymentInstructionsMessages.MISSING_KEYWORD,
      status_code: STATUS_CODES.MISSING_KEYWORD,
    },
  };
}

function createInvalidAmountError(data, amountStr, STATUS_CODES) {
  return {
    success: false,
    data: {
      ...data,
      amount: null,
      currency: data.currency ? data.currency.toUpperCase() : null,
    },
    error: {
      status: 'failed',
      status_reason: PaymentInstructionsMessages.INVALID_AMOUNT,
      status_code: STATUS_CODES.INVALID_AMOUNT,
    },
  };
}

function createInvalidKeywordOrderError(data, STATUS_CODES) {
  return {
    success: false,
    data,
    error: {
      status: 'failed',
      status_reason: PaymentInstructionsMessages.INVALID_ORDER,
      status_code: STATUS_CODES.INVALID_KEYWORD_ORDER,
    },
  };
}

function createInvalidAccountIdError(data, isDebitAccount, STATUS_CODES) {
  return {
    success: false,
    data,
    error: {
      status: 'failed',
      status_reason: isDebitAccount
        ? PaymentInstructionsMessages.DEBIT_ACCOUNT_INVALID
        : PaymentInstructionsMessages.CREDIT_ACCOUNT_INVALID,
      status_code: STATUS_CODES.INVALID_ACCOUNT_ID,
    },
  };
}

function createSameAccountsError(data, STATUS_CODES) {
  return {
    success: false,
    data,
    error: {
      status: 'failed',
      status_reason: PaymentInstructionsMessages.SAME_ACCOUNTS,
      status_code: STATUS_CODES.SAME_ACCOUNTS,
    },
  };
}

function createInvalidDateError(data, STATUS_CODES) {
  return {
    success: false,
    data,
    error: {
      status: 'failed',
      status_reason: PaymentInstructionsMessages.INVALID_DATE,
      status_code: STATUS_CODES.INVALID_DATE_FORMAT,
    },
  };
}

function createAccountNotFoundError(data, isDebitAccount, STATUS_CODES) {
  return {
    type: data.type,
    amount: data.amount,
    currency: data.currency,
    debit_account: data.debitAccount,
    credit_account: data.creditAccount,
    execute_by: data.executeBy,
    status: 'failed',
    status_reason: isDebitAccount
      ? PaymentInstructionsMessages.DEBIT_ACCOUNT_NOT_FOUND
      : PaymentInstructionsMessages.CREDIT_ACCOUNT_NOT_FOUND,
    status_code: STATUS_CODES.ACCOUNT_NOT_FOUND,
    accounts: data.accounts || [],
  };
}

function createUnsupportedCurrencyError(data, STATUS_CODES) {
  return {
    type: data.type,
    amount: data.amount,
    currency: data.currency,
    debit_account: data.debitAccount,
    credit_account: data.creditAccount,
    execute_by: data.executeBy,
    status: 'failed',
    status_reason: PaymentInstructionsMessages.UNSUPPORTED_CURRENCY,
    status_code: STATUS_CODES.UNSUPPORTED_CURRENCY,
    accounts: data.accounts || [],
  };
}

function createCurrencyMismatchError(data, STATUS_CODES) {
  return {
    type: data.type,
    amount: data.amount,
    currency: data.currency,
    debit_account: data.debitAccount,
    credit_account: data.creditAccount,
    execute_by: data.executeBy,
    status: 'failed',
    status_reason: PaymentInstructionsMessages.CURRENCY_MISMATCH,
    status_code: STATUS_CODES.CURRENCY_MISMATCH,
    accounts: data.accounts || [],
  };
}

function createInsufficientFundsError(data, debitAccountObj, STATUS_CODES) {
  return {
    type: data.type,
    amount: data.amount,
    currency: data.currency,
    debit_account: data.debitAccount,
    credit_account: data.creditAccount,
    execute_by: data.executeBy,
    status: 'failed',
    status_reason: `${PaymentInstructionsMessages.INSUFFICIENT_FUNDS}: has ${debitAccountObj.balance} ${data.currency}, needs ${data.amount} ${data.currency}`,
    status_code: STATUS_CODES.INSUFFICIENT_FUNDS,
    accounts: data.accounts || [],
  };
}

// Success response creators
function createSuccessResponse(data) {
  return {
    success: true,
    data,
  };
}

function createPendingTransactionResponse(data, STATUS_CODES) {
  return {
    ...data,
    status: 'pending',
    status_code: STATUS_CODES.PENDING,
    status_reason: PaymentInstructionsMessages.TRANSACTION_PENDING,
  };
}

function createSuccessfulTransactionResponse(data, STATUS_CODES) {
  return {
    ...data,
    status: 'successful',
    status_code: STATUS_CODES.SUCCESSFUL,
    status_reason: PaymentInstructionsMessages.TRANSACTION_SUCCESS,
  };
}

function createMalformedInstructionError(STATUS_CODES) {
  return {
    success: false,
    error: {
      status: 'failed',
      status_reason: PaymentInstructionsMessages.MALFORMED_INSTRUCTION,
      status_code: STATUS_CODES.MALFORMED_INSTRUCTION,
    },
  };
}

module.exports = {
  isValidAccountId,
  isValidAmount,
  hasValidFromAccountKeywords,
  hasValidForCreditToAccountKeywords,
  hasValidToAccountKeywords,
  hasValidForDebitFromAccountKeywords,
  areSameAccounts,
  hasValidOnDate,
  hasExtraWords,
  hasEnoughWords,
  hasValidFirstWord,
  isFutureDate,
  debitAccountExists,
  creditAccountExists,
  isSupportedCurrency,
  currenciesMatch,
  hasSufficientFunds,
  createMissingKeywordError,
  createInvalidAmountError,
  createInvalidKeywordOrderError,
  createInvalidAccountIdError,
  createSameAccountsError,
  createInvalidDateError,
  createAccountNotFoundError,
  createUnsupportedCurrencyError,
  createCurrencyMismatchError,
  createInsufficientFundsError,
  createMalformedInstructionError,
  createSuccessResponse,
  createPendingTransactionResponse,
  createSuccessfulTransactionResponse,
};
