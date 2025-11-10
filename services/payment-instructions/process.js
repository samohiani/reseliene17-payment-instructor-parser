// Payment Instruction Processor
// Parses and executes financial transaction instructions
const { PaymentInstructionsMessages } = require('@app/messages');
const validator = require('@app-core/validator');

// Status codes for different validation and execution outcomes
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

// Supported currency codes (case-insensitive during parsing)
const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'GHS'];

// Validator spec for the service
const serviceSpec = `root {
  accounts[] {
    id string
    balance number
    currency string
  }
  instruction string
}`;

const parsedServiceSpec = validator.parse(serviceSpec);

// Validate account ID format (letters, numbers, hyphens, periods, @ symbols only)
function isValidAccountId(accountId) {
  if (!accountId) return false;

  // Use string manipulation instead
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

// Parse date in YYYY-MM-DD format with enhanced validation including leap years
function parseDate(dateStr) {
  if (!dateStr || dateStr.length !== 10) return null;
  if (dateStr[4] !== '-' || dateStr[7] !== '-') return null;

  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  // Basic validation
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  if (month < 1 || month > 12 || day < 1) return null;

  // Days in each month (non-leap year)
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Check for leap year
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

  // Adjust February for leap years
  if (isLeapYear) {
    daysInMonth[1] = 29;
  }

  // Validate day doesn't exceed days in the month
  if (day > daysInMonth[month - 1]) return null;

  // Create date and verify it matches the input (handles edge cases like invalid dates)
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}

// Get current UTC date (without time component)
function getCurrentUTCDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function splitByWhitespace(str) {
  if (!str) return [];

  // Use string manipulation
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

  // Add the last word if it exists
  if (currentWord.length > 0) {
    result.push(currentWord);
  }

  return result;
}

// Parse DEBIT instruction format:
// DEBIT [amount] [currency] FROM ACCOUNT [account_id] FOR CREDIT TO ACCOUNT [account_id] [ON [date]]
function parseDebitInstruction(words) {
  if (words.length < 11) {
    return {
      success: false,
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.MISSING_KEYWORD,
        status_code: STATUS_CODES.MISSING_KEYWORD,
      },
    };
  }

  const amountStr = words[1];

  // Validate amount string is not empty
  if (!amountStr) {
    return {
      success: false,
      data: {
        type: 'DEBIT',
        amount: null,
        currency: words[2] ? words[2].toUpperCase() : null,
        debitAccount: words[5] || null,
        creditAccount: words[10] || null,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.INVALID_AMOUNT,
        status_code: STATUS_CODES.INVALID_AMOUNT,
      },
    };
  }

  const amount = parseInt(amountStr, 10);
  const currency = words[2] ? words[2].toUpperCase() : null;
  const debitAccount = words[5] || null;
  const creditAccount = words[10] || null;

  // Check that it's a positive integer with no decimal part
  if (Number.isNaN(amount) || amount <= 0 || amount.toString() !== amountStr) {
    return {
      success: false,
      data: {
        type: 'DEBIT',
        amount: null,
        currency,
        debitAccount,
        creditAccount,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.INVALID_AMOUNT,
        status_code: STATUS_CODES.INVALID_AMOUNT,
      },
    };
  }

  // Note: We don't validate supported currencies here since that requires account information, it happens during transaction processing

  // Validate "FROM ACCOUNT" keywords
  if (words[3].toUpperCase() !== 'FROM' || words[4].toUpperCase() !== 'ACCOUNT') {
    return {
      success: false,
      data: {
        type: 'DEBIT',
        amount,
        currency,
        debitAccount,
        creditAccount,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.INVALID_ORDER,
        status_code: STATUS_CODES.INVALID_KEYWORD_ORDER,
      },
    };
  }

  if (!isValidAccountId(debitAccount)) {
    return {
      success: false,
      data: {
        type: 'DEBIT',
        amount,
        currency,
        debitAccount,
        creditAccount,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.DEBIT_ACCOUNT_INVALID,
        status_code: STATUS_CODES.INVALID_ACCOUNT_ID,
      },
    };
  }

  // Validate "FOR CREDIT TO ACCOUNT" keywords
  if (
    words[6].toUpperCase() !== 'FOR' ||
    words[7].toUpperCase() !== 'CREDIT' ||
    words[8].toUpperCase() !== 'TO' ||
    words[9].toUpperCase() !== 'ACCOUNT'
  ) {
    return {
      success: false,
      data: {
        type: 'DEBIT',
        amount,
        currency,
        debitAccount,
        creditAccount,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.INVALID_ORDER,
        status_code: STATUS_CODES.INVALID_KEYWORD_ORDER,
      },
    };
  }

  if (!isValidAccountId(creditAccount)) {
    return {
      success: false,
      data: {
        type: 'DEBIT',
        amount,
        currency,
        debitAccount,
        creditAccount,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.CREDIT_ACCOUNT_INVALID,
        status_code: STATUS_CODES.INVALID_ACCOUNT_ID,
      },
    };
  }

  // Prevent transactions to the same account
  if (debitAccount === creditAccount) {
    return {
      success: false,
      data: {
        type: 'DEBIT',
        amount,
        currency,
        debitAccount,
        creditAccount,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.SAME_ACCOUNTS,
        status_code: STATUS_CODES.SAME_ACCOUNTS,
      },
    };
  }

  let executeBy = null;
  let currentIndex = 11;

  // Check for optional ON date
  if (currentIndex < words.length && words[currentIndex].toUpperCase() === 'ON') {
    currentIndex++;
    if (currentIndex >= words.length) {
      return {
        success: false,
        data: {
          type: 'DEBIT',
          amount,
          currency,
          debitAccount,
          creditAccount,
          executeBy: null,
        },
        error: {
          status: 'failed',
          status_reason: PaymentInstructionsMessages.INVALID_DATE,
          status_code: STATUS_CODES.INVALID_DATE_FORMAT,
        },
      };
    }

    const dateStr = words[currentIndex];
    const date = parseDate(dateStr);
    if (!date) {
      return {
        success: false,
        data: {
          type: 'DEBIT',
          amount,
          currency,
          debitAccount,
          creditAccount,
          executeBy: dateStr,
        },
        error: {
          status: 'failed',
          status_reason: PaymentInstructionsMessages.INVALID_DATE,
          status_code: STATUS_CODES.INVALID_DATE_FORMAT,
        },
      };
    }

    executeBy = dateStr;
    currentIndex++;
  }

  // Ensure no extra words after the instruction
  if (currentIndex < words.length) {
    return {
      success: false,
      data: {
        type: 'DEBIT',
        amount,
        currency,
        debitAccount,
        creditAccount,
        executeBy,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.INVALID_ORDER,
        status_code: STATUS_CODES.INVALID_KEYWORD_ORDER,
      },
    };
  }

  return {
    success: true,
    data: {
      type: 'DEBIT',
      amount,
      currency,
      debitAccount,
      creditAccount,
      executeBy,
    },
  };
}

