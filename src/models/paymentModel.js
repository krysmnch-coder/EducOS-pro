const db = require('./db');

async function createPayment({ student_id, secretary_id, amount, currency = 'MGA', description }) {
  // NOTE: This assumes a 'payments' table exists, which is not in the initial migration.
  const [idObj] = await db('payments').insert({
    student_id,
    secretary_id,
    amount,
    currency,
    description
  }).returning('id');
  const id = idObj.id || idObj;
  return { id, student_id, secretary_id, amount, currency, description };
}

function getPaymentsForSecretary(secretaryId) {
  // NOTE: This assumes a 'payments' table exists and joins with the 'users' table.
  return db('payments')
    .select('payments.*', 'users.name as student_name')
    .join('users', 'payments.student_id', 'users.id')
    .where('payments.secretary_id', secretaryId)
    .orderBy('payments.created_at', 'desc');
}

function getPaymentSummaryByMonth(limit = 6) {
  // NOTE: This assumes a 'payments' table exists.
  return db('payments')
    .select(db.raw("strftime('%Y-%m', created_at) as month"))
    .sum('amount as total')
    .groupBy('month')
    .orderBy('month', 'desc')
    .limit(limit)
    .then(rows => rows.reverse());
}

async function getTotalPayments() {
  // NOTE: This assumes a 'payments' table exists.
  const result = await db('payments').sum('amount as total').first();
  return result ? result.total || 0 : 0;
}

module.exports = {
  createPayment,
  getPaymentsForSecretary,
  getPaymentSummaryByMonth,
  getTotalPayments
};
