const { PaymentInstructionsMessages } = require('@app/messages');

// Check if an account ID is valid (allows letters, numbers, hyphens, periods, @)
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

// Check if amount is a valid positive whole number
function isValidAmount(amountStr) {
  if (!amountStr) return false;

  const amount = parseInt(amountStr, 10);
  return !(Number.isNaN(amount) || amount <= 0 || amount.toString() !== amountStr);
}

// Check if instruction has the right "FROM ACCOUNT" keywords
function hasValidFromAccountKeywords(words) {
  return words[3].toUpperCase() === 'FROM' && words[4].toUpperCase() === 'ACCOUNT';
}

// Check if instruction has the right "FOR CREDIT TO ACCOUNT" keywords
function hasValidForCreditToAccountKeywords(words) {
  return (
    words[6].toUpperCase() === 'FOR' &&
    words[7].toUpperCase() === 'CREDIT' &&
    words[8].toUpperCase() === 'TO' &&
    words[9].toUpperCase() === 'ACCOUNT'
  );
}

// Check if instruction has the right "TO ACCOUNT" keywords
function hasValidToAccountKeywords(words) {
  return words[3].toUpperCase() === 'TO' && words[4].toUpperCase() === 'ACCOUNT';
}

// Check if instruction has the right "FOR DEBIT FROM ACCOUNT" keywords
function hasValidForDebitFromAccountKeywords(words) {
  return (
    words[6].toUpperCase() === 'FOR' &&
    words[7].toUpperCase() === 'DEBIT' &&
    words[8].toUpperCase() === 'FROM' &&
    words[9].toUpperCase() === 'ACCOUNT'
  );
}

// Check if both accounts are the same (which is not allowed)
function areSameAccounts(debitAccount, creditAccount) {
  return debitAccount === creditAccount;
}

// Check if there's a valid date after the ON keyword
function hasValidOnDate(words, currentIndex) {
  return currentIndex < words.length && words[currentIndex].toUpperCase() === 'ON';
}

// Check if there are extra words at the end (which is not allowed)
function hasExtraWords(words, currentIndex) {
  return currentIndex < words.length;
}

// Check if instruction has enough words to be valid
function hasEnoughWords(words, minLength) {
  return words.length >= minLength;
}

// Check if first word is DEBIT or CREDIT
function hasValidFirstWord(firstWord) {
  return firstWord === 'DEBIT' || firstWord === 'CREDIT';
}

// Check if a date is in the future
function isFutureDate(executeDate, currentDate) {
  return executeDate > currentDate;
}

// Check if debit account exists in the accounts list
function debitAccountExists(debitAccountObj) {
  return !!debitAccountObj;
}

// Check if credit account exists in the accounts list
function creditAccountExists(creditAccountObj) {
  return !!creditAccountObj;
}

// Check if currency is one we support
function isSupportedCurrency(currency, supportedCurrencies) {
  return supportedCurrencies.includes(currency);
}

// Check if all accounts and instruction use the same currency
function currenciesMatch(debitAccountObj, creditAccountObj, instructionCurrency) {
  return (
    debitAccountObj.currency === creditAccountObj.currency &&
    debitAccountObj.currency === instructionCurrency
  );
}

// Check if debit account has enough money
function hasSufficientFunds(debitAccountObj, amount) {
  return debitAccountObj.balance >= amount;
}

// Create response when required keywords are missing
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

// Create response when amount is not valid
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

// Create response when keywords are in wrong order
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

// Create response when account ID format is wrong
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

// Create response when both accounts are the same
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

// Create response when date format is wrong
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

// Create response when account is not found
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

// Create response when currency is not supported
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

// Create response when accounts use different currencies
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

// Create response when not enough money in debit account
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

// Create successful parsing response
function createSuccessResponse(data) {
  return {
    success: true,
    data,
  };
}

// Create response for future-dated transactions
function createPendingTransactionResponse(data, STATUS_CODES) {
  return {
    ...data,
    status: 'pending',
    status_code: STATUS_CODES.PENDING,
    status_reason: PaymentInstructionsMessages.TRANSACTION_PENDING,
  };
}

// Create response for successful transactions
function createSuccessfulTransactionResponse(data, STATUS_CODES) {
  return {
    ...data,
    status: 'successful',
    status_code: STATUS_CODES.SUCCESSFUL,
    status_reason: PaymentInstructionsMessages.TRANSACTION_SUCCESS,
  };
}

// Create response for completely wrong instructions
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
