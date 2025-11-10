const { expect } = require('chai');
const httpMocks = require('node-mocks-http');
const { handler } = require('../endpoints/payment-instructions/Instructions');

describe('Payment Instructions Endpoint', () => {
  // Test Cases 1, 3, 4: Valid scenarios
  it('should handle DEBIT format successfully', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'USD' },
          { id: 'b', balance: 500, currency: 'USD' },
        ],
        instruction: 'DEBIT 500 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(200);
    expect(result.data.status).to.equal('successful');
    expect(result.data.accounts).to.have.lengthOf(2);
    expect(result.data.accounts[0].balance).to.equal(0); // 500 - 500
    expect(result.data.accounts[1].balance).to.equal(1000); // 500 + 500
  });

  it('should handle case insensitive keywords', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'GBP' },
          { id: 'b', balance: 500, currency: 'GBP' },
        ],
        instruction: 'debit 100 gbp from account a for credit to account b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(200);
    expect(result.data.status).to.equal('successful');
    expect(result.data.accounts).to.have.lengthOf(2);
    expect(result.data.accounts[0].balance).to.equal(400); // 500 - 100
    expect(result.data.accounts[1].balance).to.equal(600); // 500 + 100
  });

  it('should execute past date immediately', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 200, currency: 'USD' },
          { id: 'b', balance: 200, currency: 'USD' },
        ],
        instruction: 'CREDIT 100 USD TO ACCOUNT b FOR DEBIT FROM ACCOUNT a ON 2020-01-01',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(200);
    expect(result.data.status).to.equal('successful');
    expect(result.data.accounts).to.have.lengthOf(2);
    expect(result.data.accounts[0].balance).to.equal(100); // 200 - 100
    expect(result.data.accounts[1].balance).to.equal(300); // 200 + 100
  });

  // Test Case 2: Future date (pending)
  it('should handle CREDIT format with future date as pending', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'USD' },
          { id: 'b', balance: 500, currency: 'USD' },
        ],
        instruction: 'CREDIT 200 USD TO ACCOUNT b FOR DEBIT FROM ACCOUNT a ON 2099-12-31',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(200);
    expect(result.data.status).to.equal('pending');
    expect(result.data.accounts).to.have.lengthOf(2);
    expect(result.data.accounts[0].balance).to.equal(500); // Unchanged
    expect(result.data.accounts[1].balance).to.equal(500); // Unchanged
  });

  // Error Cases (5-12)
  it('should reject currency mismatch with CU01 error', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'USD' },
          { id: 'b', balance: 500, currency: 'EUR' },
        ],
        instruction: 'DEBIT 100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('CU01');
  });

  it('should reject insufficient funds with AC01 error', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 50, currency: 'USD' },
          { id: 'b', balance: 500, currency: 'USD' },
        ],
        instruction: 'DEBIT 100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('AC01');
  });

  it('should reject unsupported currency with CU02 error', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'XYZ' },
          { id: 'b', balance: 500, currency: 'XYZ' },
        ],
        instruction: 'DEBIT 100 XYZ FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('CU02');
  });

  it('should reject same account with AC02 error', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [{ id: 'a', balance: 500, currency: 'USD' }],
        instruction: 'DEBIT 100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT a',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('AC02');
  });

  it('should reject negative amount with AM01 error', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'USD' },
          { id: 'b', balance: 500, currency: 'USD' },
        ],
        instruction: 'DEBIT -100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('AM01');
  });

  it('should include parsed values in AM01 error response for negative amount', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'USD' },
          { id: 'b', balance: 500, currency: 'USD' },
        ],
        instruction: 'DEBIT -100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.type).to.equal('DEBIT');
    expect(result.data.amount).to.equal(null); // Amount is null for AM01 error
    expect(result.data.currency).to.equal('USD');
    expect(result.data.debit_account).to.equal('a');
    expect(result.data.credit_account).to.equal('b');
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('AM01');
    expect(result.data.accounts).to.have.lengthOf(2);
    expect(result.data.accounts[0].id).to.equal('a');
    expect(result.data.accounts[1].id).to.equal('b');
  });

  it('should handle the exact scenario from the query correctly', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 230, currency: 'USD' },
          { id: 'b', balance: 300, currency: 'USD' },
        ],
        instruction: 'DEBIT 30 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.type).to.equal('DEBIT');
    expect(result.data.amount).to.equal(30);
    expect(result.data.currency).to.equal('EUR'); // From instruction, not accounts
    expect(result.data.debit_account).to.equal('a');
    expect(result.data.credit_account).to.equal('b');
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_reason).to.include('Unsupported currency');
    expect(result.data.status_code).to.equal('CU02');
    expect(result.data.accounts).to.have.lengthOf(2);
    expect(result.data.accounts[0].id).to.equal('a');
    expect(result.data.accounts[0].balance).to.equal(230);
    expect(result.data.accounts[0].balance_before).to.equal(230);
    expect(result.data.accounts[1].id).to.equal('b');
    expect(result.data.accounts[1].balance).to.equal(300);
    expect(result.data.accounts[1].balance_before).to.equal(300);
  });

  it('should include parsed values in AM01 error response for decimal amount', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'USD' },
          { id: 'b', balance: 500, currency: 'USD' },
        ],
        instruction: 'DEBIT 100.50 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.type).to.equal('DEBIT');
    expect(result.data.amount).to.equal(null); // Amount is null for AM01 error
    expect(result.data.currency).to.equal('USD');
    expect(result.data.debit_account).to.equal('a');
    expect(result.data.credit_account).to.equal('b');
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('AM01');
    expect(result.data.accounts).to.have.lengthOf(2);
    expect(result.data.accounts[0].id).to.equal('a');
    expect(result.data.accounts[1].id).to.equal('b');
  });

  it('should reject account not found with AC03 error', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [{ id: 'c', balance: 500, currency: 'USD' }],
        instruction: 'DEBIT 100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('AC03');
  });

  it('should reject decimal amount with AM01 error', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'USD' },
          { id: 'b', balance: 500, currency: 'USD' },
        ],
        instruction: 'DEBIT 100.50 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('AM01');
  });

  it('should handle completely unparseable instructions correctly', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'USD' },
          { id: 'b', balance: 500, currency: 'USD' },
        ],
        instruction: 'SEND 100 USD TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.type).to.equal(null);
    expect(result.data.amount).to.equal(null);
    expect(result.data.currency).to.equal(null);
    expect(result.data.debit_account).to.equal(null);
    expect(result.data.credit_account).to.equal(null);
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('SY03');
    expect(result.data.accounts).to.have.lengthOf(0);
  });

  it('should handle malformed instruction with missing fields correctly', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'USD' },
          { id: 'b', balance: 500, currency: 'USD' },
        ],
        instruction: 'DEBIT 100 USD FROM ACCOUNT a',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.type).to.equal('DEBIT');
    expect(result.data.amount).to.equal(100);
    expect(result.data.currency).to.equal('USD');
    expect(result.data.debit_account).to.equal('a');
    expect(result.data.credit_account).to.equal(null);
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('MISSING_KEYWORD');
    expect(result.data.accounts).to.have.lengthOf(1);
    expect(result.data.accounts[0].id).to.equal('a');
  });

  it('should reject malformed instruction with SY03 error', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'USD' },
          { id: 'b', balance: 500, currency: 'USD' },
        ],
        instruction: 'SEND 100 USD TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('SY03');
  });

  it('should maintain account order from request when accounts are [b, a, c] and transaction uses a and b', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'b', balance: 200, currency: 'USD' },
          { id: 'a', balance: 100, currency: 'USD' },
          { id: 'c', balance: 300, currency: 'USD' },
        ],
        instruction: 'DEBIT 50 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(200);
    expect(result.data.accounts).to.have.lengthOf(2);
    expect(result.data.accounts[0].id).to.equal('b'); // First in request order
    expect(result.data.accounts[1].id).to.equal('a'); // Second in request order
  });

  it('should handle single account scenario correctly', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [{ id: 'x', balance: 500, currency: 'USD' }],
        instruction: 'DEBIT 100 USD FROM ACCOUNT a FOR CREDIT TO ACCOUNT b',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('AC03');
    expect(result.data.accounts).to.have.lengthOf(0); // Neither account exists in the request
  });

  it('should handle completely unparseable instructions with null values', async () => {
    const mockRequest = httpMocks.createRequest({
      method: 'POST',
      url: '/payment-instructions',
      body: {
        accounts: [
          { id: 'a', balance: 500, currency: 'USD' },
          { id: 'b', balance: 500, currency: 'USD' },
        ],
        instruction: 'INVALID INSTRUCTION',
      },
    });

    const result = await handler(mockRequest, {
      http_statuses: {
        HTTP_200_OK: 200,
        HTTP_400_BAD_REQUEST: 400,
      },
    });

    expect(result.status).to.equal(400);
    expect(result.data.type).to.equal(null);
    expect(result.data.amount).to.equal(null);
    expect(result.data.currency).to.equal(null);
    expect(result.data.debit_account).to.equal(null);
    expect(result.data.credit_account).to.equal(null);
    expect(result.data.status).to.equal('failed');
    expect(result.data.status_code).to.equal('SY03');
    expect(result.data.accounts).to.have.lengthOf(0);
  });
});