// Parse CREDIT instruction format:
// CREDIT [amount] [currency] TO ACCOUNT [account_id] FOR DEBIT FROM ACCOUNT [account_id] [ON [date]]
function parseCreditInstruction(words) {
  if (words.length < 11) {
    return {
      success: false,
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.MISSING_KEYWORD,
        status_code: STATUS_CODES.MISSING_KEYWORD,
      },
    };
  }

  // Validate amount is a positive integer (no decimals)
  const amountStr = words[1];

  // Validate amount string is not empty
  if (!amountStr) {
    return {
      success: false,
      data: {
        type: 'CREDIT',
        amount: null,
        currency: words[2] ? words[2].toUpperCase() : null,
        debitAccount: words[10] || null,
        creditAccount: words[5] || null,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.INVALID_AMOUNT,
        status_code: STATUS_CODES.INVALID_AMOUNT,
      },
    };
  }

  const amount = parseInt(amountStr, 10);
  const currency = words[2] ? words[2].toUpperCase() : null;
  const creditAccount = words[5] || null;
  const debitAccount = words[10] || null;

  // Check that it's a positive integer with no decimal part
  if (Number.isNaN(amount) || amount <= 0 || amount.toString() !== amountStr) {
    return {
      success: false,
      data: {
        type: 'CREDIT',
        amount: null,
        currency,
        debitAccount,
        creditAccount,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.INVALID_AMOUNT,
        status_code: STATUS_CODES.INVALID_AMOUNT,
      },
    };
  }

  // Note: We don't validate supported currencies here since that requires account information, it happens during transaction processing

  // Validate "TO ACCOUNT" keywords
  if (words[3].toUpperCase() !== 'TO' || words[4].toUpperCase() !== 'ACCOUNT') {
    return {
      success: false,
      data: {
        type: 'CREDIT',
        amount,
        currency,
        debitAccount,
        creditAccount,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.INVALID_ORDER,
        status_code: STATUS_CODES.INVALID_KEYWORD_ORDER,
      },
    };
  }

  if (!isValidAccountId(creditAccount)) {
    return {
      success: false,
      data: {
        type: 'CREDIT',
        amount,
        currency,
        debitAccount,
        creditAccount,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.CREDIT_ACCOUNT_INVALID,
        status_code: STATUS_CODES.INVALID_ACCOUNT_ID,
      },
    };
  }

  // Validate "FOR DEBIT FROM ACCOUNT" keywords
  if (
    words[6].toUpperCase() !== 'FOR' ||
    words[7].toUpperCase() !== 'DEBIT' ||
    words[8].toUpperCase() !== 'FROM' ||
    words[9].toUpperCase() !== 'ACCOUNT'
  ) {
    return {
      success: false,
      data: {
        type: 'CREDIT',
        amount,
        currency,
        debitAccount,
        creditAccount,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.INVALID_ORDER,
        status_code: STATUS_CODES.INVALID_KEYWORD_ORDER,
      },
    };
  }

  if (!isValidAccountId(debitAccount)) {
    return {
      success: false,
      data: {
        type: 'CREDIT',
        amount,
        currency,
        debitAccount,
        creditAccount,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.DEBIT_ACCOUNT_INVALID,
        status_code: STATUS_CODES.INVALID_ACCOUNT_ID,
      },
    };
  }

  // Prevent transactions to the same account
  if (debitAccount === creditAccount) {
    return {
      success: false,
      data: {
        type: 'CREDIT',
        amount,
        currency,
        debitAccount,
        creditAccount,
        executeBy: null,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.SAME_ACCOUNTS,
        status_code: STATUS_CODES.SAME_ACCOUNTS,
      },
    };
  }

  let executeBy = null;
  let currentIndex = 11;

  // Check for optional ON date
  if (currentIndex < words.length && words[currentIndex].toUpperCase() === 'ON') {
    currentIndex++;
    if (currentIndex >= words.length) {
      return {
        success: false,
        data: {
          type: 'CREDIT',
          amount,
          currency,
          debitAccount,
          creditAccount,
          executeBy: null,
        },
        error: {
          status: 'failed',
          status_reason: PaymentInstructionsMessages.INVALID_DATE,
          status_code: STATUS_CODES.INVALID_DATE_FORMAT,
        },
      };
    }

    const dateStr = words[currentIndex];
    const date = parseDate(dateStr);
    if (!date) {
      return {
        success: false,
        data: {
          type: 'CREDIT',
          amount,
          currency,
          debitAccount,
          creditAccount,
          executeBy: dateStr,
        },
        error: {
          status: 'failed',
          status_reason: PaymentInstructionsMessages.INVALID_DATE,
          status_code: STATUS_CODES.INVALID_DATE_FORMAT,
        },
      };
    }

    executeBy = dateStr;
    currentIndex++;
  }

  // Ensure no extra words after the instruction
  if (currentIndex < words.length) {
    return {
      success: false,
      data: {
        type: 'CREDIT',
        amount,
        currency,
        debitAccount,
        creditAccount,
        executeBy,
      },
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.INVALID_ORDER,
        status_code: STATUS_CODES.INVALID_KEYWORD_ORDER,
      },
    };
  }

  return {
    success: true,
    data: {
      type: 'CREDIT',
      amount,
      currency,
      debitAccount,
      creditAccount,
      executeBy,
    },
  };
}

