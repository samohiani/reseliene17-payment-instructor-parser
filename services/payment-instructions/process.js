const { PaymentInstructionsMessages } = require('@app/messages');
const validator = require('@app-core/validator');

const {
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
} = require('./helpers');

const STATUS_CODES = {
  SUCCESSFUL: 'AP00',
  PENDING: 'AP02',
  INVALID_AMOUNT: 'AM01',
  CURRENCY_MISMATCH: 'CU01',
  UNSUPPORTED_CURRENCY: 'CU02',
  INSUFFICIENT_FUNDS: 'AC01',
  SAME_ACCOUNTS: 'AC02',
  ACCOUNT_NOT_FOUND: 'AC03',
  INVALID_ACCOUNT_ID: 'AC04',
  INVALID_DATE_FORMAT: 'DT01',
  MISSING_KEYWORD: 'SY01',
  INVALID_KEYWORD_ORDER: 'SY02',
  MALFORMED_INSTRUCTION: 'SY03',
};

// Currencies we can process (case-insensitive)
const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'GHS'];

// Define what a valid request should look like
const serviceSpec = `root {
  accounts[] {
    id string
    balance number
    currency string
  }
  instruction string
}`;

const parsedServiceSpec = validator.parse(serviceSpec);

// Parse dates in YYYY-MM-DD format, handling leap years
function parseDate(dateStr) {
  if (!dateStr || dateStr.length !== 10) return null;
  if (dateStr[4] !== '-' || dateStr[7] !== '-') return null;

  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  if (month < 1 || month > 12 || day < 1) return null;

  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

  if (isLeapYear) {
    daysInMonth[1] = 29;
  }

  if (day > daysInMonth[month - 1]) return null;

  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

// Get today's date in UTC
function getCurrentUTCDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Split text into words, handling various whitespace characters
function splitByWhitespace(str) {
  if (!str) return [];

  const trimmed = str.trim();
  const result = [];
  let currentWord = '';

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      if (currentWord.length > 0) {
        result.push(currentWord);
        currentWord = '';
      }
    } else {
      currentWord += char;
    }
  }

  if (currentWord.length > 0) {
    result.push(currentWord);
  }

  return result;
}

// Format: DEBIT [amount] [currency] FROM ACCOUNT [account_id] FOR CREDIT TO ACCOUNT [account_id] [ON [date]]
function parseDebitInstruction(words) {
  const amountStr = words[1] || null;
  const currency = words[2] ? words[2].toUpperCase() : null;
  const debitAccount = words[5] || null;
  const creditAccount = words[10] || null;

  // Store what we've parsed so far
  const parsedData = {
    type: 'DEBIT',
    amount: amountStr ? parseInt(amountStr, 10) : null,
    currency,
    debitAccount,
    creditAccount,
    executeBy: null,
  };

  // Need at least 6 words to parse anything meaningful
  if (!hasEnoughWords(words, 6)) {
    return createMissingKeywordError(parsedData, STATUS_CODES);
  }
  if (!amountStr) {
    return createInvalidAmountError(parsedData, amountStr, STATUS_CODES);
  }

  const amount = parseInt(amountStr, 10);

  // Amount must be a positive whole number
  if (!isValidAmount(amountStr)) {
    parsedData.amount = null;
    return createInvalidAmountError(parsedData, amountStr, STATUS_CODES);
  }

  // Check "FROM ACCOUNT" keywords if we have enough words
  if (hasEnoughWords(words, 5) && !hasValidFromAccountKeywords(words)) {
    return createInvalidKeywordOrderError(parsedData, STATUS_CODES);
  }

  // Validate debit account ID format
  if (debitAccount && !isValidAccountId(debitAccount)) {
    return createInvalidAccountIdError(parsedData, true, STATUS_CODES);
  }

  // Check "FOR CREDIT TO ACCOUNT" keywords if we have enough words
  if (hasEnoughWords(words, 10) && !hasValidForCreditToAccountKeywords(words)) {
    return createInvalidKeywordOrderError(parsedData, STATUS_CODES);
  }

  // Validate credit account ID format
  if (creditAccount && !isValidAccountId(creditAccount)) {
    return createInvalidAccountIdError(parsedData, false, STATUS_CODES);
  }

  // Can't transfer money to the same account
  if (debitAccount && creditAccount && areSameAccounts(debitAccount, creditAccount)) {
    return createSameAccountsError(parsedData, STATUS_CODES);
  }

  // Need at least 11 words for a complete instruction
  if (!hasEnoughWords(words, 11)) {
    return createMissingKeywordError(parsedData, STATUS_CODES);
  }

  let executeBy = null;
  let currentIndex = 11;

  // Check for optional future date
  if (hasValidOnDate(words, currentIndex)) {
    currentIndex++;
    if (currentIndex >= words.length) {
      return createInvalidDateError(
        {
          ...parsedData,
          executeBy: null,
        },
        STATUS_CODES
      );
    }

    const dateStr = words[currentIndex];
    const date = parseDate(dateStr);
    if (!date) {
      return createInvalidDateError(
        {
          ...parsedData,
          executeBy: dateStr,
        },
        STATUS_CODES
      );
    }

    executeBy = dateStr;
    currentIndex++;
  }

  if (hasExtraWords(words, currentIndex)) {
    return createInvalidKeywordOrderError(
      {
        ...parsedData,
        executeBy,
      },
      STATUS_CODES
    );
  }

  return createSuccessResponse({
    ...parsedData,
    executeBy,
  });
}

