// Push notification copy in English and Telugu. The in-app notification list
// renders the same `type` keys from apps/mobile/translations (notifications.*),
// so keep both in step. Telugu copy should be reviewed by a native speaker
// before launch (see docs/setup.md → "Telugu review").

type Lang = 'en' | 'te';
type Data = Record<string, unknown>;
type Template = { title: (d: Data) => string; body: (d: Data) => string; channel: 'orders' | 'deliveries' | 'account' };

const n = (d: Data) => String(d.order_number ?? '');

const en: Record<string, Template> = {
  order_placed: { channel: 'orders', title: () => 'Order placed', body: (d) => `We've sent order ${n(d)} to the shop.` },
  new_order: { channel: 'orders', title: () => 'New order', body: (d) => `Order ${n(d)} is waiting for you to accept.` },
  order_accepted: { channel: 'orders', title: () => 'Order accepted', body: (d) => `The shop accepted ${n(d)} and will have it ready in about ${d.prep_minutes} min.` },
  order_preparing: { channel: 'orders', title: () => 'Being prepared', body: (d) => `The shop is packing order ${n(d)}.` },
  order_ready: { channel: 'orders', title: () => 'Order ready', body: (d) => `Order ${n(d)} is packed and waiting for pickup.` },
  partner_assigned: { channel: 'orders', title: () => 'Delivery partner assigned', body: (d) => `A delivery partner is heading to the shop for ${n(d)}.` },
  order_picked_up: { channel: 'orders', title: () => 'On the way', body: (d) => `Order ${n(d)} has been picked up. Tap to track it live.` },
  partner_approaching: { channel: 'orders', title: () => 'Almost there', body: (d) => `Your delivery partner is about ${d.minutes} min away. Keep your OTP ready.` },
  order_delivered: { channel: 'orders', title: () => 'Delivered', body: (d) => `Order ${n(d)} was delivered. Thank you for shopping local!` },
  order_cancelled: { channel: 'orders', title: () => 'Order cancelled', body: (d) => `Order ${n(d)} was cancelled.` },
  order_rejected: { channel: 'orders', title: () => 'Order not accepted', body: (d) => `The shop couldn't take order ${n(d)}: ${d.reason ?? ''}`.trim() },
  delivery_request: { channel: 'deliveries', title: () => 'New delivery request', body: (d) => `Pickup from ${d.store_name}. Respond within ${d.expires_in_s} seconds.` },
  assignment_cancelled: { channel: 'deliveries', title: () => 'Delivery cancelled', body: () => 'An assigned delivery was cancelled. No action needed.' },
  no_partner_available: { channel: 'orders', title: () => 'No delivery partner yet', body: (d) => `We couldn't find a partner for ${n(d)}. We'll keep trying — you can also request again.` },
  low_stock: { channel: 'account', title: () => 'Low stock', body: (d) => `${d.product_name} (${d.variant_label}) has ${d.quantity} left.` },
  new_review: { channel: 'account', title: () => 'New review', body: (d) => `A customer rated your shop ${d.rating}★.` },
  vendors_approved: { channel: 'account', title: () => 'Business approved', body: () => 'Your business is verified. You can now list your shop.' },
  vendors_rejected: { channel: 'account', title: () => 'Verification update', body: () => 'We need more details to verify your business. Open the app to see why.' },
  vendors_suspended: { channel: 'account', title: () => 'Account suspended', body: () => 'Your business account is suspended. Contact support.' },
  stores_approved: { channel: 'account', title: () => 'Shop is live', body: () => 'Your shop is now visible to nearby customers.' },
  stores_rejected: { channel: 'account', title: () => 'Shop not approved', body: () => 'Your shop needs changes before it can go live. Open the app to see why.' },
  stores_suspended: { channel: 'account', title: () => 'Shop paused', body: () => 'Your shop has been hidden by LocalLoop. Contact support.' },
  delivery_partners_approved: { channel: 'account', title: () => "You're verified", body: () => 'You can now go online and accept deliveries.' },
  delivery_partners_rejected: { channel: 'account', title: () => 'Verification update', body: () => 'We need more details to verify you. Open the app to see why.' },
  delivery_partners_suspended: { channel: 'account', title: () => 'Account suspended', body: () => 'Your partner account is suspended. Contact support.' },
  payout_sent: { channel: 'account', title: () => 'Payout sent', body: (d) => `We've sent ₹${d.amount} for ${d.orders} orders. Reference: ${d.reference}.` },
  support_reply: { channel: 'account', title: () => 'Support replied', body: (d) => `We've replied to "${d.subject}". Open the app to read it.` },
};