// Process transaction between accounts
function processTransaction(parsedData, accounts) {
  // Prepare response accounts for all cases - maintain order from request accounts array
  let responseAccounts = [];

  // Add accounts in the order they appear in the request
  accounts.forEach((account) => {
    if (account.id === parsedData.debitAccount || account.id === parsedData.creditAccount) {
      // Create new object instead of modifying parameter
      responseAccounts.push({
        id: account.id,
        balance: account.balance,
        balance_before: account.balance,
        currency: account.currency,
      });
    }
  });

  // Handle account not found errors
  const debitAccountObj = accounts.find((acc) => acc.id === parsedData.debitAccount);
  const creditAccountObj = accounts.find((acc) => acc.id === parsedData.creditAccount);

  if (!debitAccountObj) {
    return {
      type: parsedData.type,
      amount: parsedData.amount,
      currency: parsedData.currency,
      debit_account: parsedData.debitAccount,
      credit_account: parsedData.creditAccount,
      execute_by: parsedData.executeBy,
      status: 'failed',
      status_reason: PaymentInstructionsMessages.DEBIT_ACCOUNT_NOT_FOUND,
      status_code: STATUS_CODES.ACCOUNT_NOT_FOUND,
      accounts: responseAccounts,
    };
  }

  if (!creditAccountObj) {
    return {
      type: parsedData.type,
      amount: parsedData.amount,
      currency: parsedData.currency,
      debit_account: parsedData.debitAccount,
      credit_account: parsedData.creditAccount,
      execute_by: parsedData.executeBy,
      status: 'failed',
      status_reason: PaymentInstructionsMessages.CREDIT_ACCOUNT_NOT_FOUND,
      status_code: STATUS_CODES.ACCOUNT_NOT_FOUND,
      accounts: responseAccounts,
    };
  }

  // Validate currency is supported
  if (!SUPPORTED_CURRENCIES.includes(parsedData.currency)) {
    return {
      type: parsedData.type,
      amount: parsedData.amount,
      currency: parsedData.currency,
      debit_account: parsedData.debitAccount,
      credit_account: parsedData.creditAccount,
      execute_by: parsedData.executeBy,
      status: 'failed',
      status_reason: PaymentInstructionsMessages.UNSUPPORTED_CURRENCY,
      status_code: STATUS_CODES.UNSUPPORTED_CURRENCY,
      accounts: responseAccounts,
    };
  }

  // Validate currency consistency
  if (
    debitAccountObj.currency !== creditAccountObj.currency ||
    debitAccountObj.currency !== parsedData.currency
  ) {
    return {
      type: parsedData.type,
      amount: parsedData.amount,
      currency: parsedData.currency,
      debit_account: parsedData.debitAccount,
      credit_account: parsedData.creditAccount,
      execute_by: parsedData.executeBy,
      status: 'failed',
      status_reason: PaymentInstructionsMessages.CURRENCY_MISMATCH,
      status_code: STATUS_CODES.CURRENCY_MISMATCH,
      accounts: responseAccounts,
    };
  }

  // Validate sufficient funds in debit account
  if (debitAccountObj.balance < parsedData.amount) {
    return {
      type: parsedData.type,
      amount: parsedData.amount,
      currency: parsedData.currency,
      debit_account: parsedData.debitAccount,
      credit_account: parsedData.creditAccount,
      execute_by: parsedData.executeBy,
      status: 'failed',
      status_reason: `${PaymentInstructionsMessages.INSUFFICIENT_FUNDS}: has ${debitAccountObj.balance} ${parsedData.currency}, needs ${parsedData.amount} ${parsedData.currency}`,
      status_code: STATUS_CODES.INSUFFICIENT_FUNDS,
      accounts: responseAccounts,
    };
  }

  // Check if transaction should be executed immediately or scheduled for future
  let status = 'successful';
  let statusCode = STATUS_CODES.SUCCESSFUL;
  let statusReason = PaymentInstructionsMessages.TRANSACTION_SUCCESS;

  if (parsedData.executeBy) {
    const executeDate = parseDate(parsedData.executeBy);
    const currentDate = getCurrentUTCDate();

    // If execution date is in the future, mark as pending
    if (executeDate > currentDate) {
      status = 'pending';
      statusCode = STATUS_CODES.PENDING;
      statusReason = PaymentInstructionsMessages.TRANSACTION_PENDING;
    }
  }

  // Execute transaction if not pending
  if (status === 'successful') {
    // Create a new array with updated balances instead of modifying existing objects
    responseAccounts = responseAccounts.map((account) => {
      if (account.id === parsedData.debitAccount) {
        // Debit account: subtract amount
        return {
          ...account,
          balance_before: account.balance,
          balance: account.balance - parsedData.amount,
        };
      }
      if (account.id === parsedData.creditAccount) {
        // Credit account: add amount
        return {
          ...account,
          balance_before: account.balance,
          balance: account.balance + parsedData.amount,
        };
      }
      return account;
    });
  }

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

// Parse payment instruction (DEBIT or CREDIT format)
function parseInstruction(instruction) {
  if (!instruction || typeof instruction !== 'string') {
    return {
      success: false,
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.MALFORMED_INSTRUCTION,
        status_code: STATUS_CODES.MALFORMED_INSTRUCTION,
      },
    };
  }

  const words = splitByWhitespace(instruction);
  if (words.length < 6) {
    return {
      success: false,
      error: {
        status: 'failed',
        status_reason: PaymentInstructionsMessages.MALFORMED_INSTRUCTION,
        status_code: STATUS_CODES.MALFORMED_INSTRUCTION,
      },
    };
  }

  const firstWord = words[0].toUpperCase();
  if (firstWord === 'DEBIT') {
    return parseDebitInstruction(words);
  }
  if (firstWord === 'CREDIT') {
    return parseCreditInstruction(words);
  }
  return {
    success: false,
    error: {
      status: 'failed',
      status_reason: PaymentInstructionsMessages.MALFORMED_INSTRUCTION,
      status_code: STATUS_CODES.MALFORMED_INSTRUCTION,
    },
  };
}

// Service function that follows the two-parameter constraint
async function processTransactionService(serviceData, options = {}) {
  // eslint-disable-next-line no-unused-vars
  const opts = options; // Mark as used

  // Validate input data first
  const data = validator.validate(serviceData, parsedServiceSpec);

  // Extract the instruction and accounts
  const { instruction, accounts } = data;

  // Parse instruction
  const parseResult = parseInstruction(instruction);

  if (!parseResult.success) {
    // For parsing errors, we may have parsed data even if validation failed
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

    // Prepare accounts with balance_before for error responses
    // Only include the accounts that are involved in the transaction
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