// Format: CREDIT [amount] [currency] TO ACCOUNT [account_id] FOR DEBIT FROM ACCOUNT [account_id] [ON [date]]
function parseCreditInstruction(words) {
  const amountStr = words[1] || null;
  const currency = words[2] ? words[2].toUpperCase() : null;
  const creditAccount = words[5] || null;
  const debitAccount = words[10] || null;

  const parsedData = {
    type: 'CREDIT',
    amount: amountStr ? parseInt(amountStr, 10) : null,
    currency,
    debitAccount,
    creditAccount,
    executeBy: null,
  };

  // Need at least 6 words to parse anything meaningful
  if (!hasEnoughWords(words, 6)) {
    return createMissingKeywordError(parsedData, STATUS_CODES);
  }
  if (!amountStr) {
    return createInvalidAmountError(parsedData, amountStr, STATUS_CODES);
  }

  const amount = parseInt(amountStr, 10);

  // Amount must be a positive whole number
  if (!isValidAmount(amountStr)) {
    parsedData.amount = null;
    return createInvalidAmountError(parsedData, amountStr, STATUS_CODES);
  }

  // Check "TO ACCOUNT" keywords if we have enough words
  if (hasEnoughWords(words, 5) && !hasValidToAccountKeywords(words)) {
    return createInvalidKeywordOrderError(parsedData, STATUS_CODES);
  }

  // Validate credit account ID format
  if (creditAccount && !isValidAccountId(creditAccount)) {
    return createInvalidAccountIdError(parsedData, false, STATUS_CODES);
  }

  // Check "FOR DEBIT FROM ACCOUNT" keywords if we have enough words
  if (hasEnoughWords(words, 10) && !hasValidForDebitFromAccountKeywords(words)) {
    return createInvalidKeywordOrderError(parsedData, STATUS_CODES);
  }

  // Validate debit account ID format
  if (debitAccount && !isValidAccountId(debitAccount)) {
    return createInvalidAccountIdError(parsedData, true, STATUS_CODES);
  }

  // Can't transfer money to the same account
  if (debitAccount && creditAccount && areSameAccounts(debitAccount, creditAccount)) {
    return createSameAccountsError(parsedData, STATUS_CODES);
  }

  // Need at least 11 words for a complete instruction
  if (!hasEnoughWords(words, 11)) {
    return createMissingKeywordError(parsedData, STATUS_CODES);
  }

  let executeBy = null;
  let currentIndex = 11;

  // Check for optional future date
  if (hasValidOnDate(words, currentIndex)) {
    currentIndex++;
    if (currentIndex >= words.length) {
      return createInvalidDateError(
        {
          ...parsedData,
          executeBy: null,
        },
        STATUS_CODES
      );
    }

    const dateStr = words[currentIndex];
    const date = parseDate(dateStr);
    if (!date) {
      return createInvalidDateError(
        {
          ...parsedData,
          executeBy: dateStr,
        },
        STATUS_CODES
      );
    }

    executeBy = dateStr;
    currentIndex++;
  }

  // Make sure no extra words at the end
  if (hasExtraWords(words, currentIndex)) {
    return createInvalidKeywordOrderError(
      {
        ...parsedData,
        executeBy,
      },
      STATUS_CODES
    );
  }

  // Everything looks good
  return createSuccessResponse({
    ...parsedData,
    executeBy,
  });
}

