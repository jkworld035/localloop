// Legal texts shown in the apps (Profile → Legal) and on the public web pages
// (admin site /legal/*, used as the Play Store and App Store policy URLs).
//
// DRAFT FOR LEGAL REVIEW. Written for an Indian marketplace under the IT Act
// 2000, the Consumer Protection (E-Commerce) Rules 2020 and the Digital
// Personal Data Protection Act 2023, but it is not legal advice: have a lawyer
// check it, and fill in every [bracketed] value in LEGAL_ENTITY before launch.
// docs/launch-checklist.md tracks this.

export const LEGAL_ENTITY = {
  brand: 'LocalLoop',
  operator: '[Registered business name]',
  address: '[Registered office address], Kamareddy, Telangana [PIN]',
  email: '[support email address]',
  phone: '[support phone number]',
  grievanceOfficer: '[Name of Grievance Officer]',
  grievanceEmail: '[grievance email address]',
  effectiveDate: '[Effective date]',
} as const;

export type LegalDocId = 'terms' | 'privacy' | 'refunds' | 'delete-account';
export interface LegalSection {
  heading: string;
  paragraphs: string[];
}
export interface LegalDoc {
  title: string;
  summary: string;
  sections: LegalSection[];
}

const E = LEGAL_ENTITY;
const contact = `${E.operator}, ${E.address}. Email: ${E.email}. Phone: ${E.phone}.`;

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terms: {
    title: 'Terms of Use',
    summary: `The rules for using ${E.brand} as a customer, shop or delivery partner.`,
    sections: [
      {
        heading: 'About LocalLoop',
        paragraphs: [
          `${E.brand} is an online marketplace operated by ${E.operator} (“we”). It lets you order from independent local shops near you and have the order delivered by independent delivery partners. The shop is the seller of every product; we provide the app, take orders and payments on the shop's behalf and arrange delivery.`,
          `By creating an account or placing an order you agree to these terms. You must be at least 18 years old and able to enter a contract under Indian law.`,
        ],
      },
      {
        heading: 'Your account',
        paragraphs: [
          'You sign in with your mobile number and a one-time code. Keep your phone secure — anyone with access to it can use your account. Give accurate details, including your name and delivery address.',
          'We may suspend an account that is used for fraud, abuse of shops, partners or staff, repeated false complaints, or anything unlawful. You can close your account at any time from Profile → Delete account.',
        ],
      },
      {
        heading: 'Orders, prices and payment',
        paragraphs: [
          'Prices, product descriptions, photos and stock are provided by each shop. Prices include GST unless shown otherwise. The delivery fee and any discount are shown before you place the order, together with the total you pay.',
          'An order is a request to the shop. It becomes a contract with the shop when the shop accepts it. A shop may decline an order, for example if an item has run out; you are not charged for declined orders.',
          'You can pay cash on delivery. Where online payment is offered it is processed by a licensed payment provider; we never see or store your card or UPI PIN.',
        ],
      },
      {
        heading: 'Delivery',
        paragraphs: [
          'Delivery times shown in the app are estimates based on the shop’s preparation time and a road route from a mapping service. Traffic, weather and other conditions can change them.',
          'At delivery the partner will ask for the 4-digit delivery code shown in your app. Share it only when you receive your order. Sharing the code confirms that you received the order.',
        ],
      },
      {
        heading: 'Cancellations and refunds',
        paragraphs: ['See our Cancellation & Refund Policy, which forms part of these terms.'],
      },
      {
        heading: 'Shops and delivery partners',
        paragraphs: [
          'Shops must hold the licences their products need (for example FSSAI registration for food), describe products honestly and sell only lawful goods. Medicines needing a prescription, alcohol, tobacco to minors and other restricted goods may not be sold through the app.',
          'Delivery partners are independent and must hold a valid driving licence and vehicle documents where required, follow traffic law and hand over cash collected on delivery as recorded in the app.',
          `Shops and partners also agree to the commission, fee and payout terms shown to them in the app and in their onboarding documents.`,
        ],
      },
      {
        heading: 'Acceptable use',
        paragraphs: [
          'Do not misuse the app: no fake orders, harassment, attempts to break security, scraping, or reviews that are false, abusive or not about a real order.',
        ],
      },
      {
        heading: 'Liability',
        paragraphs: [
          'The shop is responsible for the quality, safety and description of what it sells. We are responsible for running the platform with reasonable care. To the extent the law allows, our liability for any order is limited to the amount paid for that order. Nothing in these terms limits rights you have under the Consumer Protection Act, 2019.',
        ],
      },
      {
        heading: 'Changes, law and disputes',
        paragraphs: [
          'We may update these terms. We will show the new date in the app and, for important changes, tell you before they apply.',
          'These terms are governed by the laws of India. Courts in Telangana have jurisdiction. Please contact us first — most problems are solved quickly through Help & support.',
          `Contact: ${contact} Grievance Officer: ${E.grievanceOfficer}, ${E.grievanceEmail}.`,
        ],
      },
    ],
  },

  privacy: {
    title: 'Privacy Policy',
    summary: 'What personal data we collect, why, who sees it, and your choices.',
    sections: [
      {
        heading: 'Who we are',
        paragraphs: [
          `${E.operator} (“we”) runs ${E.brand} and is the Data Fiduciary for your personal data under the Digital Personal Data Protection Act, 2023. Contact: ${contact}`,
        ],
      },
      {
        heading: 'What we collect',
        paragraphs: [
          'Account: your mobile number, name, optional email, preferred language and role (customer, shop or delivery partner).',
          'Location: the location you choose for finding nearby shops, and saved delivery addresses with a map pin. Shops: the shop’s address and map pin.',
          'Delivery partners: while you are online and during a delivery, your device’s GPS location, including in the background, so orders can be offered to the nearest partner and customers can track their delivery. Location tracking stops when you go offline. We delete detailed location history after 30 days.',
          'Orders: what you ordered, from whom, prices, delivery address, delivery code checks, ratings and reviews, and help requests.',
          'Verification (shops and partners): business details, GSTIN or FSSAI number where given, driving licence and vehicle details, and the document photos you upload.',
          'Payments: payment method and status. Card, bank and UPI details are handled by the payment provider, not stored by us.',
          'Device: a push-notification token and basic technical information needed to deliver notifications and fix problems.',
        ],
      },
      {
        heading: 'Why we use it',
        paragraphs: [
          'To create your account, show nearby shops, take and deliver orders, calculate delivery fees and arrival times, prevent fraud, verify shops and partners, pay shops and partners, answer support requests, send order notifications, and meet legal obligations such as tax records.',
          'We do not sell your personal data and do not use it for third-party advertising.',
        ],
      },
      {
        heading: 'Who can see it',
        paragraphs: [
          'The shop you order from sees your name, the items and your delivery area. The delivery partner sees your name, phone number, delivery address and instructions only for an order they have accepted, until it is delivered. Customers see their partner’s first name, photo, vehicle type and live position only while their order is out for delivery.',
          'Service providers who process data for us: Supabase (database and hosting), Google (maps and route calculation), Expo (push notifications), an SMS provider (sign-in codes) and, where online payment is offered, Razorpay. They may only use the data to provide their service to us.',
          'Authorities, when Indian law requires it.',
        ],
      },
      {
        heading: 'How long we keep it',
        paragraphs: [
          'Account data is kept while your account is open. Detailed partner location history is deleted after 30 days. Order, payment and tax records are kept for as long as Indian tax and accounting law requires; when you delete your account they are kept without your name, phone number or address.',
        ],
      },
      {
        heading: 'Your rights and choices',
        paragraphs: [
          'You can see and correct your details in the app, change your language, and turn off notifications or location permissions in your phone’s settings (some features then stop working). You can delete your account from Profile → Delete account.',
          `You can ask us for a summary of your data, a correction, deletion, or to nominate someone to act for you, and you can withdraw consent at any time, by writing to ${E.grievanceEmail}. Our Grievance Officer is ${E.grievanceOfficer}; we reply within 30 days. If you are not satisfied you may complain to the Data Protection Board of India.`,
        ],
      },
      {
        heading: 'Security and children',
        paragraphs: [
          'Data is encrypted in transit, sessions are stored in your phone’s secure storage, and every database table is protected by access rules so each person sees only their own data. No system is perfectly secure; tell us at once if you suspect misuse of your account.',
          'LocalLoop is not for people under 18, and we do not knowingly collect children’s data.',
        ],
      },
      {
        heading: 'Changes',
        paragraphs: [`We will show the effective date here (${E.effectiveDate}) and tell you in the app about important changes.`],
      },
    ],
  },

  refunds: {
    title: 'Cancellation & Refund Policy',
    summary: 'When you can cancel, and how refunds work.',
    sections: [
      {
        heading: 'Cancelling an order',
        paragraphs: [
          'You can cancel free of charge until the shop accepts your order (Orders → your order → Cancel order).',
          'After the shop accepts, the shop has started preparing your order. Ask through Help & support on the order; we will cancel and refund if the shop has not yet handed it to the delivery partner, or in any case where the shop or partner is at fault.',
          'If a shop declines your order, or we cancel it, you are not charged.',
        ],
      },
      {
        heading: 'Problems with a delivered order',
        paragraphs: [
          'Missing, wrong, damaged or expired items: report them through Help & support on the order within 48 hours of delivery (for chilled and fresh food, on the same day), with a photo where possible.',
          'We will arrange a replacement from the shop or a refund for the affected items, and the delivery fee if the whole order was affected.',
        ],
      },
      {
        heading: 'How refunds are paid',
        paragraphs: [
          'Online payments are refunded to the original payment method; banks usually take 5–7 working days to show it.',
          'Cash-on-delivery orders are refunded by UPI or bank transfer to an account you give us through support, normally within 7 working days of approval.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: [`Help & support in the app, or ${E.email}. Grievance Officer: ${E.grievanceOfficer}, ${E.grievanceEmail}.`],
      },
    ],
  },

  'delete-account': {
    title: 'Delete your LocalLoop account',
    summary: 'How to delete your account and what happens to your data.',
    sections: [
      {
        heading: 'In the app',
        paragraphs: [
          'Open LocalLoop → Profile → Delete account, read the summary and confirm. You need no open orders; delivery partners must first hand over any cash collected on delivery.',
          `If you can no longer open the app, email ${E.email} from any address with the mobile number of the account, and we will confirm by SMS before deleting it.`,
        ],
      },
      {
        heading: 'What is deleted',
        paragraphs: [
          'Your name, phone number, email, photo, saved addresses, wishlist, cart, notifications and device tokens are deleted, your sign-in is removed and any shop you run is taken off the app.',
          'Records of past orders and payments are kept, without your name, phone or address, for as long as Indian tax and accounting law requires. Reviews you wrote stay but no longer show your name. Partner location history is deleted within 30 days.',
        ],
      },
    ],
  },
};
