const { expect } = require('chai');
const {
  parseInstruction,
  processTransaction,
} = require('../services/payment-instructions/process');

describe('Payment Instructions Service', () => {
  // Test Cases 1, 3, 4: Valid scenarios
  it('should process DEBIT format successfully', () => {
    const parsedData = {
      type: 'DEBIT',
      amount: 500,
      currency: 'USD',
      debitAccount: 'a',
      creditAccount: 'b',
      executeBy: null,
    };

    const accounts = [
      { id: 'a', balance: 500, currency: 'USD' },
      { id: 'b', balance: 500, currency: 'USD' },
    ];

    const result = processTransaction(parsedData, accounts);

    expect(result.status).to.equal('successful');
    expect(result.accounts).to.have.lengthOf(2);
    expect(result.accounts[0].balance).to.equal(0);
    expect(result.accounts[1].balance).to.equal(1000);
  });

  it('should handle case insensitive keywords', () => {
    const result = parseInstruction('debit 100 gbp from account a for credit to account b');

    expect(result.success).to.equal(true);
    expect(result.data.type).to.equal('DEBIT');
    expect(result.data.amount).to.equal(100);
    expect(result.data.currency).to.equal('GBP');
    expect(result.data.debitAccount).to.equal('a');
    expect(result.data.creditAccount).to.equal('b');
  });

  it('should execute past date immediately', () => {
    const parsedData = {
      type: 'DEBIT',
      amount: 100,
      currency: 'USD',
      debitAccount: 'a',
      creditAccount: 'b',
      executeBy: '2020-01-01',
    };

    const accounts = [
      { id: 'a', balance: 200, currency: 'USD' },
      { id: 'b', balance: 200, currency: 'USD' },
    ];

    const result = processTransaction(parsedData, accounts);

    expect(result.status).to.equal('successful');
    expect(result.accounts).to.have.lengthOf(2);
    expect(result.accounts[0].balance).to.equal(100);
    expect(result.accounts[1].balance).to.equal(300);
  });

  // Test Case 2: Future date (pending)
  it('should mark CREDIT format with future date as pending', () => {
    const parsedData = {
      type: 'CREDIT',
      amount: 300,
      currency: 'USD',
      debitAccount: 'a',
      creditAccount: 'b',
      executeBy: '2099-12-31',
    };

    const accounts = [
      { id: 'a', balance: 500, currency: 'USD' },
      { id: 'b', balance: 500, currency: 'USD' },
    ];

    const result = processTransaction(parsedData, accounts);

    expect(result.status).to.equal('pending');
    expect(result.accounts).to.have.lengthOf(2);
    expect(result.accounts[0].balance).to.equal(500);
    expect(result.accounts[1].balance).to.equal(500);
  });

  // Error Cases (5-12)
  it('should reject currency mismatch with CU01 error', () => {
    const parsedData = {
      type: 'DEBIT',
      amount: 50,
      currency: 'USD',
      debitAccount: 'a',
      creditAccount: 'b',
      executeBy: null,
    };

    const accounts = [
      { id: 'a', balance: 500, currency: 'USD' },
      { id: 'b', balance: 500, currency: 'EUR' },
    ];

    const result = processTransaction(parsedData, accounts);

    expect(result.status).to.equal('failed');
    expect(result.status_code).to.equal('CU01');
  });

  it('should reject insufficient funds with AC01 error', () => {
    const parsedData = {
      type: 'DEBIT',
      amount: 500,
      currency: 'USD',
      debitAccount: 'a',
      creditAccount: 'b',
      executeBy: null,
    };

    const accounts = [
      { id: 'a', balance: 50, currency: 'USD' },
      { id: 'b', balance: 500, currency: 'USD' },
    ];

    const result = processTransaction(parsedData, accounts);

    expect(result.status).to.equal('failed');
    const hasInsufficientFunds = result.status_reason.includes('Insufficient funds');
    expect(hasInsufficientFunds).to.equal(true);
  });

  it('should reject unsupported currency with CU02 error', () => {
    const parsedData = {
      type: 'DEBIT',
      amount: 50,
      currency: 'XYZ',
      debitAccount: 'a',
      creditAccount: 'b',
      executeBy: null,
    };

    const accounts = [
      { id: 'a', balance: 500, currency: 'XYZ' },
      { id: 'b', balance: 500, currency: 'XYZ' },
    ];

    const result = processTransaction(parsedData, accounts);

    expect(result.status).to.equal('failed');
    const hasUnsupportedCurrency = result.status_reason.includes('Unsupported currency');
    expect(hasUnsupportedCurrency).to.equal(true);
  });

  it('should reject same account with AC02 error', () => {
    const result = parseInstruction('DEBIT 100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT a');

    expect(result.success).to.equal(false);
    expect(result.error.status_code).to.equal('AC02');
  });

  it('should reject negative amount with AM01 error', () => {
    const result = parseInstruction('DEBIT -100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b');

    expect(result.success).to.equal(false);
    expect(result.error.status_code).to.equal('AM01');
  });

  it('should reject account not found with AC03 error', () => {
    const parsedData = {
      type: 'DEBIT',
      amount: 100,
      currency: 'USD',
      debitAccount: 'a',
      creditAccount: 'b',
      executeBy: null,
    };

    const accounts = [{ id: 'c', balance: 500, currency: 'USD' }];

    const result = processTransaction(parsedData, accounts);

    expect(result.status).to.equal('failed');
    expect(result.status_code).to.equal('AC03');
  });

  it('should reject decimal amount with AM01 error', () => {
    const result = parseInstruction('DEBIT 100.50 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b');

    expect(result.success).to.equal(false);
    expect(result.error.status_code).to.equal('AM01');
  });

  it('should reject malformed instruction with SY03 error', () => {
    const result = parseInstruction('SEND 100 USD TO ACCOUNT b');

    expect(result.success).to.equal(false);
    expect(result.error.status_code).to.equal('SY03');
  });
});