// Execute the actual money transfer between accounts
function processTransaction(parsedData, accounts) {
  // Prepare list of accounts involved in this transaction
  let responseAccounts = [];

  accounts.forEach((account) => {
    if (account.id === parsedData.debitAccount || account.id === parsedData.creditAccount) {
      responseAccounts.push({
        id: account.id,
        balance: account.balance,
        balance_before: account.balance,
        currency: account.currency,
      });
    }
  });

  // Find the actual account objects
  const debitAccountObj = accounts.find((acc) => acc.id === parsedData.debitAccount);
  const creditAccountObj = accounts.find((acc) => acc.id === parsedData.creditAccount);

  // Make sure debit account exists
  if (!debitAccountExists(debitAccountObj)) {
    return createAccountNotFoundError(
      {
        type: parsedData.type,
        amount: parsedData.amount,
        currency: parsedData.currency,
        debitAccount: parsedData.debitAccount,
        creditAccount: parsedData.creditAccount,
        executeBy: parsedData.executeBy,
        accounts: responseAccounts,
      },
      true,
      STATUS_CODES
    );
  }

  // Make sure credit account exists
  if (!creditAccountExists(creditAccountObj)) {
    return createAccountNotFoundError(
      {
        type: parsedData.type,
        amount: parsedData.amount,
        currency: parsedData.currency,
        debitAccount: parsedData.debitAccount,
        creditAccount: parsedData.creditAccount,
        executeBy: parsedData.executeBy,
        accounts: responseAccounts,
      },
      false,
      STATUS_CODES
    );
  }

  // Make sure we support this currency
  if (!isSupportedCurrency(parsedData.currency, SUPPORTED_CURRENCIES)) {
    return createUnsupportedCurrencyError(
      {
        type: parsedData.type,
        amount: parsedData.amount,
        currency: parsedData.currency,
        debitAccount: parsedData.debitAccount,
        creditAccount: parsedData.creditAccount,
        executeBy: parsedData.executeBy,
        accounts: responseAccounts,
      },
      STATUS_CODES
    );
  }

  // Make sure all accounts use the same currency
  if (!currenciesMatch(debitAccountObj, creditAccountObj, parsedData.currency)) {
    return createCurrencyMismatchError(
      {
        type: parsedData.type,
        amount: parsedData.amount,
        currency: parsedData.currency,
        debitAccount: parsedData.debitAccount,
        creditAccount: parsedData.creditAccount,
        executeBy: parsedData.executeBy,
        accounts: responseAccounts,
      },
      STATUS_CODES
    );
  }

  // Make sure debit account has enough money
  if (!hasSufficientFunds(debitAccountObj, parsedData.amount)) {
    return createInsufficientFundsError(
      {
        type: parsedData.type,
        amount: parsedData.amount,
        currency: parsedData.currency,
        debitAccount: parsedData.debitAccount,
        creditAccount: parsedData.creditAccount,
        executeBy: parsedData.executeBy,
        accounts: responseAccounts,
      },
      debitAccountObj,
      STATUS_CODES
    );
  }

  // Determine if transaction executes now or later
  let status = 'successful';
  let statusCode = STATUS_CODES.SUCCESSFUL;
  let statusReason = PaymentInstructionsMessages.TRANSACTION_SUCCESS;

  if (parsedData.executeBy) {
    const executeDate = parseDate(parsedData.executeBy);
    const currentDate = getCurrentUTCDate();

    // Future-dated transactions are pending
    if (isFutureDate(executeDate, currentDate)) {
      status = 'pending';
      statusCode = STATUS_CODES.PENDING;
      statusReason = PaymentInstructionsMessages.TRANSACTION_PENDING;
    }
  }

  // Execute transaction if not pending
  if (status === 'successful') {
    responseAccounts = responseAccounts.map((account) => {
      if (account.id === parsedData.debitAccount) {
        // Remove money from debit account
        return {
          ...account,
          balance_before: account.balance,
          balance: account.balance - parsedData.amount,
        };
      }
      if (account.id === parsedData.creditAccount) {
        return {
          ...account,
          balance_before: account.balance,
          balance: account.balance + parsedData.amount,
        };
      }
      return account;
    });
  }

  // Return final transaction result
  return {
    type: parsedData.type,
    amount: parsedData.amount,
    currency: parsedData.currency,
    debit_account: parsedData.debitAccount,
    credit_account: parsedData.creditAccount,
    execute_by: parsedData.executeBy,
    status,
    status_reason: statusReason,
    status_code: statusCode,
    accounts: responseAccounts,
  };
}

