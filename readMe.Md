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

# all junks claud a PENDING --confirm--> CONFIRMED --process--> PROCESSING --ship--> SHIPPED --deliver--> DELIVERED --return--> RETURNED

# rmn.tda claud a sms
# all junk a last claud and ayaan bogura claud
# rmn tda gemeni te ai agent chang korsi confi.ts r service.ts



১. সিকিউরিটি ও ইউজার এক্সপেরিয়েন্স (Security & Authentication)
Social Auth & OTP Login: Google, Facebook OAuth এবং মোবাইল নম্বরে SMS/WhatsApp OTP এর মাধ্যমে দ্রুত লগইন ও রেজিস্ট্রেশন।

Role-Based Access Control (RBAC): Admin, Manager, Support Staff, Customer—কাদের কোন এপিআই-এ এক্সেস থাকবে তা রোলের ওপর ভিত্তি করে নিয়ন্ত্রণ করা।

Rate Limiting / Throttling: বট অ্যাটাক ও Bruteforce ঠেকানোর জন্য নির্দিষ্ট সময়ে নির্দিষ্ট সংখ্যক রিকোয়েস্টের লিমিট রাখা (যেমন: লগইন বা OTP এপিআই-এ মিনিটে সর্বোচ্চ ৫টি রিকোয়েস্ট)।

২. কেনাকাটা ও ক্যাশআউট সহজ করা (Checkout & Payments)
Guest Checkout (গেস্ট অ্যাকাউন্ট): সাইটে একাউন্ট না খুলে বা রেজিস্ট্রেশন না করেই নাম, ফোন নম্বর ও এড্রেস দিয়ে দ্রুত অর্ডার করার সুবিধা রাখা।

Abandoned Cart Recovery API: ইউজার কার্টে আইটেম রেখে চলে গেলে বা পেমেন্ট অসমাপ্ত রাখলে তা ট্র্যাক করা, যাতে পরবর্তীতে SMS বা মেইল দিয়ে রিমাইন্ডার পাঠানো যায়।

Multiple Payment Gateway Support: বিকাশ, নগদ, রকেট, SSLCommerz, এবং Cash on Delivery (COD) একই সাথে ম্যানেজ করার এপিআই।

Partial Payment System: ক্যাশ অন ডেলিভারির সময় ফেক অর্ডার এড়াতে অন্তত কুরিয়ার চার্জটুকু (যেমন: ৮০ বা ১২০ টাকা) অ্যাডভান্স পেমেন্ট নেওয়ার অপশন।

৩. শিপিং ও ডেলিভারি অটোমেশন (Logistics & Courier)
Courier API Integration: বাংলাদেশের জনপ্রিয় কুরিয়ার (Steadfast, Pathao Courier, RedX)-এর সাথে ব্যাকএন্ড সরাসরি ইন্টিগ্রেট করা, যাতে অর্ডার কনফার্ম হলেই স্বয়ংক্রিয়ভাবে ট্র্যাকিং কোড জেনারেট হয়ে যায়।

Delivery Charge Calculation: সিটি ইনসাইড/আউটসাইড বা ওয়েট (Weight) অনুযায়ী ডায়নামিক ডেলিভারি ফি ক্যালকুলেশন।

Real-time Order Tracking: গ্রাহক যেন এপিআই-এর মাধ্যমে তার অর্ডারের বর্তমান কুরিয়ার লাইভ স্ট্যাটাস দেখতে পারে।

৪. সার্চ, ফিল্টারিং ও প্রোডাক্ট এক্সপেরিয়েন্স
Advanced Search & Filtering: কেটাগরি, প্রাইস রেঞ্জ, ব্র্যান্ড, কালার, সাইজ এবং রেটিং অনুযায়ী দ্রুত সার্চ ও ফিল্টার করার এপিআই।

Product Variants & Inventory Management: একই প্রোডাক্টের সাইজ ও কালার অনুযায়ী আলাদা স্টক বজায় রাখা (যেমন: Red-XL ৩টি, Blue-M ৫টি)।

Wishlist & Compare: পছন্দের প্রোডাক্টগুলো উইশলিস্টে রাখা এবং একাধিক প্রোডাক্টের মধ্যে সাইড-বাই-সাইড তুলনা করার ফিচার।

৫. প্রমোশন, ডিসকাউন্ট ও কাস্টমার রিটেনশন
Coupon & Discount Engine: শতাংশ (%), নির্দিষ্ট পরিমাণ (Fixed Amount), অথবা "Buy 1 Get 1" কুপন কোড প্রয়োগ করার ব্যাকএন্ড লজিক।

Reward Points / Loyalty System: প্রতি কেনাকাটায় নির্দিষ্ট পয়েন্ট জমা হওয়া এবং পরবর্তী অর্ডারে সেই পয়েন্ট ক্যাশ ব্যাক হিসেবে ব্যবহার করা।

Flash Sales & Countdown: নির্দিষ্ট সময়ের জন্য ফ্ল্যাশ সেলের স্পেশাল প্রাইসিং ও টাইমার ম্যানেজ করার ব্যাকএন্ড সিস্টেম।

৬. রিপোর্টিং ও অ্যানালিটিক্স (Staff/Admin APIs)
Sales Analytics & Reports: দৈনিক, সাপ্তাহিক বা মাসিক মোট সেলস, রেভিনিউ, শিপিং কস্ট এবং মোস্ট সেলিং প্রোডাক্টের রিপোর্ট এপিআই।

Stock Alert Notification: কোনো প্রোডাক্টের স্টক শেষ হয়ে গেলে বা একটি নির্দিষ্ট সীমার নিচে নামলে অ্যাডমিনকে অ্যালার্ট পাঠানো।

Fraud / Risk Flagging: ভুয়া কাস্টমার বা ফেক অর্ডার চিহ্নিত করার জন্য ফোন নম্বর রিভিউ বা ক্যাশ অন ডেলিভারিতে একের অধিক ক্যান্সেলড হিস্ট্রি থাকলে ফ্ল্যাগ করার সিস্টেম (যা আপনি আপনার AI Agent-এ যুক্ত করেছেন)।

৭. পারফর্মেন্স ও ব্যাকএন্ড অপটিমাইজেশন
Pagination & Field Filtering: প্রোডাক্ট লিস্টে একসঙ্গে সব ডাটা না পাঠিয়ে পেজিনেশন (page=1&limit=20) এবং প্রয়োজনীয় ফিল্ড ফিল্টারিং ব্যবহার করা।

Redis Caching: বারবার ডাটাবেজে হিট না করে হোমপেজের ব্যানার, ক্যাটাগরি বা জনপ্রিয় প্রোডাক্ট ক্যাশ (Cache) থেকে দ্রুত রেসপন্স করা।

Invoices / PDF Generation: অর্ডার সফল হলে এপিআই থেকেই ক্যাশ মেমো বা পিডিএফ ইনভয়েস জেনারেট করে কাস্টমার ও অ্যাডমিনকে পাঠানো।

# ayaan a google auth

# alljuncsk gemini te kisu analysis ase must watch

# pkbromanahmed a pagination last code 05.10.2026