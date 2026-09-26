### alljuncks gmail ar claud

চিহ্নিত কিন্তু এখনো ফিক্স-না-হওয়া ইস্যু (backlog)
🔴 RBAC guard গ্যাপ বাকি অংশে: InventoryController, ProductController, CustomerController — এখনো শুধু JwtAuthGuard, PermissionGuard/@RequirePermission নেই (Cart-এ ফিক্স হয়ে গেছে, বাকি তিনটায় এখনো বাকি)।
ADMIN/MANAGER global cart access — এখনো টেস্ট করা হয়নি (ঐচ্ছিক, design অনুযায়ী কাজ করার কথা)।
Multi-shop customer identity gap: User.phone globally unique — এক org-এর বেশি shop-এ customer হওয়া কঠিন। বড় unresolved প্রশ্ন।
CashierAssignment race condition: concurrent session-start-এ transaction নেই। unresolved।
Guest cart এখন staff-only — anonymous checkout-এর জন্য আলাদা flow দরকার। unresolved।
Signup/provisioning API নেই — নতুন user শুধু OTP দিয়ে account পায় না, manual provisioning লাগে।
Phone validator bug: সম্ভবত শুধু 017 prefix accept করছে, অন্য valid BD operator prefix (018 ইত্যাদি) reject করছে। ছোট bug।
product.service.ts-এর createVariant: SKU uniqueness চেক organizationId ছাড়া — cross-tenant scope, bug কিনা নিশ্চিত করা দরকার।
Payment race condition: remaining-balance গণনা CAS প্যাটার্নে কিনা যাচাই বাকি।
CreateProductDto-এর categoryId: টাইপ ভ্যালিডেশন (@IsInt, @IsPositive) নেই।
orderNumber retry-detection hardening: string-matching থেকে constraint/sqlState-ভিত্তিক করা।
মূল ফিচার backlog (এখনো শুরু হয়নি)
Customer risk/fraud flagging
Barcode foundation
Invoice generation
বাকি organization/user-দের RBAC seed করা
Discount/shipping/tax logic
এখনো upload/review না-হওয়া ফাইল
notifications/sms.service.ts, notifications.module.ts
prisma/db.ts (ORM wrapper-এর ভেতরটা)
organization মডিউলের ফাইল
নতুন cashier-assignment.* ফাইলগুলো (এই সেশনে কনটেন্ট দেখা হয়নি, শুধু সামারি থেকে জানা)
মূল ফিচার backlog (এখনো শুরু হয়নি)
Customer risk/fraud flagging
Barcode foundation
Invoice generation
বাকি organization/user-দের RBAC seed করা
Discount/shipping/tax logic
এখনো upload/review না-হওয়া ফাইল
notifications/sms.service.ts, notifications.module.ts
prisma/db.ts (ORM wrapper-এর ভেতরটা)
organization মডিউলের ফাইল
নতুন cashier-assignment.* ফাইলগুলো (এই সেশনে কনটেন্ট দেখা হয়নি, শুধু সামারি থেকে জানা)

# pkb SIRAJGONJ AR gpt

আমরা যে জায়গায় আছি, সেখান থেকেই single-business application হিসেবে এগোব।

আর future-এ যদি কখনো তোমার business বড় হয়ে যায় এবং আলাদা company/tenant চালানোর দরকার হয়, তখন architecture-টা সেই capability already রাখবে।

তাই এখন আমার recommendation:

Multi-tenant feature বানাব না, কিন্তু existing organizationId architecture-টা রেখে দেব।

এতে এখনকার development সহজ থাকবে, আবার অকারণে schema rewrite-ও করতে হবে না।

# redis for 8 ai computer a install kora ase

# alljunks a last  ((bulk order api test ta korini))

# Steadfast@123 password