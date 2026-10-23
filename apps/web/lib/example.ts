export const publicationExample = [
  "curl -X POST https://YOUR_API_HOST/v1/events \\",
  '  -H "Authorization: Bearer YOUR_PROJECT_API_KEY" \\',
  '  -H "Content-Type: application/json" \\',
  '  -H "Idempotency-Key: invoice-inv_1024-paid" \\',
  "  -d '{",
  '    "type": "invoice.paid",',
  '    "data": { "invoice_id": "inv_1024" }',
  "  }'",
].join("\n");