const te: Record<string, Template> = {
  order_placed: { channel: 'orders', title: () => 'ఆర్డర్ చేశారు', body: (d) => `ఆర్డర్ ${n(d)} ను దుకాణానికి పంపించాం.` },
  new_order: { channel: 'orders', title: () => 'కొత్త ఆర్డర్', body: (d) => `ఆర్డర్ ${n(d)} మీ అంగీకారం కోసం ఎదురుచూస్తోంది.` },
  order_accepted: { channel: 'orders', title: () => 'ఆర్డర్ అంగీకరించబడింది', body: (d) => `దుకాణం ${n(d)} ను అంగీకరించింది, సుమారు ${d.prep_minutes} నిమిషాల్లో సిద్ధం చేస్తుంది.` },
  order_preparing: { channel: 'orders', title: () => 'సిద్ధం చేస్తున్నారు', body: (d) => `దుకాణం ఆర్డర్ ${n(d)} ను ప్యాక్ చేస్తోంది.` },
  order_ready: { channel: 'orders', title: () => 'ఆర్డర్ సిద్ధం', body: (d) => `ఆర్డర్ ${n(d)} ప్యాక్ అయి పికప్ కోసం సిద్ధంగా ఉంది.` },
  partner_assigned: { channel: 'orders', title: () => 'డెలివరీ భాగస్వామి కేటాయించబడ్డారు', body: (d) => `${n(d)} కోసం డెలివరీ భాగస్వామి దుకాణానికి వెళ్తున్నారు.` },
  order_picked_up: { channel: 'orders', title: () => 'దారిలో ఉంది', body: (d) => `ఆర్డర్ ${n(d)} పికప్ అయింది. లైవ్‌గా ట్రాక్ చేయడానికి నొక్కండి.` },
  partner_approaching: { channel: 'orders', title: () => 'దాదాపు చేరుకున్నారు', body: (d) => `మీ డెలివరీ భాగస్వామి సుమారు ${d.minutes} నిమిషాల దూరంలో ఉన్నారు. మీ OTP సిద్ధంగా ఉంచండి.` },
  order_delivered: { channel: 'orders', title: () => 'డెలివరీ అయింది', body: (d) => `ఆర్డర్ ${n(d)} డెలివరీ అయింది. స్థానికంగా కొన్నందుకు ధన్యవాదాలు!` },
  order_cancelled: { channel: 'orders', title: () => 'ఆర్డర్ రద్దు', body: (d) => `ఆర్డర్ ${n(d)} రద్దు చేయబడింది.` },
  order_rejected: { channel: 'orders', title: () => 'ఆర్డర్ అంగీకరించబడలేదు', body: (d) => `దుకాణం ఆర్డర్ ${n(d)} ను తీసుకోలేకపోయింది: ${d.reason ?? ''}`.trim() },
  delivery_request: { channel: 'deliveries', title: () => 'కొత్త డెలివరీ అభ్యర్థన', body: (d) => `${d.store_name} నుండి పికప్. ${d.expires_in_s} సెకన్లలో స్పందించండి.` },
  assignment_cancelled: { channel: 'deliveries', title: () => 'డెలివరీ రద్దు', body: () => 'కేటాయించిన డెలివరీ రద్దు అయింది. మీరు ఏమీ చేయనవసరం లేదు.' },
  no_partner_available: { channel: 'orders', title: () => 'ఇంకా డెలివరీ భాగస్వామి దొరకలేదు', body: (d) => `${n(d)} కోసం భాగస్వామి దొరకలేదు. మేము ప్రయత్నిస్తూనే ఉంటాం — మీరు మళ్లీ అభ్యర్థించవచ్చు.` },
  low_stock: { channel: 'account', title: () => 'స్టాక్ తక్కువగా ఉంది', body: (d) => `${d.product_name} (${d.variant_label}) ఇంకా ${d.quantity} మాత్రమే ఉన్నాయి.` },
  new_review: { channel: 'account', title: () => 'కొత్త సమీక్ష', body: (d) => `ఒక కస్టమర్ మీ దుకాణానికి ${d.rating}★ ఇచ్చారు.` },
  vendors_approved: { channel: 'account', title: () => 'వ్యాపారం ఆమోదించబడింది', body: () => 'మీ వ్యాపారం ధృవీకరించబడింది. ఇప్పుడు మీ దుకాణాన్ని జాబితా చేయవచ్చు.' },
  vendors_rejected: { channel: 'account', title: () => 'ధృవీకరణ అప్‌డేట్', body: () => 'మీ వ్యాపారాన్ని ధృవీకరించడానికి మరిన్ని వివరాలు కావాలి. కారణం చూడటానికి యాప్ తెరవండి.' },
  vendors_suspended: { channel: 'account', title: () => 'ఖాతా నిలిపివేయబడింది', body: () => 'మీ వ్యాపార ఖాతా నిలిపివేయబడింది. సపోర్ట్‌ను సంప్రదించండి.' },
  stores_approved: { channel: 'account', title: () => 'దుకాణం లైవ్‌లో ఉంది', body: () => 'మీ దుకాణం ఇప్పుడు దగ్గరలోని కస్టమర్లకు కనిపిస్తోంది.' },
  stores_rejected: { channel: 'account', title: () => 'దుకాణం ఆమోదించబడలేదు', body: () => 'లైవ్‌కు వెళ్లే ముందు మీ దుకాణంలో మార్పులు అవసరం. కారణం చూడటానికి యాప్ తెరవండి.' },
  stores_suspended: { channel: 'account', title: () => 'దుకాణం నిలిపివేయబడింది', body: () => 'LocalLoop మీ దుకాణాన్ని దాచింది. సపోర్ట్‌ను సంప్రదించండి.' },
  delivery_partners_approved: { channel: 'account', title: () => 'మీరు ధృవీకరించబడ్డారు', body: () => 'ఇప్పుడు ఆన్‌లైన్‌కి వెళ్లి డెలివరీలు అంగీకరించవచ్చు.' },
  delivery_partners_rejected: { channel: 'account', title: () => 'ధృవీకరణ అప్‌డేట్', body: () => 'మిమ్మల్ని ధృవీకరించడానికి మరిన్ని వివరాలు కావాలి. కారణం చూడటానికి యాప్ తెరవండి.' },
  delivery_partners_suspended: { channel: 'account', title: () => 'ఖాతా నిలిపివేయబడింది', body: () => 'మీ భాగస్వామి ఖాతా నిలిపివేయబడింది. సపోర్ట్‌ను సంప్రదించండి.' },
  payout_sent: { channel: 'account', title: () => 'చెల్లింపు పంపబడింది', body: (d) => `${d.orders} ఆర్డర్లకు ₹${d.amount} పంపించాం. రిఫరెన్స్: ${d.reference}.` },
  support_reply: { channel: 'account', title: () => 'సపోర్ట్ స్పందించింది', body: (d) => `"${d.subject}" కు మేము స్పందించాం. చదవడానికి యాప్ తెరవండి.` },
};

export const NOTIFICATION_TYPES = Object.keys(en);

export function renderNotification(type: string, data: Data, lang: Lang) {
  const t = (lang === 'te' ? te : en)[type] ?? en[type];
  if (!t) return null;
  return { title: t.title(data), body: t.body(data), channel: t.channel };
}

/** Exposed for the parity test — every English template must have a Telugu one. */
export const __templates = { en, te };
