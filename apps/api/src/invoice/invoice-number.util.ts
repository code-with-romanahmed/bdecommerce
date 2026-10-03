// invoice/invoice-number.util.ts
//
// Invoice.invoiceNumber schema-তে globally @unique (org-scoped না)।
// একটা নতুন sequential counter বানালে সেটাও orderNumber-এর মতোই
// race condition-প্রবণ হতো (যেটা backlog-এ আগেই flag করা আছে)।
// তাই সহজ ও নিরাপদ পথ: Order.id ব্যবহার করা, যেটা ইতিমধ্যেই
// globally unique এবং DB নিজেই guarantee করে (autoincrement) —
// কোনো আলাদা counter/lock লাগে না।

export function buildInvoiceNumber(orderId: number): string {
  return `INV-${orderId.toString().padStart(6, '0')}`;
}