// Main function that figures out if this is a DEBIT or CREDIT instruction
function parseInstruction(instruction) {
  // Must be a string
  if (!instruction || typeof instruction !== 'string') {
    return createMalformedInstructionError(STATUS_CODES);
  }

  // Split into words
  const words = splitByWhitespace(instruction);

  // Need at least 6 words for any valid instruction
  if (!hasEnoughWords(words, 6)) {
    return createMalformedInstructionError(STATUS_CODES);
  }

  // Check first word to determine instruction type
  const firstWord = words[0].toUpperCase();
  if (hasValidFirstWord(firstWord)) {
    if (firstWord === 'DEBIT') {
      return parseDebitInstruction(words);
    }
    if (firstWord === 'CREDIT') {
      return parseCreditInstruction(words);
    }
  }

  // Not a valid instruction type
  return createMalformedInstructionError(STATUS_CODES);
}

// Main service function that ties everything together
async function processTransactionService(serviceData, options = {}) {
  const opts = options;

  // Validate input data matches our expected format
  const data = validator.validate(serviceData, parsedServiceSpec);

  // Extract the instruction and accounts
  const { instruction, accounts } = data;

  // Parse the instruction to make sure it's valid
  const parseResult = parseInstruction(instruction);

  // If parsing failed, return the error
  if (!parseResult.success) {
    const parsedData = parseResult.data || {
      type: null,
      amount: null,
      currency: null,
      debitAccount: null,
      creditAccount: null,
      executeBy: null,
    };

    const errorInfo = parseResult.error || {
      status_reason: PaymentInstructionsMessages.MALFORMED_INSTRUCTION,
      status_code: STATUS_CODES.MALFORMED_INSTRUCTION,
    };

    // Prepare accounts info for error response
    const responseAccounts = [];
    if (parsedData.debitAccount || parsedData.creditAccount) {
      accounts.forEach((account) => {
        if (account.id === parsedData.debitAccount || account.id === parsedData.creditAccount) {
          responseAccounts.push({
            id: account.id,
            balance: account.balance,
            balance_before: account.balance,
            currency: account.currency,
          });
        }
      });
    }

    return {
      type: parsedData.type,
      amount: parsedData.amount,
      currency: parsedData.currency,
      debit_account: parsedData.debitAccount,
      credit_account: parsedData.creditAccount,
      execute_by: parsedData.executeBy,
      status: 'failed',
      status_reason: errorInfo.status_reason,
      status_code: errorInfo.status_code,
      accounts: responseAccounts,
    };
  }

  // Process the transaction
  return processTransaction(parseResult.data, accounts);
}

module.exports = {
  parseInstruction,
  processTransaction,
  processTransactionService,
  STATUS_CODES,
  SUPPORTED_CURRENCIES,
};
